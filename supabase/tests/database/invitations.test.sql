-- ============================================================
-- GATE DA SPRINT 1 — ciclo convite -> cadastro -> membro ativo
--   npm run db:test
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions, pg_catalog;
select * from no_plan();

-- ------------------------------------------------------------
-- SETUP
-- ------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000','aaaa1111-0000-0000-0000-000000000001','authenticated','authenticated','dono.a@teste.local','x',now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','aaaa1111-0000-0000-0000-000000000003','authenticated','authenticated','gerente.a@teste.local','x',now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','bbbb1111-0000-0000-0000-000000000001','authenticated','authenticated','dono.b@teste.local','x',now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','dddd1111-0000-0000-0000-000000000001','authenticated','authenticated','convidado@teste.local','x',now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','eeee1111-0000-0000-0000-000000000001','authenticated','authenticated','intruso@teste.local','x',now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','ffff1111-0000-0000-0000-000000000001','authenticated','authenticated','vencido@teste.local','x',now(),now(),now());

insert into public.companies (id, name) values
  ('aaaa0000-0000-0000-0000-00000000c001','Padaria A'),
  ('bbbb0000-0000-0000-0000-00000000c001','Mercado B');

insert into public.memberships (id, company_id, user_id, full_name, role) values
  ('aaaa0000-0000-0000-0000-0000000d0001','aaaa0000-0000-0000-0000-00000000c001','aaaa1111-0000-0000-0000-000000000001','Dono A','dono'),
  ('aaaa0000-0000-0000-0000-0000000f0001','aaaa0000-0000-0000-0000-00000000c001','aaaa1111-0000-0000-0000-000000000003','Gerente A','gerente'),
  ('bbbb0000-0000-0000-0000-0000000d0001','bbbb0000-0000-0000-0000-00000000c001','bbbb1111-0000-0000-0000-000000000001','Dono B','dono');

-- Convites com token fixo para o teste conseguir usar depois.
insert into public.invitations (company_id, email, full_name, role, token, created_by, expires_at)
values
  ('aaaa0000-0000-0000-0000-00000000c001','convidado@teste.local','Convidado','funcionario',
   'tok_valido','aaaa1111-0000-0000-0000-000000000001', now() + interval '7 days'),
  ('aaaa0000-0000-0000-0000-00000000c001','vencido@teste.local','Vencido','funcionario',
   'tok_expirado','aaaa1111-0000-0000-0000-000000000001', now() - interval '1 day'),
  ('bbbb0000-0000-0000-0000-00000000c001','convidado@teste.local','Convidado na B','gerente',
   'tok_empresa_b','bbbb1111-0000-0000-0000-000000000001', now() + interval '7 days');

-- ============================================================
-- 1) QUEM PODE CONVIDAR QUEM
-- ============================================================
select set_config('request.jwt.claims',
  '{"sub":"aaaa1111-0000-0000-0000-000000000003","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $q$insert into public.invitations (company_id, email, full_name, role, created_by)
     values ('aaaa0000-0000-0000-0000-00000000c001','novo.func@teste.local',
             'Novo Func','funcionario','aaaa1111-0000-0000-0000-000000000003')$q$,
  'gerente pode convidar funcionario');

-- Sem esta regra o gerente contornaria can_manage_member pelo convite.
select throws_ok(
  $q$insert into public.invitations (company_id, email, full_name, role, created_by)
     values ('aaaa0000-0000-0000-0000-00000000c001','novo.ger@teste.local',
             'Novo Ger','gerente','aaaa1111-0000-0000-0000-000000000003')$q$,
  '42501', null::text,
  'gerente NAO pode convidar gerente');

select throws_ok(
  $q$insert into public.invitations (company_id, email, full_name, role, created_by)
     values ('aaaa0000-0000-0000-0000-00000000c001','novo.dono@teste.local',
             'Novo Dono','dono','aaaa1111-0000-0000-0000-000000000003')$q$,
  '42501', null::text,
  'gerente NAO pode convidar dono');

reset role;
select set_config('request.jwt.claims',
  '{"sub":"aaaa1111-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $q$insert into public.invitations (company_id, email, full_name, role, created_by)
     values ('aaaa0000-0000-0000-0000-00000000c001','ger2@teste.local',
             'Gerente 2','gerente','aaaa1111-0000-0000-0000-000000000001')$q$,
  'dono pode convidar gerente');

select throws_ok(
  $q$insert into public.invitations (company_id, email, full_name, role, created_by)
     values ('bbbb0000-0000-0000-0000-00000000c001','x@teste.local',
             'X','funcionario','aaaa1111-0000-0000-0000-000000000001')$q$,
  '42501', null::text,
  'dono da A NAO pode convidar para a empresa B');

-- Indice parcial invitations_pending_email_idx. Por isso a aplicacao expira
-- os vencidos antes de criar um novo (ver expire_stale_invitations).
select throws_ok(
  $q$insert into public.invitations (company_id, email, full_name, role, created_by)
     values ('aaaa0000-0000-0000-0000-00000000c001','convidado@teste.local',
             'Duplicado','funcionario','aaaa1111-0000-0000-0000-000000000001')$q$,
  '23505', null::text,
  'nao ha dois convites pendentes para o mesmo e-mail na mesma empresa');

-- ============================================================
-- 2) PREVIA SEM SESSAO
-- ============================================================
reset role;
select set_config('request.jwt.claims', '', true);
set local role anon;

select is((select company_name from public.invitation_preview('tok_valido')),
  'Padaria A', 'anon consegue ver de qual empresa e o convite');

select is((select expirado from public.invitation_preview('tok_expirado')),
  true, 'a previa marca o convite vencido como expirado');

