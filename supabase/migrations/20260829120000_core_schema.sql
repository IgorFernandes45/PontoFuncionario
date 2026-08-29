-- ============================================================
-- Sprint 0 — Esquema base do multi-tenant
-- companies (tenant raiz) · memberships (vinculo+papel) · invitations
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- EMPRESAS (tenant raiz) ----------
create table public.companies (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(btrim(name)) > 0),
  cnpj          text,
  timezone      text not null default 'America/Recife',
  plan          text not null default 'trial' check (plan in ('trial','basic','pro')),
  trial_ends_at timestamptz not null default (now() + interval '14 days'),
  created_at    timestamptz not null default now()
);

-- ---------- PAPEIS ----------
create type public.app_role      as enum ('dono','gerente','funcionario');
create type public.member_status as enum ('ativo','pendente','inativo');

-- ---------- VINCULO USUARIO <-> EMPRESA ----------
-- O papel e por empresa, nao global: o mesmo usuario pode ser 'dono'
-- numa empresa e 'funcionario' em outra.
create table public.memberships (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  full_name   text not null check (length(btrim(full_name)) > 0),
  role        public.app_role      not null default 'funcionario',
  status      public.member_status not null default 'ativo',
  created_at  timestamptz not null default now(),
  unique (company_id, user_id)
);
create index memberships_company_id_idx on public.memberships (company_id);
create index memberships_user_id_idx    on public.memberships (user_id);

-- Toda empresa precisa de pelo menos um dono ativo. O indice parcial nao
-- garante isso sozinho, mas o trigger abaixo impede remover o ultimo.
create index memberships_owner_idx
  on public.memberships (company_id)
  where role = 'dono' and status = 'ativo';

-- ---------- CONVITES ----------
create table public.invitations (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  email       text not null check (position('@' in email) > 1),
  full_name   text not null,
  role        public.app_role not null default 'funcionario',
  token       text not null unique default encode(gen_random_bytes(24),'hex'),
  status      text not null default 'pendente' check (status in ('pendente','aceito','expirado','cancelado')),
  expires_at  timestamptz not null default (now() + interval '7 days'),
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now()
);
create index invitations_company_id_idx on public.invitations (company_id);
create unique index invitations_token_idx on public.invitations (token);
-- Um convite pendente por e-mail por empresa (evita spam de convites duplicados)
create unique index invitations_pending_email_idx
  on public.invitations (company_id, lower(email))
  where status = 'pendente';

-- ---------- AUDITORIA ----------
-- Append-only: sem policies de update/delete e com trigger de bloqueio.
create table public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  actor       uuid references auth.users(id),
  action      text not null,
  target      text,
  meta        jsonb,
  created_at  timestamptz not null default now()
);
create index audit_log_company_created_idx on public.audit_log (company_id, created_at desc);

-- ---------- IMUTABILIDADE ----------
-- Usado tambem por `punches` na Sprint 4 (Secao 8 do plano: registros
-- imutaveis; correcao vira registro novo, nunca update).
create or replace function public.deny_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company_id uuid;
begin
  -- Excecao unica: delete em cascata vindo de `companies`. Apagar a conta
  -- inteira e legitimo (LGPD, art. 18); o que a imutabilidade proibe e
  -- adulterar ou sumir com um registro isolado. Se a empresa ainda existe,
  -- nao e cascata — e alguem mexendo onde nao deve.
  if TG_OP = 'DELETE' then
    v_company_id := (to_jsonb(OLD) ->> 'company_id')::uuid;
    if v_company_id is not null
       and not exists (select 1 from public.companies where id = v_company_id) then
      return OLD;
    end if;
  end if;

  raise exception 'Tabela % e append-only: % nao permitido', TG_TABLE_NAME, TG_OP
    using errcode = 'restrict_violation';
end;
$$;

create trigger audit_log_immutable
  before update or delete on public.audit_log
  for each row execute function public.deny_mutation();

-- ---------- ULTIMO DONO ----------
create or replace function public.protect_last_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  remaining int;
begin
  -- Delete em cascata vindo de companies: a empresa ja foi removida,
  -- nao ha o que proteger.
  if TG_OP = 'DELETE'
     and not exists (select 1 from public.companies where id = OLD.company_id) then
    return OLD;
  end if;

  -- Só interessa quando a linha deixa de ser dono ativo.
  if TG_OP = 'UPDATE'
     and OLD.role = 'dono' and OLD.status = 'ativo'
     and NEW.role = 'dono' and NEW.status = 'ativo' then
    return NEW;
  end if;

  if OLD.role <> 'dono' or OLD.status <> 'ativo' then
    return coalesce(NEW, OLD);
  end if;

  select count(*) into remaining
  from public.memberships
  where company_id = OLD.company_id
    and role = 'dono' and status = 'ativo'
    and id <> OLD.id;

  if remaining = 0 then
    raise exception 'A empresa precisa de pelo menos um dono ativo'
      using errcode = 'restrict_violation';
  end if;

  return coalesce(NEW, OLD);
end;
$$;

create trigger memberships_protect_last_owner
  before update or delete on public.memberships
  for each row execute function public.protect_last_owner();
