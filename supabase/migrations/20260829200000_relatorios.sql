-- ============================================================
-- Sprint 7 — Relatórios e espelho de ponto
--
-- Começa corrigindo um defeito da Sprint 5 que só aparece aqui: numa jornada
-- 22:00–06:00, a entrada cai no dia X e a saída no dia X+1, porque work_date
-- vinha do relógio. O relatório então veria "entrada sem saída" num dia e
-- "saída sem entrada" no outro, e as horas sumiriam das duas contas.
-- ============================================================

-- ------------------------------------------------------------
-- Tolerância de atraso, por empresa
-- ------------------------------------------------------------
-- Cinco minutos de atraso não é atraso em lugar nenhum do mundo real. Sem
-- tolerância, o relatório vira uma lista de infrações que ninguém lê.
alter table public.companies
  add column if not exists late_tolerance_minutes integer not null default 10
    check (late_tolerance_minutes between 0 and 60);

-- ------------------------------------------------------------
-- A que dia de trabalho a batida pertence
-- ------------------------------------------------------------
-- Regra: é o dia do relógio, EXCETO quando o dia anterior tem um turno em
-- aberto (entrada ou intervalo sem fechamento). Aí a batida continua aquele
-- dia. A janela de 16h evita colar dias distantes quando alguém simplesmente
-- esqueceu de bater a saída.
create or replace function public.punch_work_date(
  p_membership_id uuid,
  p_quando        timestamptz,
  p_timezone      text
)
returns date
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_dia      date := (p_quando at time zone p_timezone)::date;
  v_anterior date := v_dia - 1;
  v_ultimo   public.punch_type;
  v_quando_ultimo timestamptz;
begin
  v_ultimo := public.last_punch_of_day(p_membership_id, v_anterior);

  if v_ultimo in ('entrada','intervalo_inicio','intervalo_fim') then
    select max(p.punched_at) into v_quando_ultimo
    from public.punches p
    where p.membership_id = p_membership_id
      and p.work_date = v_anterior
      and not p.voided;

    if v_quando_ultimo is not null
       and p_quando - v_quando_ultimo < interval '16 hours' then
      return v_anterior;
    end if;
  end if;

  return v_dia;
end;
$$;

revoke all on function public.punch_work_date(uuid, timestamptz, text) from public, anon;
grant execute on function public.punch_work_date(uuid, timestamptz, text) to authenticated, service_role;