select is((select count(*) from public.invitation_preview('token_que_nao_existe'))::int,
  0, 'token inexistente nao devolve nada');

select throws_ok(
  $q$select public.accept_invitation('tok_valido')$q$,
  '42501', null::text,
  'anon NAO consegue aceitar convite');

-- ============================================================
-- 3) ACEITE — o e-mail tem que bater
-- ============================================================
reset role;
select set_config('request.jwt.claims',
  '{"sub":"eeee1111-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

-- Cenario real: o convidado encaminha o e-mail, ou o link vaza.
select throws_ok(
  $q$select public.accept_invitation('tok_valido')$q$,
  '42501', null::text,
  'quem nao e o destinatario NAO aceita o convite, mesmo com o token certo');

select is((select count(*) from public.memberships
           where user_id = 'eeee1111-0000-0000-0000-000000000001')::int, 0,
  'e nenhum vinculo foi criado para o intruso');

-- ============================================================
-- 4) ACEITE — vencido, inexistente e caminho feliz
-- ============================================================
reset role;
select set_config('request.jwt.claims',
  '{"sub":"ffff1111-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*) from public.my_pending_invitations())::int, 0,
  'convite vencido nao aparece na lista de pendentes');

select throws_ok(
  $q$select public.accept_invitation('tok_expirado')$q$,
  '23514', null::text,
  'convite vencido e recusado');

-- O status NAO muda na tentativa: o raise desfaz a transacao. Quem grava a
-- mudanca e a faxina, chamada por quem administra.
reset role;
select is((select status from public.invitations where token = 'tok_expirado'),
  'pendente', 'a tentativa recusada nao muda o status sozinha');

select set_config('request.jwt.claims',
  '{"sub":"aaaa1111-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select is(public.expire_stale_invitations('aaaa0000-0000-0000-0000-00000000c001'), 1,
  'a faxina marca exatamente o convite vencido');

reset role;
select is((select status from public.invitations where token = 'tok_expirado'),
  'expirado', 'e agora ele consta como expirado');

select set_config('request.jwt.claims',
  '{"sub":"dddd1111-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

-- Sem token na mao: o convite e achado pelo e-mail de quem entrou.
select is((select count(*) from public.my_pending_invitations())::int, 2,
  'o convidado ve os 2 convites pendentes dele sem precisar do token');

select throws_ok(
  $q$select public.accept_invitation('nao_existe')$q$,
  'P0002', null::text,
  'token inexistente e recusado');

select is(public.accept_invitation('tok_valido'),
  'aaaa0000-0000-0000-0000-00000000c001'::uuid,
  'convite valido devolve a empresa certa');

reset role;
select is((select role::text from public.memberships
           where user_id = 'dddd1111-0000-0000-0000-000000000001'
             and company_id = 'aaaa0000-0000-0000-0000-00000000c001'),
  'funcionario', 'o convidado virou membro com o papel do convite');

select is((select status::text from public.memberships
           where user_id = 'dddd1111-0000-0000-0000-000000000001'
             and company_id = 'aaaa0000-0000-0000-0000-00000000c001'),
  'ativo', 'e entrou como ativo');

select is((select status from public.invitations where token = 'tok_valido'),
  'aceito', 'o convite foi marcado como aceito');

-- Escopado na empresa do teste: contar a tabela inteira faria o teste
-- depender de o banco estar vazio.
select is((select count(*) from public.audit_log
           where action = 'invitation.accept'
             and company_id = 'aaaa0000-0000-0000-0000-00000000c001')::int, 1,
  'o aceite foi registrado na auditoria');

-- ============================================================
-- 5) NAO REAPROVEITAR CONVITE / NAO VAZAR ENTRE EMPRESAS
-- ============================================================
select set_config('request.jwt.claims',
  '{"sub":"dddd1111-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select throws_ok(
  $q$select public.accept_invitation('tok_valido')$q$,
  '23514', null::text,
  'o mesmo convite nao pode ser usado duas vezes');

-- O convite da B e legitimo e para o mesmo e-mail: tem que criar vinculo na
-- B, e SO na B.
select is(public.accept_invitation('tok_empresa_b'),
  'bbbb0000-0000-0000-0000-00000000c001'::uuid,
  'convite da empresa B leva para a empresa B');

select is((select count(*) from public.my_workspaces())::int, 2,
  'o convidado agora participa das duas empresas, sem mistura');

select is((select role::text from public.my_workspaces()
           where company_id = 'aaaa0000-0000-0000-0000-00000000c001'),
  'funcionario', 'papel na A continua funcionario');

select is((select role::text from public.my_workspaces()
           where company_id = 'bbbb0000-0000-0000-0000-00000000c001'),
  'gerente', 'papel na B e gerente, como o convite dizia');

-- ============================================================
-- 6) LISTA DA EQUIPE
-- ============================================================
reset role;
select set_config('request.jwt.claims',
  '{"sub":"aaaa1111-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*) from public.company_members('aaaa0000-0000-0000-0000-00000000c001'))::int,
  3, 'dono lista os 3 membros da propria empresa');

select is((select count(*) from public.company_members('bbbb0000-0000-0000-0000-00000000c001'))::int,
  0, 'e nao lista ninguem da empresa alheia');

select is((select email from public.company_members('aaaa0000-0000-0000-0000-00000000c001')
           where sou_eu), 'dono.a@teste.local',
  'a lista traz o e-mail e marca quem sou eu');

reset role;
select set_config('request.jwt.claims',
  '{"sub":"dddd1111-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*) from public.company_members('aaaa0000-0000-0000-0000-00000000c001'))::int,
  0, 'funcionario nao lista a equipe');

select * from finish();
rollback;
