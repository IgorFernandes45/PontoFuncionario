-- ============================================================
-- Sprint 2 — Turnos e unidades
--
-- Os dois cadastros que a escala (Sprint 3) exige. `locations` foi
-- antecipada da Sprint 4 original: schedule_entries referencia a unidade
-- desde o primeiro dia, e montar escala sem ela seria retrabalho.
-- ============================================================

-- ------------------------------------------------------------
-- Duração de turno
-- ------------------------------------------------------------
-- Imutável porque entra em CHECK constraint. Trata o turno que vira o dia
-- (22:00–06:00), que sem cuidado dá duração negativa.
--
-- NÃO usar `p_end + interval '24 hours'`: o tipo `time` é módulo 24h, então
-- 06:00 + 24h continua 06:00 e a conta vira -960. Aritmética em minutos
-- desde a meia-noite, com módulo, é o que funciona.
create or replace function public.shift_duration_minutes(p_start time, p_end time)
returns integer
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select ((((extract(epoch from p_end) - extract(epoch from p_start)) / 60)::integer
           + 1440) % 1440);
$$;

-- ============================================================
-- TURNOS
-- ============================================================
create table public.shift_templates (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  key           text not null check (key ~ '^[a-z0-9_]{2,24}$'),
  label         text not null check (length(btrim(label)) > 0),
  start_time    time not null,
  end_time      time not null,
  -- Intervalo PREVISTO, em minutos. Sem ele não há hora líquida nem como
  -- checar intervalo mínimo. A revisão 1 do plano esquecia isto.
  break_minutes integer not null default 0 check (break_minutes >= 0),
  color         text not null default '#2f5bff' check (color ~* '^#[0-9a-f]{6}$'),
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  -- Turno de duração zero não existe; e o intervalo tem que caber dentro dele.
  constraint shift_has_duration check (start_time <> end_time),
  constraint shift_break_fits
    check (break_minutes < public.shift_duration_minutes(start_time, end_time)),
  -- A unicidade também é o alvo da FK composta de schedule_entries (Sprint 3):
  -- garante que a escala não aponte para turno de outra empresa.
  constraint shift_templates_company_key_key unique (company_id, key)
);
create index shift_templates_company_idx on public.shift_templates (company_id);

-- ============================================================
-- UNIDADES
-- ============================================================
create type public.punch_method as enum ('gps','wifi','ambos');

create table public.locations (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  name           text not null check (length(btrim(name)) > 0),
  address        text,
  lat            double precision check (lat between -90 and 90),
  lng            double precision check (lng between -180 and 180),
  -- Abaixo de 20 m o GPS de celular gera falso negativo o dia inteiro; acima
  -- de 2 km a verificação deixa de significar qualquer coisa.
  radius_m       integer not null default 120 check (radius_m between 20 and 2000),
  method         public.punch_method not null default 'gps',
  require_selfie boolean not null default false,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  -- Método por GPS sem coordenada não valida nada.
  constraint location_gps_needs_coords
    check (method = 'wifi' or (lat is not null and lng is not null))
);
create index locations_company_idx on public.locations (company_id);

-- SSIDs permitidos por unidade. Tabela criada agora, usada só na Sprint 11:
-- ler SSID no navegador é bloqueado por iOS e Android.
create table public.location_wifi (
  id          uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  ssid        text not null check (length(btrim(ssid)) > 0),
  bssid       text,
  created_at  timestamptz not null default now(),
  unique (location_id, ssid)
);
create index location_wifi_location_idx on public.location_wifi (location_id);

-- ============================================================
-- RLS
-- ============================================================
alter table public.shift_templates enable row level security;
alter table public.locations       enable row level security;
alter table public.location_wifi   enable row level security;

alter table public.shift_templates force row level security;
alter table public.locations       force row level security;
alter table public.location_wifi   force row level security;

-- Todo mundo da empresa LÊ: o funcionário precisa saber o horário do próprio
-- turno e onde fica a unidade em que vai bater ponto.
create policy shifts_select on public.shift_templates
  for select to authenticated
  using (company_id in (select public.auth_company_ids()));

