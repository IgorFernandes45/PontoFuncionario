-- ============================================================
-- GATE DA SPRINT 0 — isolamento multi-tenant provado no banco
--   npm run db:test
--
-- Nota sobre o que se espera de cada bloqueio:
--   USING     filtra em silencio -> 0 linhas, SEM erro
--   WITH CHECK rejeita a escrita  -> 42501
-- Por isso alguns testes esperam excecao e outros esperam "nao mudou nada".
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions, pg_catalog;
select * from no_plan();

-- ------------------------------------------------------------
-- SETUP  (superuser: RLS nao se aplica, e proposital)
-- ------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000','aaaa1111-0000-0000-0000-000000000001','authenticated','authenticated','dono.a@teste.local','x',now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','aaaa1111-0000-0000-0000-000000000002','authenticated','authenticated','func.a@teste.local','x',now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','aaaa1111-0000-0000-0000-000000000003','authenticated','authenticated','gerente.a@teste.local','x',now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','bbbb1111-0000-0000-0000-000000000001','authenticated','authenticated','dono.b@teste.local','x',now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','cccc1111-0000-0000-0000-000000000001','authenticated','authenticated','sem.vinculo@teste.local','x',now(),now(),now());

insert into public.companies (id, name) values
  ('aaaa0000-0000-0000-0000-00000000c001','Padaria A'),
  ('bbbb0000-0000-0000-0000-00000000c001','Mercado B');

insert into public.memberships (id, company_id, user_id, full_name, role) values
  ('aaaa0000-0000-0000-0000-0000000d0001','aaaa0000-0000-0000-0000-00000000c001','aaaa1111-0000-0000-0000-000000000001','Dono A','dono'),
  ('aaaa0000-0000-0000-0000-0000000e0001','aaaa0000-0000-0000-0000-00000000c001','aaaa1111-0000-0000-0000-000000000002','Func A','funcionario'),
  ('aaaa0000-0000-0000-0000-0000000f0001','aaaa0000-0000-0000-0000-00000000c001','aaaa1111-0000-0000-0000-000000000003','Gerente A','gerente'),
  ('bbbb0000-0000-0000-0000-0000000d0001','bbbb0000-0000-0000-0000-00000000c001','bbbb1111-0000-0000-0000-000000000001','Dono B','dono');

insert into public.audit_log (company_id, actor, action)
values ('aaaa0000-0000-0000-0000-00000000c001','aaaa1111-0000-0000-0000-000000000001','seed');

-- ============================================================
-- 1) DONO DA EMPRESA A
-- ============================================================
select set_config('request.jwt.claims',
  '{"sub":"aaaa1111-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*) from public.companies)::int, 1,
  'dono A enxerga exatamente 1 empresa');

select is((select name from public.companies), 'Padaria A',
  'e a empresa que ele enxerga e a dele');

select is((select count(*) from public.memberships
           where company_id = 'bbbb0000-0000-0000-0000-00000000c001')::int, 0,
  'dono A nao enxerga NENHUM membro da empresa B');

select is((select count(*) from public.memberships)::int, 3,
  'dono A enxerga os 3 membros da propria empresa');

select is((select count(*) from public.my_workspaces())::int, 1,
  'my_workspaces() devolve so a empresa do usuario');

select is(public.auth_role('aaaa0000-0000-0000-0000-00000000c001')::text, 'dono',
  'papel na propria empresa e dono');

select is(public.auth_role('bbbb0000-0000-0000-0000-00000000c001'), null,
  'papel na empresa alheia e nulo');

-- tenta renomear a empresa do vizinho: RLS filtra, afeta 0 linhas, sem erro
update public.companies set name = 'INVADIDA'
 where id = 'bbbb0000-0000-0000-0000-00000000c001';

-- dono cria convite na propria empresa (usado no teste do funcionario)
insert into public.invitations (company_id, email, full_name, created_by)
values ('aaaa0000-0000-0000-0000-00000000c001','novo@teste.local','Novo',
        'aaaa1111-0000-0000-0000-000000000001');

select lives_ok(
  $q$insert into public.memberships (company_id, user_id, full_name, role)
     values ('aaaa0000-0000-0000-0000-00000000c001',
             'bbbb1111-0000-0000-0000-000000000001','Dono B como func','funcionario')$q$,
  'dono pode adicionar membro na propria empresa');

select lives_ok(
  $q$update public.memberships set role = 'gerente'
      where id = 'aaaa0000-0000-0000-0000-0000000e0001'$q$,
  'dono pode promover funcionario a gerente');

-- desfaz para os testes seguintes continuarem com um funcionario de verdade
update public.memberships set role = 'funcionario'
 where id = 'aaaa0000-0000-0000-0000-0000000e0001';

select throws_ok(
  $q$insert into public.memberships (company_id, user_id, full_name, role)
     values ('bbbb0000-0000-0000-0000-00000000c001',
             'aaaa1111-0000-0000-0000-000000000001','Intruso','gerente')$q$,
  '42501', null::text,
  'dono A NAO pode inserir membro na empresa B');

