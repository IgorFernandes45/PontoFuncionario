-- ============================================================
-- Sprint 6 — Ausências justificadas
--
-- Sem esta tabela, "falta = escala sem ponto" trata atestado, férias e falta
-- do mesmo jeito. O relatório da Sprint 7 depende dela para separar as três.
-- ============================================================

create type public.absence_kind as enum
  ('atestado','ferias','folga','feriado','falta_justificada','outro');

create table public.absences (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  -- NULL = vale para a empresa inteira. É assim que um feriado cobre todo
  -- mundo sem virar uma linha por pessoa.
  membership_id   uuid references public.memberships(id) on delete cascade,
  kind            public.absence_kind not null,
  starts_on       date not null,
  ends_on         date not null,
  note            text,
  attachment_path text,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default clock_timestamp(),

  constraint absence_periodo_coerente check (ends_on >= starts_on),
  -- Feriado é da empresa; o resto é de alguém.
  constraint absence_feriado_sem_pessoa
    check (kind <> 'feriado' or membership_id is null),
  constraint absence_pessoal_tem_pessoa
    check (kind = 'feriado' or membership_id is not null)
);

create index absences_company_periodo_idx on public.absences (company_id, starts_on, ends_on);
create index absences_membership_idx on public.absences (membership_id);

-- Coerência entre empresa e pessoa, como em schedule_entries.
create or replace function public.check_absence_company()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if NEW.membership_id is not null and not exists (
    select 1 from public.memberships m
    where m.id = NEW.membership_id and m.company_id = NEW.company_id
  ) then
    raise exception 'O membro não pertence a esta empresa'
      using errcode = 'foreign_key_violation';
  end if;
  return NEW;
end;
$$;

create trigger absences_company_coerente
  before insert or update on public.absences
  for each row execute function public.check_absence_company();

-- ============================================================
-- RLS
-- ============================================================
alter table public.absences enable row level security;
alter table public.absences force row level security;

-- O funcionário vê as próprias ausências e os feriados da empresa; a gestão
-- vê tudo. Atestado de colega não é assunto de colega.
create policy absences_select on public.absences
  for select to authenticated
  using (
    company_id in (select public.auth_company_ids())
    and (
      public.auth_role(company_id) in ('dono','gerente')
      or membership_id is null
      or membership_id in (select public.auth_membership_ids())
    )
  );

create policy absences_write on public.absences
  for all to authenticated
  using  (public.auth_role(company_id) in ('dono','gerente'))
  with check (public.auth_role(company_id) in ('dono','gerente'));

revoke all on public.absences from anon;
grant select, insert, update, delete on public.absences to authenticated;

-- ------------------------------------------------------------
-- Ausências que cobrem um período, já resolvendo o feriado
-- ------------------------------------------------------------
-- Um feriado tem membership_id nulo e vale para todos. Expandir isso na
-- leitura evita que cada tela precise lembrar da regra.
create or replace function public.absences_in_range(
  p_company_id uuid,
  p_from       date,
  p_to         date
)
returns table (
  absence_id    uuid,
  membership_id uuid,
  full_name     text,
  dia           date,
  kind          public.absence_kind,
  note          text,
  da_empresa    boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select a.id, m.id, m.full_name, d::date, a.kind, a.note,
         a.membership_id is null
  from public.absences a
  join public.memberships m
    on m.company_id = a.company_id
   and m.status = 'ativo'
   and (a.membership_id is null or a.membership_id = m.id)
  cross join lateral generate_series(
    greatest(a.starts_on, p_from),
    least(a.ends_on, p_to),
    interval '1 day'
  ) d
  where a.company_id = p_company_id
    and a.starts_on <= p_to
    and a.ends_on >= p_from
    and p_company_id in (select public.auth_company_ids())
    and (public.auth_role(p_company_id) in ('dono','gerente')
         or m.user_id = auth.uid())
  order by d, m.full_name;
$$;

revoke all on function public.absences_in_range(uuid, date, date) from public, anon;
grant execute on function public.absences_in_range(uuid, date, date) to authenticated;

-- ------------------------------------------------------------
-- Bucket privado para atestados
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('anexos', 'anexos', false)
on conflict (id) do nothing;

-- O caminho carrega o company_id como primeira pasta: é o que permite
-- decidir acesso sem consultar a tabela de ausências.
create policy anexos_gestao_le on storage.objects
  for select to authenticated
  using (
    bucket_id = 'anexos'
    and (storage.foldername(name))[1]::uuid in (select public.auth_company_ids())
    and public.auth_role((storage.foldername(name))[1]::uuid) in ('dono','gerente')
  );

create policy anexos_gestao_escreve on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'anexos'
    and (storage.foldername(name))[1]::uuid in (select public.auth_company_ids())
    and public.auth_role((storage.foldername(name))[1]::uuid) in ('dono','gerente')
  );

create policy anexos_gestao_apaga on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'anexos'
    and (storage.foldername(name))[1]::uuid in (select public.auth_company_ids())
    and public.auth_role((storage.foldername(name))[1]::uuid) in ('dono','gerente')
  );