-- register_punch reescrita para usar a regra acima.
create or replace function public.register_punch(
  p_membership_id uuid,
  p_type          public.punch_type,
  p_lat           double precision default null,
  p_lng           double precision default null,
  p_accuracy_m    integer default null,
  p_punched_at    timestamptz default null,
  p_selfie_path   text default null
)
returns table (
  punch_id   uuid,
  distance_m integer,
  verified   boolean,
  work_date  date,
  atrasado   boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_m          public.memberships%rowtype;
  v_tz         text;
  v_quando     timestamptz;
  v_dia        date;
  v_loc        public.locations%rowtype;
  v_dist       double precision;
  v_permitidos public.punch_type[];
  v_atrasado   boolean := false;
  v_id         uuid;
begin
  select * into v_m from public.memberships where id = p_membership_id;
  if not found or v_m.status <> 'ativo' then
    raise exception 'Vínculo inativo ou inexistente'
      using errcode = 'insufficient_privilege';
  end if;

  select timezone into v_tz from public.companies where id = v_m.company_id;

  v_quando := coalesce(p_punched_at, now());
  if v_quando > now() + interval '2 minutes' then
    raise exception 'Horário no futuro' using errcode = 'check_violation';
  end if;
  if v_quando < now() - interval '24 hours' then
    raise exception 'Batida antiga demais para sincronizar. Peça um ajuste ao gestor.'
      using errcode = 'check_violation';
  end if;
  v_atrasado := v_quando < now() - interval '2 minutes';

  -- Aqui está a mudança: o dia de trabalho pode ser o de ontem.
  v_dia := public.punch_work_date(p_membership_id, v_quando, v_tz);

  select l.* into v_loc
  from public.resolved_schedule(v_m.company_id, v_dia, v_dia) r
  join public.locations l on l.id = r.location_id
  where r.membership_id = p_membership_id
  limit 1;

  if v_loc.id is null then
    select * into v_loc
    from public.locations
    where company_id = v_m.company_id and active
    limit 2;

    if (select count(*) from public.locations
        where company_id = v_m.company_id and active) > 1 then
      raise exception 'Mais de uma unidade ativa e nenhuma definida na escala deste dia'
        using errcode = 'check_violation';
    end if;
  end if;

  if v_loc.id is null then
    raise exception 'Nenhuma unidade cadastrada para validar o ponto'
      using errcode = 'check_violation';
  end if;

  if v_loc.require_selfie and (p_selfie_path is null or btrim(p_selfie_path) = '') then
    raise exception 'Esta unidade exige foto no registro de ponto'
      using errcode = 'check_violation';
  end if;

  v_permitidos := public.allowed_punch_types(p_membership_id, v_dia);
  if not (p_type = any(v_permitidos)) then
    raise exception 'Sequência inválida: depois de % não cabe %',
      coalesce(public.last_punch_of_day(p_membership_id, v_dia)::text, 'nada'), p_type
      using errcode = 'check_violation';
  end if;

  if v_loc.method <> 'wifi' then
    if p_lat is null or p_lng is null then
      raise exception 'Sem localização não é possível registrar o ponto'
        using errcode = 'check_violation';
    end if;

    if p_accuracy_m is not null and p_accuracy_m > v_loc.radius_m then
      raise exception 'GPS impreciso demais (± % m para um raio de % m). Vá para um lugar aberto e tente de novo.',
        p_accuracy_m, v_loc.radius_m
        using errcode = 'check_violation';
    end if;

    v_dist := public.haversine_m(v_loc.lat, v_loc.lng, p_lat, p_lng);

    if v_dist > v_loc.radius_m then
      raise exception 'Você está a % m da unidade, fora do raio de % m',
        round(v_dist)::int, v_loc.radius_m
        using errcode = 'check_violation';
    end if;
  end if;

  insert into public.punches
    (company_id, membership_id, location_id, type, punched_at, work_date,
     origin, lat, lng, accuracy_m, distance_m, verified, verify_method,
     selfie_path, sincronizado_em, created_by)
  values
    (v_m.company_id, p_membership_id, v_loc.id, p_type, v_quando, v_dia,
     'app', p_lat, p_lng, p_accuracy_m, round(v_dist)::int, true, v_loc.method,
     nullif(btrim(p_selfie_path), ''),
     case when v_atrasado then now() end, v_m.user_id)
  returning id into v_id;

  insert into public.audit_log (company_id, actor, action, target, meta)
  values (v_m.company_id, v_m.user_id, 'punch.register', v_id::text,
          jsonb_build_object('tipo', p_type, 'dia', v_dia,
                             'distancia_m', round(coalesce(v_dist, 0))::int,
                             'atrasado', v_atrasado));

  return query select v_id, round(coalesce(v_dist, 0))::int, true, v_dia, v_atrasado;
end;
$$;

revoke all on function public.register_punch(uuid, public.punch_type, double precision, double precision, integer, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.register_punch(uuid, public.punch_type, double precision, double precision, integer, timestamptz, text)
  to service_role;

-- ============================================================
-- MINUTOS TRABALHADOS NUM DIA
-- ============================================================
-- Percorre as batidas efetivas em ordem e soma o tempo dentro do turno,
-- descontando os intervalos batidos.
create or replace function public.worked_minutes(
  p_membership_id uuid,
  p_work_date     date
)
returns table (
  trabalhado_min integer,
  intervalo_min  integer,
  primeira       timestamptz,
  ultima         timestamptz,
  turno_aberto   boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  r              record;
  v_entrada      timestamptz;
  v_ini_intervalo timestamptz;
  v_trabalhado   integer := 0;
  v_intervalo    integer := 0;
  v_primeira     timestamptz;
  v_ultima       timestamptz;
begin
  for r in
    select p.type, p.punched_at
    from public.punches p
    where p.membership_id = p_membership_id
      and p.work_date = p_work_date
      and not p.voided
      and not exists (select 1 from public.punches s where s.replaces_punch_id = p.id)
    order by p.punched_at, p.created_at
  loop
    if v_primeira is null then v_primeira := r.punched_at; end if;
    v_ultima := r.punched_at;

    if r.type = 'entrada' then
      v_entrada := r.punched_at;

    elsif r.type = 'saida' and v_entrada is not null then
      v_trabalhado := v_trabalhado
        + (extract(epoch from (r.punched_at - v_entrada)) / 60)::integer;
      -- Sair com o intervalo aberto: conta o que se passou até aqui.
      if v_ini_intervalo is not null then
        v_intervalo := v_intervalo
          + (extract(epoch from (r.punched_at - v_ini_intervalo)) / 60)::integer;
        v_ini_intervalo := null;
      end if;
      v_entrada := null;

    elsif r.type = 'intervalo_inicio' then
      v_ini_intervalo := r.punched_at;

    elsif r.type = 'intervalo_fim' and v_ini_intervalo is not null then
      v_intervalo := v_intervalo
        + (extract(epoch from (r.punched_at - v_ini_intervalo)) / 60)::integer;
      v_ini_intervalo := null;
    end if;
  end loop;

  return query select
    greatest(v_trabalhado - v_intervalo, 0),
    v_intervalo,
    v_primeira,
    v_ultima,
    v_entrada is not null;   -- ficou entrada sem saída
end;
$$;

revoke all on function public.worked_minutes(uuid, date) from public, anon;
grant execute on function public.worked_minutes(uuid, date) to authenticated;

-- ============================================================
-- RELATÓRIO DIA A DIA
-- ============================================================
create type public.day_status as enum
  ('trabalhado','falta','ausencia','folga','sem_escala','em_aberto');

create or replace function public.daily_report(
  p_company_id uuid,
  p_from       date,
  p_to         date
)
returns table (
  dia              date,
  membership_id    uuid,
  full_name        text,
  situacao         public.day_status,
  shift_label      text,
  previsto_min     integer,
  trabalhado_min   integer,
  intervalo_min    integer,
  intervalo_presumido boolean,
  entrada_prevista timestamptz,
  entrada_real     timestamptz,
  saida_real       timestamptz,
  atraso_min       integer,
  turno_aberto     boolean,
  ausencia_tipo    public.absence_kind,
  tem_ajuste       boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with tz as (
    select timezone, late_tolerance_minutes
    from public.companies where id = p_company_id
  ),
  dias as (
    select d::date as dia from generate_series(p_from, p_to, interval '1 day') d
  ),
  pessoas as (
    select m.id, m.full_name, m.user_id
    from public.memberships m
    where m.company_id = p_company_id and m.status = 'ativo'
      and (public.auth_role(p_company_id) in ('dono','gerente')
           or m.user_id = auth.uid())
  ),
  escala as (
    select r.work_date, r.membership_id, r.shift_label, r.start_time,
           r.end_time, r.break_minutes, r.origem
    from public.resolved_schedule(p_company_id, p_from, p_to) r
  ),
  faltas as (
    select a.membership_id, a.dia, a.kind
    from public.absences_in_range(p_company_id, p_from, p_to) a
  )
  select
    dias.dia,
    p.id,
    p.full_name,
    case
      when w.primeira is not null and w.turno_aberto then 'em_aberto'
      when w.primeira is not null                    then 'trabalhado'
      when f.kind is not null                        then 'ausencia'
      when e.origem = 'folga' or e.origem is null    then
        case when e.origem = 'folga' then 'folga' else 'sem_escala' end
      else 'falta'
    end::public.day_status,
    e.shift_label,
    case when e.start_time is not null
         then public.shift_duration_minutes(e.start_time, e.end_time) - e.break_minutes
         else 0 end,
    -- Intervalo previsto e nao batido e DESCONTADO mesmo assim. O intervalo e
    -- obrigatorio; nao descontar transformaria o esquecimento de bater numa
    -- hora extra automatica, todo dia, para todo mundo.
    greatest(
      coalesce(w.trabalhado_min, 0)
      - case when coalesce(w.intervalo_min, 0) = 0
                  and coalesce(e.break_minutes, 0) > 0
                  and coalesce(w.trabalhado_min, 0) > 0
             then e.break_minutes else 0 end,
      0),
    coalesce(w.intervalo_min, 0),
    -- Marca que o desconto veio de presuncao, nao de batida: o numero na tela
    -- precisa poder ser explicado.
    (coalesce(w.intervalo_min, 0) = 0
     and coalesce(e.break_minutes, 0) > 0
     and coalesce(w.trabalhado_min, 0) > 0),
    -- Horário previsto de entrada, no fuso da empresa.
    case when e.start_time is not null
         then ((dias.dia + e.start_time) at time zone (select timezone from tz))
         else null end,
    w.primeira,
    case when w.turno_aberto then null else w.ultima end,
    -- Atraso só existe com turno previsto e entrada registrada, e só conta
    -- acima da tolerância da empresa.
    case
      when e.start_time is null or w.primeira is null then null
      else greatest(
        (extract(epoch from (
           w.primeira - ((dias.dia + e.start_time) at time zone (select timezone from tz))
         )) / 60)::integer - (select late_tolerance_minutes from tz),
        0)
    end,
    coalesce(w.turno_aberto, false),
    f.kind,
    exists (
      select 1 from public.punches pa
      where pa.membership_id = p.id and pa.work_date = dias.dia
        and pa.origin = 'ajuste_manual' and not pa.voided
        and not exists (select 1 from public.punches s where s.replaces_punch_id = pa.id)
    )
  from dias
  cross join pessoas p
  left join escala e on e.membership_id = p.id and e.work_date = dias.dia
  left join faltas f on f.membership_id = p.id and f.dia = dias.dia
  left join lateral public.worked_minutes(p.id, dias.dia) w on true
  where p_company_id in (select public.auth_company_ids())
  order by dias.dia, p.full_name;
$$;

revoke all on function public.daily_report(uuid, date, date) from public, anon;
grant execute on function public.daily_report(uuid, date, date) to authenticated;

-- ============================================================
-- RESUMO DO PERÍODO
-- ============================================================
create or replace function public.period_report(
  p_company_id uuid,
  p_from       date,
  p_to         date
)
returns table (
  membership_id   uuid,
  full_name       text,
  dias_previstos  integer,
  dias_trabalhados integer,
  faltas          integer,
  ausencias       integer,
  previsto_min    integer,
  trabalhado_min  integer,
  saldo_min       integer,
  atrasos         integer,
  atraso_total_min integer,
  dias_em_aberto  integer,
  dias_com_ajuste integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    d.membership_id,
    d.full_name,
    count(*) filter (where d.previsto_min > 0)::integer,
    count(*) filter (where d.situacao in ('trabalhado','em_aberto'))::integer,
    count(*) filter (where d.situacao = 'falta')::integer,
    count(*) filter (where d.situacao = 'ausencia')::integer,
    coalesce(sum(d.previsto_min), 0)::integer,
    coalesce(sum(d.trabalhado_min), 0)::integer,
    -- Saldo desconsidera dia de ausência justificada: atestado não vira
    -- dívida de horas.
    coalesce(sum(
      case when d.situacao = 'ausencia' then 0
           else d.trabalhado_min - d.previsto_min end
    ), 0)::integer,
    count(*) filter (where coalesce(d.atraso_min, 0) > 0)::integer,
    coalesce(sum(d.atraso_min), 0)::integer,
    count(*) filter (where d.situacao = 'em_aberto')::integer,
    count(*) filter (where d.tem_ajuste)::integer
  from public.daily_report(p_company_id, p_from, p_to) d
  group by d.membership_id, d.full_name
  order by d.full_name;
$$;

revoke all on function public.period_report(uuid, date, date) from public, anon;
grant execute on function public.period_report(uuid, date, date) to authenticated;
