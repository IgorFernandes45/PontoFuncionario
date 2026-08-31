-- ============================================================
-- Sprint 5 — Ponto eletrônico
--
-- Duas regras que valem acima de tudo:
--
-- 1. O CLIENTE NÃO ESCREVE. Não existe policy de INSERT em `punches` para
--    `authenticated`. Quem grava é register_punch(), executável apenas por
--    service_role, e ela recalcula tudo — o payload do cliente é dado bruto,
--    nunca decisão.
-- 2. APPEND-ONLY. Sem update, sem delete. Correção vira registro novo na
--    Sprint 6. Exigência da Portaria 671/2021, não preferência de modelagem.
-- ============================================================

create type public.punch_type   as enum ('entrada','saida','intervalo_inicio','intervalo_fim');
create type public.punch_origin as enum ('app','ajuste_manual','importacao');

create table public.punches (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  membership_id uuid not null references public.memberships(id) on delete cascade,
  location_id   uuid references public.locations(id),

  type          public.punch_type   not null,
  punched_at    timestamptz not null,
  -- Data local da empresa. Guardada porque a sequência do dia e o relatório
  -- raciocinam em dia de calendário, e derivar isso a cada consulta faria a
  -- resposta depender do fuso de quem pergunta.
  work_date     date not null,

  origin        public.punch_origin not null default 'app',

  lat           double precision,
  lng           double precision,
  accuracy_m    integer,     -- precisão que o aparelho informou
  distance_m    integer,     -- distância calculada NO SERVIDOR
  wifi_ssid     text,

  verified      boolean not null default false,
  verify_method public.punch_method,
  selfie_path   text,

  -- Batida que subiu depois, de uma fila offline.
  sincronizado_em timestamptz,

  -- Sprint 6: correção. Um punch é EFETIVO quando nenhum outro o substitui.
  replaces_punch_id uuid references public.punches(id),
  voided        boolean not null default false,
  justification text,

  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default clock_timestamp(),

  -- Ajuste manual sem justificativa e sem autor é adulteração com outro nome.
  constraint punch_ajuste_exige_justificativa
    check (origin <> 'ajuste_manual'
           or (justification is not null
               and length(btrim(justification)) > 0
               and created_by is not null))
);

create index punches_company_date_idx  on public.punches (company_id, work_date);
create index punches_membership_idx    on public.punches (membership_id, work_date);
create index punches_replaces_idx      on public.punches (replaces_punch_id)
  where replaces_punch_id is not null;

-- Mesma imutabilidade do audit_log, mesmo trigger, mesma exceção para o
-- delete em cascata de companies.
create trigger punches_immutable
  before update or delete on public.punches
  for each row execute function public.deny_mutation();

-- ============================================================
-- RLS
-- ============================================================
alter table public.punches enable row level security;
alter table public.punches force row level security;

-- Funcionário lê o próprio ponto; gestão lê o de todo mundo da empresa.
create policy punches_select on public.punches
  for select to authenticated
  using (
    company_id in (select public.auth_company_ids())
    and (
      public.auth_role(company_id) in ('dono','gerente')
      or membership_id in (select public.auth_membership_ids())
    )
  );

-- Nenhuma policy de INSERT, UPDATE ou DELETE. É deliberado: se o cliente
-- pudesse inserir, poderia inserir `verified = true`.

revoke all on public.punches from anon, authenticated;
grant select on public.punches to authenticated;

-- ============================================================
-- DISTÂNCIA
-- ============================================================
-- Haversine em metros. Raio da Terra 6371 km — erro irrelevante na escala de
-- um estabelecimento.
create or replace function public.haversine_m(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
)
returns double precision
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select 6371000 * 2 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2))
    * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

-- ============================================================
-- SEQUÊNCIA DO DIA
-- ============================================================
-- Qual foi a última batida efetiva do dia. "Efetiva" = ninguém a substituiu
-- e ela não foi anulada.
create or replace function public.last_punch_of_day(
  p_membership_id uuid,
  p_work_date     date
)
returns public.punch_type
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.type
  from public.punches p
  where p.membership_id = p_membership_id
    and p.work_date = p_work_date
    and not p.voided
    and not exists (
      select 1 from public.punches s where s.replaces_punch_id = p.id
    )
  order by p.punched_at desc, p.created_at desc
  limit 1;
$$;