create policy shifts_write on public.shift_templates
  for all to authenticated
  using  (public.auth_role(company_id) in ('dono','gerente'))
  with check (public.auth_role(company_id) in ('dono','gerente'));

create policy locations_select on public.locations
  for select to authenticated
  using (company_id in (select public.auth_company_ids()));

create policy locations_write on public.locations
  for all to authenticated
  using  (public.auth_role(company_id) in ('dono','gerente'))
  with check (public.auth_role(company_id) in ('dono','gerente'));

-- location_wifi não tem company_id: o alcance vem da unidade dona.
create policy location_wifi_select on public.location_wifi
  for select to authenticated
  using (exists (
    select 1 from public.locations l
    where l.id = location_id
      and l.company_id in (select public.auth_company_ids())
  ));

create policy location_wifi_write on public.location_wifi
  for all to authenticated
  using (exists (
    select 1 from public.locations l
    where l.id = location_id
      and public.auth_role(l.company_id) in ('dono','gerente')
  ))
  with check (exists (
    select 1 from public.locations l
    where l.id = location_id
      and public.auth_role(l.company_id) in ('dono','gerente')
  ));

-- ============================================================
-- GRANTS
-- ============================================================
revoke all on public.shift_templates, public.locations, public.location_wifi from anon;

grant select, insert, update, delete on public.shift_templates to authenticated;
grant select, insert, update, delete on public.locations       to authenticated;
grant select, insert, update, delete on public.location_wifi   to authenticated;

revoke all on function public.shift_duration_minutes(time, time) from public, anon;
grant execute on function public.shift_duration_minutes(time, time) to authenticated;

-- ============================================================
-- TURNOS PADRÃO PARA EMPRESA NOVA
-- ============================================================
-- Empresa sem turno nenhum trava a Sprint 3. Três turnos comuns de comércio,
-- já com intervalo, que o dono ajusta ou apaga.
create or replace function public.seed_default_shifts(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.shift_templates (company_id, key, label, start_time, end_time, break_minutes, color)
  values
    (p_company_id, 'manha', 'Manhã', '06:00', '14:00', 60, '#f59e0b'),
    (p_company_id, 'tarde', 'Tarde', '14:00', '22:00', 60, '#2f5bff'),
    (p_company_id, 'noite', 'Noite', '22:00', '06:00', 60, '#7c3aed')
  on conflict (company_id, key) do nothing;
end;
$$;

revoke all on function public.seed_default_shifts(uuid) from public, anon;

-- A criação da empresa passa a semear os turnos. Reescrita inteira porque
-- `create or replace` não faz merge.
create or replace function public.create_company_with_owner(
  p_name      text,
  p_full_name text,
  p_timezone  text default 'America/Recife',
  p_cnpj      text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid        uuid := auth.uid();
  v_company_id uuid;
begin
  if v_uid is null then
    raise exception 'Nao autenticado' using errcode = 'insufficient_privilege';
  end if;

  if p_name is null or length(btrim(p_name)) = 0 then
    raise exception 'Nome da empresa e obrigatorio' using errcode = 'check_violation';
  end if;

  if p_full_name is null or length(btrim(p_full_name)) = 0 then
    raise exception 'Seu nome e obrigatorio' using errcode = 'check_violation';
  end if;

  if not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'Fuso horario invalido: %', p_timezone using errcode = 'check_violation';
  end if;

  insert into public.companies (name, timezone, cnpj)
  values (btrim(p_name), p_timezone, nullif(btrim(p_cnpj), ''))
  returning id into v_company_id;

  insert into public.memberships (company_id, user_id, full_name, role, status)
  values (v_company_id, v_uid, btrim(p_full_name), 'dono', 'ativo');

  perform public.seed_default_shifts(v_company_id);

  insert into public.audit_log (company_id, actor, action, target, meta)
  values (v_company_id, v_uid, 'company.create', v_company_id::text,
          jsonb_build_object('name', btrim(p_name), 'timezone', p_timezone));

  return v_company_id;
end;
$$;

revoke all on function public.create_company_with_owner(text, text, text, text) from public, anon;
grant execute on function public.create_company_with_owner(text, text, text, text) to authenticated;
