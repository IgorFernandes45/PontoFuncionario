-- ============================================================
-- Sprint 3 — Escala
--
-- Dois modelos numa tabela só:
--   weekday preenchido    -> escala FIXA, repete toda semana
--   work_date preenchido  -> escala AVULSA, vale só naquele dia
--
-- A avulsa tem precedência sobre a fixa. Isso NÃO é regra do banco: é da
-- leitura, e mora em resolved_schedule() para não ser reimplementada em cada
-- tela e divergir.
--
-- Decisão: a tabela `schedules` do plano original não foi criada. Ela só
-- agruparia entradas ("escala de verão"), e versionar escala está no backlog.
-- Tabela sem uso é dívida; quando a versão fizer falta, entra com o recurso.
-- ============================================================

create table public.schedule_entries (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  membership_id uuid not null references public.memberships(id) on delete cascade,
  location_id   uuid references public.locations(id) on delete set null,

  -- NULL numa entrada avulsa significa FOLGA marcada: existe uma decisão
  -- para o dia, e a decisão é não trabalhar. É assim que a avulsa apaga a
  -- fixa num dia específico sem apagar o padrão.
  shift_key     text,

  work_date     date,
  weekday       smallint check (weekday between 0 and 6),  -- 0 = domingo (dow)

  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),

  -- Exatamente um dos dois: ou é fixa, ou é avulsa.
  constraint entry_fixa_ou_avulsa check (num_nonnulls(work_date, weekday) = 1),
  -- Folga só existe como exceção de um dia. Na fixa, folga é ausência de linha.
  constraint entry_folga_so_avulsa check (shift_key is not null or work_date is not null),
  -- A escala não pode apontar para turno inexistente nem de outra empresa.
  constraint entry_shift_fk foreign key (company_id, shift_key)
    references public.shift_templates (company_id, key) on update cascade
);

create index schedule_entries_company_date_idx
  on public.schedule_entries (company_id, work_date);
create index schedule_entries_membership_idx
  on public.schedule_entries (membership_id);

-- Uma decisão por pessoa por dia, e um padrão por pessoa por dia-da-semana.
create unique index schedule_entries_avulsa_uniq
  on public.schedule_entries (membership_id, work_date)
  where work_date is not null;
create unique index schedule_entries_fixa_uniq
  on public.schedule_entries (membership_id, weekday)
  where weekday is not null;

-- ------------------------------------------------------------
-- Coerência entre empresa e membro
-- ------------------------------------------------------------
-- company_id é redundante de propósito (deixa o RLS sem JOIN), mas redundância
-- sem guarda vira inconsistência: nada impediria escalar alguém da empresa B
-- numa linha marcada como empresa A.
create or replace function public.check_entry_company()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.memberships m
    where m.id = NEW.membership_id and m.company_id = NEW.company_id
  ) then
    raise exception 'O membro não pertence a esta empresa'
      using errcode = 'foreign_key_violation';
  end if;

  if NEW.location_id is not null and not exists (
    select 1 from public.locations l
    where l.id = NEW.location_id and l.company_id = NEW.company_id
  ) then
    raise exception 'A unidade não pertence a esta empresa'
      using errcode = 'foreign_key_violation';
  end if;

  return NEW;
end;
$$;

create trigger schedule_entries_company_coerente
  before insert or update on public.schedule_entries
  for each row execute function public.check_entry_company();

-- ============================================================
-- RLS
-- ============================================================
alter table public.schedule_entries enable row level security;
alter table public.schedule_entries force row level security;

-- Todo mundo da empresa lê a escala inteira: saber quem trabalha com você é
-- parte de trabalhar em turno. Quem restringe é a tela, não o banco.
create policy schedule_select on public.schedule_entries
  for select to authenticated
  using (company_id in (select public.auth_company_ids()));

