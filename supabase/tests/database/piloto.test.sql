-- ============================================================
-- GATE DA SPRINT 8 — o que só importa com gente de verdade usando
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
  ('00000000-0000-0000-0000-000000000000','aaaa1111-0000-0000-0000-000000000002','authenticated','authenticated','carla@teste.local','x',now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','aaaa1111-0000-0000-0000-000000000003','authenticated','authenticated','gerente.a@teste.local','x',now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','bbbb1111-0000-0000-0000-000000000001','authenticated','authenticated','dono.b@teste.local','x',now(),now(),now());

insert into public.companies (id, name, timezone) values
  ('aaaa0000-0000-0000-0000-00000000c001','Padaria A','America/Recife'),
  ('bbbb0000-0000-0000-0000-00000000c001','Mercado B','America/Recife');

insert into public.memberships (id, company_id, user_id, full_name, role) values
  ('aaaa0000-0000-0000-0000-0000000d0001','aaaa0000-0000-0000-0000-00000000c001','aaaa1111-0000-0000-0000-000000000001','Dono A','dono'),
  ('aaaa0000-0000-0000-0000-0000000e0001','aaaa0000-0000-0000-0000-00000000c001','aaaa1111-0000-0000-0000-000000000002','Carla','funcionario'),
  ('aaaa0000-0000-0000-0000-0000000f0001','aaaa0000-0000-0000-0000-00000000c001','aaaa1111-0000-0000-0000-000000000003','Gerente A','gerente'),
  ('bbbb0000-0000-0000-0000-0000000d0001','bbbb0000-0000-0000-0000-00000000c001','bbbb1111-0000-0000-0000-000000000001','Dono B','dono');

insert into public.locations (id, company_id, name, lat, lng, radius_m) values
  ('aaaa0000-0000-0000-0000-0000000a0001','aaaa0000-0000-0000-0000-00000000c001','Centro',-8.06,-34.87,100);

insert into public.shift_templates (company_id, key, label, start_time, end_time, break_minutes) values
  ('aaaa0000-0000-0000-0000-00000000c001','dia','Dia','08:00','17:00',60);

-- ============================================================
-- 1) LIMITE DE REQUISIÇÃO
-- ============================================================
-- /api/punch aceita coordenada e responde se aquele ponto vale. Sem limite,
-- dá para varrer o mapa até achar o raio da unidade.
select is(public.check_rate_limit('teste:1', 3, 60), true,  'primeira tentativa passa');
select is(public.check_rate_limit('teste:1', 3, 60), true,  'segunda passa');
select is(public.check_rate_limit('teste:1', 3, 60), true,  'terceira passa');
select is(public.check_rate_limit('teste:1', 3, 60), false, 'a quarta é barrada');

-- Chaves diferentes não se atrapalham: uma pessoa martelando não trava a
-- outra que está tentando bater o ponto de verdade.
select is(public.check_rate_limit('teste:2', 3, 60), true,
  'outra chave continua livre');

select is((select count(*) from public.rate_events where chave = 'teste:1')::int, 3,
  'só as tentativas aceitas ficam registradas');

