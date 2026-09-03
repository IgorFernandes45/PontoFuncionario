-- ============================================================
-- Correção: o ponto quebrava quando a empresa tinha mais de uma unidade
--
-- register_punch roda com service_role, onde `auth.uid()` é NULL. Ela
-- procurava a unidade do dia chamando resolved_schedule(), que filtra por
-- sessão — e sem sessão a função devolve ZERO linhas. Resultado: nunca
-- achava a unidade da escala, caía no fallback "qual é a única unidade?" e,
-- com duas cadastradas, recusava a batida com
-- "Mais de uma unidade ativa e nenhuma definida na escala deste dia".
--
-- Passou despercebido porque todo teste anterior tinha uma unidade só.
--
-- A correção separa as duas perguntas: "o que esta sessão pode ver" (que é
-- assunto de resolved_schedule) e "onde esta pessoa trabalha neste dia" (que
-- é fato, e não depende de quem pergunta).
-- ============================================================

create or replace function public.scheduled_location_of(
  p_membership_id uuid,
  p_dia           date
)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- Mesma precedência de resolved_schedule: a avulsa do dia ganha da fixa do
  -- dia-da-semana. Sem o filtro de visibilidade, porque aqui não se está
  -- respondendo a ninguém — está se estabelecendo um fato.
  select coalesce(av.location_id, fx.location_id)
  from (select 1) _
  left join public.schedule_entries av
    on av.membership_id = p_membership_id and av.work_date = p_dia
  left join public.schedule_entries fx
    on fx.membership_id = p_membership_id
   and fx.weekday = extract(dow from p_dia)::smallint
  -- Uma avulsa de folga (shift_key nulo) ainda assim vence a fixa; nesse
  -- caso não há unidade, e quem chama decide o que fazer.
  where av.id is not null or fx.id is not null
  limit 1;
$$;

revoke all on function public.scheduled_location_of(uuid, date) from public, anon;
grant execute on function public.scheduled_location_of(uuid, date)
  to authenticated, service_role;

-- ------------------------------------------------------------
-- register_punch: usa o fato, não a visão da sessão
-- ------------------------------------------------------------
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
  v_loc_id     uuid;
  v_loc        public.locations%rowtype;
  v_dist       double precision;
  v_permitidos public.punch_type[];
  v_atrasado   boolean := false;
  v_ativas     integer;
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

  v_dia := public.punch_work_date(p_membership_id, v_quando, v_tz);

  -- A unidade da escala do dia.
  v_loc_id := public.scheduled_location_of(p_membership_id, v_dia);

  if v_loc_id is null then
    select count(*) into v_ativas
    from public.locations where company_id = v_m.company_id and active;

    if v_ativas = 1 then
      select id into v_loc_id
      from public.locations where company_id = v_m.company_id and active;
    elsif v_ativas > 1 then
      raise exception 'Sem escala para hoje e a empresa tem mais de uma unidade. Peça a quem administra para definir onde você trabalha neste dia.'
        using errcode = 'check_violation';
    end if;
  end if;

  if v_loc_id is null then
    raise exception 'Nenhuma unidade cadastrada para validar o ponto'
      using errcode = 'check_violation';
  end if;

  select * into v_loc from public.locations where id = v_loc_id;

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
      raise exception 'Você está a % m da unidade %, fora do raio de % m',
        round(v_dist)::int, v_loc.name, v_loc.radius_m
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

-- ------------------------------------------------------------
-- my_punch_state: mesma fonte, para a tela não discordar do servidor
-- ------------------------------------------------------------
create or replace function public.my_punch_state(p_company_id uuid)
returns table (
  membership_id  uuid,
  work_date      date,
  ultimo_tipo    public.punch_type,
  ultimo_em      timestamptz,
  permitidos     public.punch_type[],
  location_name  text,
  location_lat   double precision,
  location_lng   double precision,
  radius_m       integer,
  require_selfie boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_m      public.memberships%rowtype;
  v_tz     text;
  v_dia    date;
  v_loc_id uuid;
  v_loc    public.locations%rowtype;
  v_ativas integer;
begin
  select * into v_m from public.memberships
  where company_id = p_company_id and user_id = auth.uid() and status = 'ativo';

  if not found then
    return;
  end if;

  select timezone into v_tz from public.companies where id = p_company_id;
  v_dia := (now() at time zone v_tz)::date;

  v_loc_id := public.scheduled_location_of(v_m.id, v_dia);

  if v_loc_id is null then
    select count(*) into v_ativas
    from public.locations where company_id = p_company_id and active;
    if v_ativas = 1 then
      select id into v_loc_id
      from public.locations where company_id = p_company_id and active;
    end if;
  end if;

  select * into v_loc from public.locations where id = v_loc_id;

  return query
  select v_m.id, v_dia,
         public.last_punch_of_day(v_m.id, v_dia),
         (select max(p.punched_at) from public.punches p
           where p.membership_id = v_m.id and p.work_date = v_dia and not p.voided),
         public.allowed_punch_types(v_m.id, v_dia),
         v_loc.name, v_loc.lat, v_loc.lng, v_loc.radius_m,
         coalesce(v_loc.require_selfie, false);
end;
$$;

revoke all on function public.my_punch_state(uuid) from public, anon;
grant execute on function public.my_punch_state(uuid) to authenticated;