create policy schedule_write on public.schedule_entries
  for all to authenticated
  using  (public.auth_role(company_id) in ('dono','gerente'))
  with check (public.auth_role(company_id) in ('dono','gerente'));

revoke all on public.schedule_entries from anon;
grant select, insert, update, delete on public.schedule_entries to authenticated;

-- ============================================================
-- LEITURA RESOLVIDA — o único lugar que sabe a precedência
-- ============================================================
create or replace function public.resolved_schedule(
  p_company_id uuid,
  p_from       date,
  p_to         date
)
returns table (
  work_date     date,
  membership_id uuid,
  full_name     text,
  member_role   public.app_role,
  shift_key     text,
  shift_label   text,
  start_time    time,
  end_time      time,
  break_minutes integer,
  color         text,
  location_id   uuid,
  location_name text,
  origem        text,      -- 'avulsa' | 'fixa' | 'folga'
  entry_id      uuid
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with dias as (
    select d::date as dia from generate_series(p_from, p_to, interval '1 day') d
  ),
  visiveis as (
    select m.id, m.full_name, m.role, m.user_id
    from public.memberships m
    where m.company_id = p_company_id
      and m.status = 'ativo'
      -- Gestor vê a equipe toda; funcionário vê só a própria linha.
      and (public.auth_role(p_company_id) in ('dono','gerente')
           or m.user_id = auth.uid())
  ),
  celulas as (
    select
      dias.dia,
      v.id   as membership_id,
      v.full_name,
      v.role as member_role,
      -- A avulsa do dia ganha da fixa do dia-da-semana. COALESCE não serve
      -- aqui: uma avulsa de folga tem shift_key NULL e ainda assim precisa
      -- vencer, então a escolha é pela existência da linha.
      coalesce(av.id, fx.id)                      as entry_id,
      case when av.id is not null then av.shift_key else fx.shift_key end as shift_key,
      case when av.id is not null then av.location_id else fx.location_id end as location_id,
      case
        when av.id is not null and av.shift_key is null then 'folga'
        when av.id is not null then 'avulsa'
        when fx.id is not null then 'fixa'
      end as origem
    from dias
    cross join visiveis v
    left join public.schedule_entries av
      on av.membership_id = v.id and av.work_date = dias.dia
    left join public.schedule_entries fx
      on fx.membership_id = v.id
     and fx.weekday = extract(dow from dias.dia)::smallint
  )
  select
    c.dia, c.membership_id, c.full_name, c.member_role,
    c.shift_key, s.label, s.start_time, s.end_time, s.break_minutes, s.color,
    c.location_id, l.name, c.origem, c.entry_id
  from celulas c
  left join public.shift_templates s
    on s.company_id = p_company_id and s.key = c.shift_key
  left join public.locations l on l.id = c.location_id
  where c.origem is not null
  order by c.dia, c.full_name;
$$;

revoke all on function public.resolved_schedule(uuid, date, date) from public, anon;
grant execute on function public.resolved_schedule(uuid, date, date) to authenticated;

-- ============================================================
-- ESCRITA
-- ============================================================

-- Define (ou apaga) a escala de UMA pessoa num dia. Um só caminho para os
-- três casos: turno, folga marcada e "volta a seguir a fixa".
create or replace function public.set_day_shift(
  p_membership_id uuid,
  p_date          date,
  -- default null porque omitir É a folga: o parâmetro sem default sairia
  -- como obrigatório nos tipos gerados e a folga viraria um cast.
  p_shift_key     text default null,
  p_location_id   uuid default null,
  p_limpar        boolean default false  -- true = remove a avulsa
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company uuid;
begin
  select company_id into v_company from public.memberships where id = p_membership_id;
  if v_company is null then
    raise exception 'Membro não encontrado' using errcode = 'no_data_found';
  end if;

  if public.auth_role(v_company) not in ('dono','gerente') then
    raise exception 'Você não pode alterar a escala'
      using errcode = 'insufficient_privilege';
  end if;

  if p_limpar then
    delete from public.schedule_entries
     where membership_id = p_membership_id and work_date = p_date;
    return;
  end if;

  insert into public.schedule_entries
    (company_id, membership_id, work_date, shift_key, location_id, created_by)
  values (v_company, p_membership_id, p_date, p_shift_key, p_location_id, auth.uid())
  on conflict (membership_id, work_date) where work_date is not null
  do update set shift_key   = excluded.shift_key,
                location_id = excluded.location_id,
                created_by  = excluded.created_by;
end;
$$;

-- Define o padrão semanal de UMA pessoa num dia-da-semana.
create or replace function public.set_weekday_shift(
  p_membership_id uuid,
  p_weekday       smallint,
  p_shift_key     text default null,   -- omitido = remove o padrão do dia
  p_location_id   uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company uuid;
begin
  select company_id into v_company from public.memberships where id = p_membership_id;
  if v_company is null then
    raise exception 'Membro não encontrado' using errcode = 'no_data_found';
  end if;

  if public.auth_role(v_company) not in ('dono','gerente') then
    raise exception 'Você não pode alterar a escala'
      using errcode = 'insufficient_privilege';
  end if;

  -- Na fixa, folga é ausência de linha: não existe "folga fixa" marcada.
  if p_shift_key is null then
    delete from public.schedule_entries
     where membership_id = p_membership_id and weekday = p_weekday;
    return;
  end if;

  insert into public.schedule_entries
    (company_id, membership_id, weekday, shift_key, location_id, created_by)
  values (v_company, p_membership_id, p_weekday, p_shift_key, p_location_id, auth.uid())
  on conflict (membership_id, weekday) where weekday is not null
  do update set shift_key   = excluded.shift_key,
                location_id = excluded.location_id,
                created_by  = excluded.created_by;
end;
$$;

-- Repete numa semana os AJUSTES feitos noutra: turnos avulsos e folgas
-- marcadas. O que veio da escala fixa fica de fora de propósito — a fixa já
-- se repete sozinha, e copiá-la congelaria a semana de destino, que deixaria
-- de acompanhar mudanças no padrão.
create or replace function public.copy_week(
  p_company_id uuid,
  p_origem     date,   -- primeiro dia da semana de origem
  p_destino    date    -- primeiro dia da semana de destino
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_n integer := 0;
begin
  if public.auth_role(p_company_id) not in ('dono','gerente') then
    raise exception 'Você não pode alterar a escala'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.schedule_entries
    (company_id, membership_id, work_date, shift_key, location_id, created_by)
  select p_company_id, r.membership_id,
         p_destino + (r.work_date - p_origem),
         r.shift_key, r.location_id, auth.uid()
  from public.resolved_schedule(p_company_id, p_origem, p_origem + 6) r
  where r.origem in ('avulsa','folga')
  on conflict (membership_id, work_date) where work_date is not null
  do update set shift_key   = excluded.shift_key,
                location_id = excluded.location_id,
                created_by  = excluded.created_by;

  get diagnostics v_n = row_count;

  insert into public.audit_log (company_id, actor, action, target, meta)
  values (p_company_id, auth.uid(), 'schedule.copy_week', p_destino::text,
          jsonb_build_object('origem', p_origem, 'destino', p_destino, 'linhas', v_n));

  return v_n;
end;
$$;

revoke all on function public.set_day_shift(uuid, date, text, uuid, boolean) from public, anon;
revoke all on function public.set_weekday_shift(uuid, smallint, text, uuid) from public, anon;
revoke all on function public.copy_week(uuid, date, date) from public, anon;

grant execute on function public.set_day_shift(uuid, date, text, uuid, boolean) to authenticated;
grant execute on function public.set_weekday_shift(uuid, smallint, text, uuid) to authenticated;
grant execute on function public.copy_week(uuid, date, date) to authenticated;