-- ============================================================
-- 2) FILA DE AVISOS
-- ============================================================
select set_config('request.jwt.claims',
  '{"sub":"aaaa1111-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select public.set_weekday_shift('aaaa0000-0000-0000-0000-0000000e0001', 1::smallint, 'dia');
select public.set_weekday_shift('aaaa0000-0000-0000-0000-0000000e0001', 2::smallint, 'dia');
select public.set_weekday_shift('aaaa0000-0000-0000-0000-0000000e0001', 3::smallint, 'dia');

select is(public.queue_schedule_notices('aaaa0000-0000-0000-0000-00000000c001'), 1,
  'três mudanças na escala de uma pessoa geram UM aviso, não três');

select is((select count(*) from public.outbox)::int, 1,
  'e a fila tem uma mensagem só');

select alike((select corpo from public.outbox limit 1), '%3 alteração(ões)%',
  'a mensagem diz quantas alterações houve');

select is(public.queue_schedule_notices('aaaa0000-0000-0000-0000-00000000c001'), 0,
  'rodar de novo não duplica aviso enquanto o anterior está pendente');

select is((select status::text from public.outbox limit 1), 'pendente',
  'a mensagem fica pendente até alguém enviar');

-- ============================================================
-- 3) IMPORTAR EQUIPE
-- ============================================================
select is((select count(*) from public.bulk_invite(
   'aaaa0000-0000-0000-0000-00000000c001',
   '[{"nome":"Novo Um","email":"um@teste.local"},
     {"nome":"Novo Dois","email":"dois@teste.local","papel":"gerente"},
     {"nome":"Sem Arroba","email":"invalido"},
     {"nome":"","email":"tres@teste.local"},
     {"nome":"Ja Membro","email":"carla@teste.local"}]'::jsonb))::int, 5,
  'a importação devolve uma linha por pessoa da lista');

select is((select resultado from public.bulk_invite(
   'aaaa0000-0000-0000-0000-00000000c001',
   '[{"nome":"Novo Tres","email":"quatro@teste.local"}]'::jsonb)), 'convidado',
  'quem está em ordem é convidado');

select is((select resultado from public.bulk_invite(
   'aaaa0000-0000-0000-0000-00000000c001',
   '[{"nome":"X","email":"nao-tem-arroba"}]'::jsonb)), 'e-mail inválido',
  'e-mail sem arroba é recusado com motivo, não em silêncio');

select is((select resultado from public.bulk_invite(
   'aaaa0000-0000-0000-0000-00000000c001',
   '[{"nome":"Y","email":"carla@teste.local"}]'::jsonb)), 'já é membro',
  'quem já é da casa não recebe convite');

select is((select resultado from public.bulk_invite(
   'aaaa0000-0000-0000-0000-00000000c001',
   '[{"nome":"Z","email":"um@teste.local"}]'::jsonb)), 'já tinha convite pendente',
  'e convite repetido é reportado em vez de estourar');

-- Uma linha ruim no meio não derruba a importação inteira.
select is((select count(*) from public.invitations
           where company_id = 'aaaa0000-0000-0000-0000-00000000c001'
             and email in ('um@teste.local','dois@teste.local','quatro@teste.local'))::int, 3,
  'as linhas válidas entram mesmo com linhas inválidas na mesma lista');

-- O teto de privilégio vale aqui também.
reset role;
select set_config('request.jwt.claims',
  '{"sub":"aaaa1111-0000-0000-0000-000000000003","role":"authenticated"}', true);
set local role authenticated;

select is((select resultado from public.bulk_invite(
   'aaaa0000-0000-0000-0000-00000000c001',
   '[{"nome":"Chefe","email":"chefe@teste.local","papel":"dono"}]'::jsonb)),
  'você não pode convidar com esse papel',
  'gerente não escapa do teto de privilégio pela importação em lote');

reset role;
select set_config('request.jwt.claims',
  '{"sub":"aaaa1111-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;

select throws_ok(
  $q$select * from public.bulk_invite('aaaa0000-0000-0000-0000-00000000c001',
     '[{"nome":"A","email":"a@teste.local"}]'::jsonb)$q$,
  '42501', null::text,
  'funcionário não importa equipe');

-- ============================================================
-- 4) LGPD — SAÍDA DE DADOS
-- ============================================================
reset role;
select set_config('request.jwt.claims',
  '{"sub":"aaaa1111-0000-0000-0000-000000000003","role":"authenticated"}', true);
set local role authenticated;

select throws_ok(
  $q$select public.export_company_data('aaaa0000-0000-0000-0000-00000000c001')$q$,
  '42501', null::text,
  'nem o gerente exporta a base inteira');

reset role;
select set_config('request.jwt.claims',
  '{"sub":"aaaa1111-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select is((select jsonb_array_length(
             public.export_company_data('aaaa0000-0000-0000-0000-00000000c001')->'membros'))::int, 3,
  'a exportação traz os membros da empresa');

select isnt((select public.export_company_data(
               'aaaa0000-0000-0000-0000-00000000c001')->'empresa'), null,
  'com os dados da empresa');

-- Duas porque os dois testes acima chamaram a função: CADA exportação da
-- base deixa rastro, e é isso que se quer poder auditar depois.
select is((select count(*) from public.audit_log
           where action = 'company.export')::int, 2,
  'cada exportação da base fica registrada na auditoria');

-- ============================================================
-- 5) LGPD — ELIMINAÇÃO
-- ============================================================
-- Um clique errado aqui apaga o histórico de jornada de todo mundo.
select throws_ok(
  $q$select public.delete_company('aaaa0000-0000-0000-0000-00000000c001','Padaria')$q$,
  '23514', null::text,
  'nome parcial não confirma a exclusão');

select throws_ok(
  $q$select public.delete_company('aaaa0000-0000-0000-0000-00000000c001','')$q$,
  '23514', null::text,
  'nem confirmação vazia');

reset role;
select set_config('request.jwt.claims',
  '{"sub":"aaaa1111-0000-0000-0000-000000000003","role":"authenticated"}', true);
set local role authenticated;

select throws_ok(
  $q$select public.delete_company('aaaa0000-0000-0000-0000-00000000c001','Padaria A')$q$,
  '42501', null::text,
  'gerente não apaga a empresa nem com o nome certo');

-- Apagar de verdade: leva tudo junto, inclusive o ponto append-only.
reset role;
select set_config('request.jwt.claims',
  '{"sub":"bbbb1111-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $q$select public.delete_company('bbbb0000-0000-0000-0000-00000000c001','Mercado B')$q$,
  'o dono apaga a própria empresa digitando o nome exato');

reset role;
select is((select count(*) from public.companies
           where id = 'bbbb0000-0000-0000-0000-00000000c001')::int, 0,
  'e a empresa some');

select is((select count(*) from public.memberships
           where company_id = 'bbbb0000-0000-0000-0000-00000000c001')::int, 0,
  'levando os vínculos junto');

-- ============================================================
-- 6) SAÚDE DA OPERAÇÃO
-- ============================================================
select set_config('request.jwt.claims',
  '{"sub":"aaaa1111-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select isnt((select avisos_na_fila from public.operation_health(
               'aaaa0000-0000-0000-0000-00000000c001')), null,
  'o painel de saúde responde para quem administra');

select is((select avisos_na_fila from public.operation_health(
             'aaaa0000-0000-0000-0000-00000000c001')), 1,
  'e conta o aviso que ficou na fila');

reset role;
select set_config('request.jwt.claims',
  '{"sub":"aaaa1111-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*) from public.operation_health(
             'aaaa0000-0000-0000-0000-00000000c001'))::int, 0,
  'funcionário não recebe o painel de saúde da operação');

-- ============================================================
-- 7) A FILA NÃO VAZA ENTRE EMPRESAS
-- ============================================================
select is((select count(*) from public.outbox)::int, 0,
  'funcionário não lê a fila de mensagens da empresa');

select * from finish();
rollback;
