-- ============================================================
-- Sprint 0 — Bootstrap da empresa (resolve o ovo-e-galinha)
--
-- Um usuario recem-autenticado nao pertence a empresa nenhuma, logo nenhuma
-- policy de INSERT em `companies` poderia autoriza-lo sem abrir um buraco.
-- A criacao passa por esta RPC: ela cria a empresa e a membership de dono
-- na MESMA transacao, com privilegio elevado e contrato estreito.
-- ============================================================

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

  -- Fuso precisa existir de verdade; relatorio de ponto depende disso.
  if not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'Fuso horario invalido: %', p_timezone using errcode = 'check_violation';
  end if;

  insert into public.companies (name, timezone, cnpj)
  values (btrim(p_name), p_timezone, nullif(btrim(p_cnpj), ''))
  returning id into v_company_id;

  insert into public.memberships (company_id, user_id, full_name, role, status)
  values (v_company_id, v_uid, btrim(p_full_name), 'dono', 'ativo');

  insert into public.audit_log (company_id, actor, action, target, meta)
  values (v_company_id, v_uid, 'company.create', v_company_id::text,
          jsonb_build_object('name', btrim(p_name), 'timezone', p_timezone));

  return v_company_id;
end;
$$;

revoke all on function public.create_company_with_owner(text, text, text, text) from public, anon;
grant execute on function public.create_company_with_owner(text, text, text, text) to authenticated;

-- ------------------------------------------------------------
-- Contexto do usuario logado: quais empresas, com que papel.
-- Uma chamada em vez de dois selects na inicializacao do app.
-- ------------------------------------------------------------
create or replace function public.my_workspaces()
returns table (
  company_id    uuid,
  company_name  text,
  timezone      text,
  plan          text,
  trial_ends_at timestamptz,
  role          public.app_role,
  membership_id uuid,
  full_name     text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.id, c.name, c.timezone, c.plan, c.trial_ends_at,
         m.role, m.id, m.full_name
  from public.memberships m
  join public.companies c on c.id = m.company_id
  where m.user_id = auth.uid() and m.status = 'ativo'
  order by c.created_at;
$$;

revoke all on function public.my_workspaces() from public, anon;
grant execute on function public.my_workspaces() to authenticated;
