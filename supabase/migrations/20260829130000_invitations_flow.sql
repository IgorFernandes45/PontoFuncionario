-- ============================================================
-- Sprint 1 — Convites: criar, prever e aceitar
-- ============================================================

-- ------------------------------------------------------------
-- 1) Teto de privilegio tambem no convite
-- ------------------------------------------------------------
-- Sem isto o gerente contornava can_manage_member: bastava convidar alguem
-- como 'dono' em vez de promover um membro existente.
drop policy if exists invitations_insert on public.invitations;
drop policy if exists invitations_select on public.invitations;
drop policy if exists invitations_update on public.invitations;
drop policy if exists invitations_delete on public.invitations;

create policy invitations_select on public.invitations
  for select to authenticated
  using (public.auth_role(company_id) in ('dono','gerente'));

create policy invitations_insert on public.invitations
  for insert to authenticated
  with check (
    public.can_manage_member(company_id, role)
    and created_by = auth.uid()
  );

create policy invitations_update on public.invitations
  for update to authenticated
  using  (public.can_manage_member(company_id, role))
  with check (public.can_manage_member(company_id, role));

create policy invitations_delete on public.invitations
  for delete to authenticated
  using (public.can_manage_member(company_id, role));

-- ------------------------------------------------------------
-- 2) Previa do convite (SEM sessao)
-- ------------------------------------------------------------
-- Quem abre o link ainda nao esta logado e nao e membro de nada, entao
-- nenhuma policy de select poderia mostrar o convite. Esta funcao expoe o
-- minimo necessario para a tela dizer "a Padaria X convidou voce".
-- O token e o segredo: 24 bytes aleatorios, inviavel de adivinhar.
create or replace function public.invitation_preview(p_token text)
returns table (
  company_name text,
  full_name    text,
  email        text,
  role         public.app_role,
  status       text,
  expirado     boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.name, i.full_name, i.email, i.role, i.status, (i.expires_at <= now())
  from public.invitations i
  join public.companies c on c.id = i.company_id
  where i.token = p_token;
$$;

revoke all on function public.invitation_preview(text) from public;
grant execute on function public.invitation_preview(text) to anon, authenticated;

-- ------------------------------------------------------------
-- 3) Aceitar o convite
-- ------------------------------------------------------------
-- security definer porque quem aceita ainda nao e membro: nao existe policy
-- que o deixe ler o convite nem inserir a propria membership.
create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid     uuid := auth.uid();
  v_email   text;
  v_convite public.invitations%rowtype;
  v_ja      uuid;
begin
  if v_uid is null then
    raise exception 'Entre na sua conta para aceitar o convite'
      using errcode = 'insufficient_privilege';
  end if;

  select lower(email) into v_email from auth.users where id = v_uid;

  select * into v_convite
  from public.invitations
  where token = p_token
  for update;

  if not found then
    raise exception 'Convite não encontrado' using errcode = 'no_data_found';
  end if;

  -- O token viaja por e-mail e e-mail se encaminha. Amarrar o aceite ao
  -- endereco convidado impede que um repasse vire acesso indevido.
  if lower(v_convite.email) <> v_email then
    raise exception 'Este convite foi enviado para %. Entre com esse e-mail.',
      v_convite.email using errcode = 'insufficient_privilege';
  end if;

  -- Nao adianta marcar status='expirado' aqui: o raise abaixo desfaz a
  -- transacao inteira e o update junto. Quem grava a mudanca de status e
  -- expire_stale_invitations(), chamado pela aplicacao.
  if v_convite.expires_at <= now() then
    raise exception 'Convite expirado. Peça um novo para quem administra.'
      using errcode = 'check_violation';
  end if;

  if v_convite.status <> 'pendente' then
    raise exception 'Convite já utilizado ou cancelado'
      using errcode = 'check_violation';
  end if;

  -- Idempotente: clicar duas vezes no link nao pode dar erro feio.
  select id into v_ja
  from public.memberships
  where company_id = v_convite.company_id and user_id = v_uid;

  if v_ja is null then
    insert into public.memberships (company_id, user_id, full_name, role, status)
    values (v_convite.company_id, v_uid, v_convite.full_name,
            v_convite.role, 'ativo');
  end if;

  update public.invitations set status = 'aceito' where id = v_convite.id;

  insert into public.audit_log (company_id, actor, action, target, meta)
  values (v_convite.company_id, v_uid, 'invitation.accept', v_convite.id::text,
          jsonb_build_object('email', v_convite.email,
                             'role', v_convite.role,
                             'ja_era_membro', v_ja is not null));

  return v_convite.company_id;
end;
$$;

revoke all on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated;

-- ------------------------------------------------------------
-- 4) Equipe com o e-mail de quem ja entrou
-- ------------------------------------------------------------
-- `auth.users` nao e alcancavel pelo client. Esta funcao devolve a lista de
-- membros com e-mail, respeitando o papel de quem pergunta.
create or replace function public.company_members(p_company_id uuid)
returns table (
  membership_id uuid,
  full_name     text,
  email         text,
  role          public.app_role,
  status        public.member_status,
  created_at    timestamptz,
  sou_eu        boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.id, m.full_name, u.email::text, m.role, m.status, m.created_at,
         m.user_id = auth.uid()
  from public.memberships m
  join auth.users u on u.id = m.user_id
  where m.company_id = p_company_id
    and public.auth_role(p_company_id) in ('dono','gerente')
  order by
    case m.role when 'dono' then 0 when 'gerente' then 1 else 2 end,
    m.full_name;
$$;

revoke all on function public.company_members(uuid) from public, anon;
grant execute on function public.company_members(uuid) to authenticated;

-- ------------------------------------------------------------
-- 5) Faxina de convites vencidos
-- ------------------------------------------------------------
-- O indice invitations_pending_email_idx so deixa UM convite pendente por
-- e-mail por empresa. Como `now()` nao pode entrar em indice parcial, um
-- convite vencido continua 'pendente' e travaria o reenvio. A aplicacao
-- chama isto antes de criar um convite novo.
create or replace function public.expire_stale_invitations(p_company_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_n integer;
begin
  if not public.is_manager(p_company_id) then
    raise exception 'Sem permissão' using errcode = 'insufficient_privilege';
  end if;

  update public.invitations
     set status = 'expirado'
   where company_id = p_company_id
     and status = 'pendente'
     and expires_at <= now();

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.expire_stale_invitations(uuid) from public, anon;
grant execute on function public.expire_stale_invitations(uuid) to authenticated;

-- ------------------------------------------------------------
-- 6) Meus convites pendentes
-- ------------------------------------------------------------
-- Deixa o convite ser encontrado pelo e-mail de quem acabou de entrar, sem
-- depender do token viajar na URL. Assim o fluxo funciona mesmo quando o
-- link do e-mail se perde ou o cliente de e-mail reescreve a URL.
create or replace function public.my_pending_invitations()
returns table (
  token        text,
  company_name text,
  full_name    text,
  role         public.app_role,
  expires_at   timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select i.token, c.name, i.full_name, i.role, i.expires_at
  from public.invitations i
  join public.companies c on c.id = i.company_id
  join auth.users u on lower(u.email) = lower(i.email)
  where u.id = auth.uid()
    and i.status = 'pendente'
    and i.expires_at > now()
  order by i.created_at;
$$;

revoke all on function public.my_pending_invitations() from public, anon;
grant execute on function public.my_pending_invitations() to authenticated;
