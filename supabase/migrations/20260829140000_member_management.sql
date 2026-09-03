-- ============================================================
-- Sprint 2 — Gestão de membros
--
-- A Sprint 1 listava e convidava; promover, rebaixar, desativar e remover
-- ficaram órfãos. Tudo passa por RPC em vez de UPDATE direto, por dois
-- motivos: `authenticated` não escreve em audit_log, e uma mudança de papel
-- sem rastro é exatamente o que não pode acontecer.
-- ============================================================

-- ------------------------------------------------------------
-- Trocar o papel de um membro
-- ------------------------------------------------------------
create or replace function public.set_member_role(
  p_membership_id uuid,
  p_role          public.app_role
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_m    public.memberships%rowtype;
begin
  if v_uid is null then
    raise exception 'Não autenticado' using errcode = 'insufficient_privilege';
  end if;

  select * into v_m from public.memberships where id = p_membership_id;
  if not found then
    raise exception 'Membro não encontrado' using errcode = 'no_data_found';
  end if;

  -- Duas checagens, não uma: quem pode mexer no papel ATUAL e quem pode
  -- conceder o papel NOVO. Só a primeira deixaria um gerente promover um
  -- funcionário a dono.
  if not public.can_manage_member(v_m.company_id, v_m.role)
     or not public.can_manage_member(v_m.company_id, p_role) then
    raise exception 'Você não pode alterar o papel deste membro'
      using errcode = 'insufficient_privilege';
  end if;

  -- Rebaixar a si mesmo é um jeito silencioso de perder o acesso.
  if v_m.user_id = v_uid and p_role <> v_m.role then
    raise exception 'Você não pode alterar o seu próprio papel'
      using errcode = 'insufficient_privilege';
  end if;

  if v_m.role = p_role then
    return;
  end if;

  -- protect_last_owner() cuida do caso "era o último dono".
  update public.memberships set role = p_role where id = p_membership_id;

  insert into public.audit_log (company_id, actor, action, target, meta)
  values (v_m.company_id, v_uid, 'member.role_change', p_membership_id::text,
          jsonb_build_object('de', v_m.role, 'para', p_role,
                             'nome', v_m.full_name));
end;
$$;

-- ------------------------------------------------------------
-- Ativar / desativar
-- ------------------------------------------------------------
-- Desativar tira o acesso e mantém o histórico. É o que se usa quando alguém
-- sai da empresa: o ponto que ele bateu continua valendo.
create or replace function public.set_member_status(
  p_membership_id uuid,
  p_status        public.member_status
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_m   public.memberships%rowtype;
begin
  if v_uid is null then
    raise exception 'Não autenticado' using errcode = 'insufficient_privilege';
  end if;

  select * into v_m from public.memberships where id = p_membership_id;
  if not found then
    raise exception 'Membro não encontrado' using errcode = 'no_data_found';
  end if;

  if not public.can_manage_member(v_m.company_id, v_m.role) then
    raise exception 'Você não pode alterar este membro'
      using errcode = 'insufficient_privilege';
  end if;

  if v_m.user_id = v_uid then
    raise exception 'Você não pode desativar a si mesmo'
      using errcode = 'insufficient_privilege';
  end if;

  if v_m.status = p_status then
    return;
  end if;

  update public.memberships set status = p_status where id = p_membership_id;

  insert into public.audit_log (company_id, actor, action, target, meta)
  values (v_m.company_id, v_uid, 'member.status_change', p_membership_id::text,
          jsonb_build_object('de', v_m.status, 'para', p_status,
                             'nome', v_m.full_name));
end;
$$;

-- ------------------------------------------------------------
-- Remover de vez
-- ------------------------------------------------------------
-- Remover apaga o vínculo. A partir da Sprint 5, quando `punches` existir,
-- esta função passa a recusar quem já bateu ponto — apagar histórico de
-- jornada não é operação de tela. Até lá, desativar é sempre a opção certa
-- para quem já trabalhou.
create or replace function public.remove_member(p_membership_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_m   public.memberships%rowtype;
begin
  if v_uid is null then
    raise exception 'Não autenticado' using errcode = 'insufficient_privilege';
  end if;

  select * into v_m from public.memberships where id = p_membership_id;
  if not found then
    raise exception 'Membro não encontrado' using errcode = 'no_data_found';
  end if;

  if not public.can_manage_member(v_m.company_id, v_m.role) then
    raise exception 'Você não pode remover este membro'
      using errcode = 'insufficient_privilege';
  end if;

  if v_m.user_id = v_uid then
    raise exception 'Você não pode remover a si mesmo'
      using errcode = 'insufficient_privilege';
  end if;

  -- SPRINT 5: recusar quando existir punch para este membership.
  if public.member_has_history(p_membership_id) then
    raise exception 'Este membro já tem histórico registrado. Desative em vez de remover.'
      using errcode = 'restrict_violation';
  end if;

  -- A auditoria vai ANTES do delete: depois, company_id ainda existe mas o
  -- membership não, e queremos o nome no registro.
  insert into public.audit_log (company_id, actor, action, target, meta)
  values (v_m.company_id, v_uid, 'member.remove', p_membership_id::text,
          jsonb_build_object('nome', v_m.full_name, 'papel', v_m.role));

  delete from public.memberships where id = p_membership_id;
end;
$$;

-- ------------------------------------------------------------
-- Tem histórico?
-- ------------------------------------------------------------
-- Ponto único de extensão. Hoje nenhuma tabela de histórico existe; a Sprint 3
-- acrescenta escala e a Sprint 5 acrescenta ponto. `to_regclass` deixa a
-- função correta antes e depois, sem depender de alguém lembrar de voltar
-- aqui.
create or replace function public.member_has_history(p_membership_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_tabela text;
  v_existe boolean;
begin
  foreach v_tabela in array array['punches','schedule_entries','absences'] loop
    if to_regclass('public.' || v_tabela) is not null then
      execute format('select exists (select 1 from public.%I where membership_id = $1)', v_tabela)
        into v_existe using p_membership_id;
      if v_existe then
        return true;
      end if;
    end if;
  end loop;
  return false;
end;
$$;

-- ------------------------------------------------------------
-- Configuração da empresa
-- ------------------------------------------------------------
create or replace function public.update_company(
  p_company_id uuid,
  p_name       text,
  p_timezone   text,
  p_cnpj       text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_old public.companies%rowtype;
begin
  if not public.is_owner(p_company_id) then
    raise exception 'Só o dono altera a configuração da empresa'
      using errcode = 'insufficient_privilege';
  end if;

  if p_name is null or length(btrim(p_name)) = 0 then
    raise exception 'Nome da empresa é obrigatório' using errcode = 'check_violation';
  end if;

  if not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'Fuso horário inválido: %', p_timezone using errcode = 'check_violation';
  end if;

  select * into v_old from public.companies where id = p_company_id;

  update public.companies
     set name = btrim(p_name),
         timezone = p_timezone,
         cnpj = nullif(btrim(p_cnpj), '')
   where id = p_company_id;

  insert into public.audit_log (company_id, actor, action, target, meta)
  values (p_company_id, v_uid, 'company.update', p_company_id::text,
          jsonb_build_object('nome_antes', v_old.name, 'nome_depois', btrim(p_name),
                             'fuso_antes', v_old.timezone, 'fuso_depois', p_timezone));
end;
$$;

-- ------------------------------------------------------------
-- Permissões
-- ------------------------------------------------------------
revoke all on function public.set_member_role(uuid, public.app_role)     from public, anon;
revoke all on function public.set_member_status(uuid, public.member_status) from public, anon;
revoke all on function public.remove_member(uuid)                        from public, anon;
revoke all on function public.member_has_history(uuid)                   from public, anon;
revoke all on function public.update_company(uuid, text, text, text)     from public, anon;

grant execute on function public.set_member_role(uuid, public.app_role)     to authenticated;
grant execute on function public.set_member_status(uuid, public.member_status) to authenticated;
grant execute on function public.remove_member(uuid)                        to authenticated;
grant execute on function public.member_has_history(uuid)                   to authenticated;
grant execute on function public.update_company(uuid, text, text, text)     to authenticated;