-- O que pode vir depois. Duas entradas seguidas não são erro de digitação:
-- viram hora trabalhada fantasma no relatório.
create or replace function public.allowed_punch_types(
  p_membership_id uuid,
  p_work_date     date
)
returns public.punch_type[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case public.last_punch_of_day(p_membership_id, p_work_date)
    when 'entrada'          then array['intervalo_inicio','saida']::public.punch_type[]
    when 'intervalo_inicio' then array['intervalo_fim']::public.punch_type[]
    when 'intervalo_fim'    then array['saida']::public.punch_type[]
    -- Depois de sair, só recomeçando: turno dobrado no mesmo dia existe.
    when 'saida'            then array['entrada']::public.punch_type[]
    else array['entrada']::public.punch_type[]
  end;
$$;

revoke all on function public.last_punch_of_day(uuid, date) from public, anon;
revoke all on function public.allowed_punch_types(uuid, date) from public, anon;
grant execute on function public.last_punch_of_day(uuid, date)  to authenticated;
grant execute on function public.allowed_punch_types(uuid, date) to authenticated;

-- ============================================================
-- REGISTRAR PONTO — o único caminho de escrita
-- ============================================================
-- Recebe o que o aparelho disse e decide sozinha. `verified` não é parâmetro
-- de propósito: não existe forma de o cliente pedir para ser aprovado.
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

  -- Horário: o cliente pode informar o momento em que bateu (fila offline),
  -- mas não pode inventar. Futuro é recusado; passado tem teto de 24h.
  v_quando := coalesce(p_punched_at, now());
  if v_quando > now() + interval '2 minutes' then
    raise exception 'Horário no futuro' using errcode = 'check_violation';
  end if;
  if v_quando < now() - interval '24 hours' then
    raise exception 'Batida antiga demais para sincronizar. Peça um ajuste ao gestor.'
      using errcode = 'check_violation';
  end if;
  v_atrasado := v_quando < now() - interval '2 minutes';

  v_dia := (v_quando at time zone v_tz)::date;

  -- Unidade: a da escala do dia, senão a única ativa da empresa.
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

  -- Validação de local. O GPS do celular erra; um raio de 100 m com precisão
  -- informada de 500 m não prova nada, e aceitar seria fingir que valida.
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

-- Só o servidor chama. `authenticated` não recebe execute: assim o caminho de
-- escrita é um só, e passa por onde dá para pôr limite de requisição e log.
revoke all on function public.register_punch(uuid, public.punch_type, double precision, double precision, integer, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.register_punch(uuid, public.punch_type, double precision, double precision, integer, timestamptz, text)
  to service_role;

-- ============================================================
-- LEITURA
-- ============================================================
-- Batidas efetivas de um período: as que ninguém substituiu nem anulou.
create or replace function public.effective_punches(
  p_company_id uuid,
  p_from       date,
  p_to         date
)
returns table (
  id            uuid,
  membership_id uuid,
  full_name     text,
  work_date     date,
  type          public.punch_type,
  punched_at    timestamptz,
  origin        public.punch_origin,
  distance_m    integer,
  accuracy_m    integer,
  selfie_path   text,
  atrasado      boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id, p.membership_id, m.full_name, p.work_date, p.type, p.punched_at,
         p.origin, p.distance_m, p.accuracy_m, p.selfie_path,
         p.sincronizado_em is not null
  from public.punches p
  join public.memberships m on m.id = p.membership_id
  where p.company_id = p_company_id
    and p.work_date between p_from and p_to
    and not p.voided
    and not exists (select 1 from public.punches s where s.replaces_punch_id = p.id)
    and p_company_id in (select public.auth_company_ids())
    and (public.auth_role(p_company_id) in ('dono','gerente')
         or m.user_id = auth.uid())
  order by p.work_date, m.full_name, p.punched_at;
$$;

revoke all on function public.effective_punches(uuid, date, date) from public, anon;
grant execute on function public.effective_punches(uuid, date, date) to authenticated;

-- Estado de hoje para a tela de bater ponto: o que já bateu e o que pode.
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
  v_m   public.memberships%rowtype;
  v_tz  text;
  v_dia date;
  v_loc public.locations%rowtype;
begin
  select * into v_m from public.memberships
  where company_id = p_company_id and user_id = auth.uid() and status = 'ativo';

  if not found then
    return;
  end if;

  select timezone into v_tz from public.companies where id = p_company_id;
  v_dia := (now() at time zone v_tz)::date;

  select l.* into v_loc
  from public.resolved_schedule(p_company_id, v_dia, v_dia) r
  join public.locations l on l.id = r.location_id
  where r.membership_id = v_m.id
  limit 1;

  if v_loc.id is null then
    select * into v_loc
    from public.locations where company_id = p_company_id and active limit 1;
  end if;

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
