-- ============================================================
-- Sprint 0 — Row-Level Security
-- Isolamento entre empresas garantido no banco, nao na aplicacao.
-- ============================================================

-- ---------- FUNCOES AUXILIARES ----------
-- security definer para NAO recursar: elas leem `memberships`, que por sua
-- vez tem policies que as chamam. `search_path` fixo fecha o vetor de
-- escalada de privilegio classico de funcoes definer.

create or replace function public.auth_company_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select company_id
  from public.memberships
  where user_id = auth.uid() and status = 'ativo';
$$;

create or replace function public.auth_role(cid uuid)
returns public.app_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role
  from public.memberships
  where user_id = auth.uid() and company_id = cid and status = 'ativo'
  limit 1;
$$;

-- Ids de membership do proprio usuario (usado por punches na Sprint 4).
create or replace function public.auth_membership_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select id
  from public.memberships
  where user_id = auth.uid() and status = 'ativo';
$$;

revoke all on function public.auth_company_ids()    from public, anon;
revoke all on function public.auth_role(uuid)       from public, anon;
revoke all on function public.auth_membership_ids() from public, anon;
grant execute on function public.auth_company_ids()    to authenticated;
grant execute on function public.auth_role(uuid)       to authenticated;
grant execute on function public.auth_membership_ids() to authenticated;

-- ---------- ATIVACAO ----------
alter table public.companies   enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.audit_log   enable row level security;

-- Nem o dono das tabelas escapa (protege contra queries rodando como owner).
alter table public.companies   force row level security;
alter table public.memberships force row level security;
alter table public.invitations force row level security;
alter table public.audit_log   force row level security;

-- ---------- COMPANIES ----------
-- Leio apenas empresas as quais pertenco.
create policy companies_select on public.companies
  for select to authenticated
  using (id in (select public.auth_company_ids()));

-- Só o dono edita a empresa. Sem policy de INSERT de proposito: a criacao
-- passa obrigatoriamente pela RPC create_company_with_owner (ver migration
-- de bootstrap), que cria empresa + membership do dono na mesma transacao.
create policy companies_update on public.companies
  for update to authenticated
  using (public.auth_role(id) = 'dono')
  with check (public.auth_role(id) = 'dono');

-- ---------- MEMBERSHIPS ----------
create policy memberships_select on public.memberships
  for select to authenticated
  using (company_id in (select public.auth_company_ids()));

-- Quem pode mexer NESTA linha de membership.
--   dono    -> qualquer membro, inclusive outro dono
--   gerente -> apenas funcionarios
-- O gerente ficar de fora de linhas 'dono'/'gerente' e o que impede a
-- escalada obvia: sem isso ele daria um update em si mesmo virando dono.
create or replace function public.can_manage_member(
  p_company_id uuid,
  p_target_role public.app_role
)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select case public.auth_role(p_company_id)
    when 'dono'    then true
    when 'gerente' then p_target_role = 'funcionario'
    else false
  end;
$$;

grant execute on function public.can_manage_member(uuid, public.app_role) to authenticated;

create policy memberships_insert on public.memberships
  for insert to authenticated
  with check (public.can_manage_member(company_id, role));

-- USING olha a linha ANTES, WITH CHECK olha DEPOIS: as duas juntas barram
-- tanto "gerente edita um dono" quanto "gerente promove alguem a gerente".
create policy memberships_update on public.memberships
  for update to authenticated
  using  (public.can_manage_member(company_id, role))
  with check (public.can_manage_member(company_id, role));

create policy memberships_delete on public.memberships
  for delete to authenticated
  using (public.can_manage_member(company_id, role));

-- ---------- INVITATIONS ----------
-- Convite so e visivel para quem gerencia. O aceite (por quem ainda NAO e
-- membro) acontece via RPC security definer na Sprint 1, nunca por select.
create policy invitations_select on public.invitations
  for select to authenticated
  using (public.auth_role(company_id) in ('dono','gerente'));

create policy invitations_insert on public.invitations
  for insert to authenticated
  with check (
    public.auth_role(company_id) in ('dono','gerente')
    and created_by = auth.uid()
  );

create policy invitations_update on public.invitations
  for update to authenticated
  using  (public.auth_role(company_id) in ('dono','gerente'))
  with check (public.auth_role(company_id) in ('dono','gerente'));

create policy invitations_delete on public.invitations
  for delete to authenticated
  using (public.auth_role(company_id) in ('dono','gerente'));

-- ---------- AUDIT_LOG ----------
-- Append-only e so gestao le. Escrita real vem do servidor (service_role),
-- que ignora RLS.
create policy audit_select on public.audit_log
  for select to authenticated
  using (public.auth_role(company_id) in ('dono','gerente'));

-- ---------- GRANTS ----------
-- RLS filtra linhas, mas o GRANT ainda decide se a tabela e alcancavel.
revoke all on public.companies, public.memberships, public.invitations, public.audit_log from anon;

grant select, update            on public.companies   to authenticated;
grant select, insert, update, delete on public.memberships to authenticated;
grant select, insert, update, delete on public.invitations to authenticated;
grant select                    on public.audit_log   to authenticated;