reset role;
select is((select name from public.companies
           where id = 'bbbb0000-0000-0000-0000-00000000c001'), 'Mercado B',
  'o update cruzado nao alterou nada na empresa B');

-- ============================================================
-- 2) GERENTE — o teto de privilegio dele
-- ============================================================
select set_config('request.jwt.claims',
  '{"sub":"aaaa1111-0000-0000-0000-000000000003","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $q$update public.memberships set full_name = 'Func A editado'
      where id = 'aaaa0000-0000-0000-0000-0000000e0001'$q$,
  'gerente pode editar um funcionario');

select is((select full_name from public.memberships
           where id = 'aaaa0000-0000-0000-0000-0000000e0001'), 'Func A editado',
  'e a edicao do gerente valeu de fato');

-- USING passa (a linha ainda e 'funcionario'), WITH CHECK barra o novo papel
select throws_ok(
  $q$update public.memberships set role = 'gerente'
      where id = 'aaaa0000-0000-0000-0000-0000000e0001'$q$,
  '42501', null::text,
  'gerente NAO pode promover funcionario a gerente');

-- ESCALADA DE PRIVILEGIO: USING nem enxerga a propria linha (role='gerente'),
-- entao o update passa batido sem afetar nada.
update public.memberships set role = 'dono'
 where id = 'aaaa0000-0000-0000-0000-0000000f0001';

select is((select role::text from public.memberships
           where id = 'aaaa0000-0000-0000-0000-0000000f0001'), 'gerente',
  'gerente NAO consegue se promover a dono');

delete from public.memberships
 where id = 'aaaa0000-0000-0000-0000-0000000d0001';

select isnt_empty(
  $q$select 1 from public.memberships
      where id = 'aaaa0000-0000-0000-0000-0000000d0001'$q$,
  'gerente NAO consegue remover o dono');

-- ============================================================
-- 3) FUNCIONARIO DA EMPRESA A
-- ============================================================
reset role;
select set_config('request.jwt.claims',
  '{"sub":"aaaa1111-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*) from public.companies)::int, 1,
  'funcionario enxerga a propria empresa');

select is((select count(*) from public.invitations)::int, 0,
  'funcionario NAO enxerga convites, nem da propria empresa');

select throws_ok(
  $q$insert into public.memberships (company_id, user_id, full_name, role)
     values ('aaaa0000-0000-0000-0000-00000000c001',
             'cccc1111-0000-0000-0000-000000000001','Contratado por func','funcionario')$q$,
  '42501', null::text,
  'funcionario NAO pode criar membro');

update public.memberships set role = 'dono'
 where id = 'aaaa0000-0000-0000-0000-0000000e0001';

select is((select role::text from public.memberships
           where id = 'aaaa0000-0000-0000-0000-0000000e0001'), 'funcionario',
  'funcionario NAO consegue se promover a dono');

-- ============================================================
-- 4) USUARIO SEM VINCULO  +  bootstrap da empresa
-- ============================================================
reset role;
select set_config('request.jwt.claims',
  '{"sub":"cccc1111-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*) from public.companies)::int, 0,
  'usuario sem vinculo nao enxerga empresa nenhuma');

select is((select count(*) from public.memberships)::int, 0,
  'usuario sem vinculo nao enxerga membro nenhum');

select is((select count(*) from public.my_workspaces())::int, 0,
  'my_workspaces() vazio para quem nao tem vinculo');

select lives_ok(
  $q$select public.create_company_with_owner('Bar do C','Carlos','America/Recife')$q$,
  'usuario sem vinculo cria a propria empresa via RPC');

select is((select count(*) from public.my_workspaces())::int, 1,
  'apos a RPC ele passa a ter exatamente 1 workspace');

select is((select role::text from public.my_workspaces()), 'dono',
  'e entra nela como dono');

select throws_ok(
  $q$select public.create_company_with_owner('Fuso Errado','Carlos','Marte/Olympus')$q$,
  '23514', null::text,
  'a RPC recusa fuso horario inexistente');

-- ============================================================
-- 5) ANON e imutabilidade
-- ============================================================
reset role;
set local role anon;

select throws_ok(
  $q$select count(*) from public.companies$q$,
  '42501', null::text,
  'anon nem alcanca a tabela companies');

reset role;

select throws_ok(
  $q$update public.audit_log set action = 'adulterado'$q$,
  '23001', null::text,
  'audit_log e append-only: update bloqueado por trigger');

select throws_ok(
  $q$delete from public.memberships
      where id = 'aaaa0000-0000-0000-0000-0000000d0001'$q$,
  '23001', null::text,
  'nao da para remover o ultimo dono da empresa');

select lives_ok(
  $q$delete from public.companies
      where id = 'aaaa0000-0000-0000-0000-00000000c001'$q$,
  'apagar a empresa em cascata nao esbarra na protecao do ultimo dono');

select * from finish();
rollback;
