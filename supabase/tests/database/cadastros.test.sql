-- ============================================================
-- GATE DA SPRINT 2 — membros, turnos e unidades
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
  ('00000000-0000-0000-0000-000000000000','aaaa1111-0000-0000-0000-000000000002','authenticated','authenticated','func.a@teste.local','x',now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','aaaa1111-0000-0000-0000-000000000003','authenticated','authenticated','gerente.a@teste.local','x',now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','aaaa1111-0000-0000-0000-000000000004','authenticated','authenticated','func2.a@teste.local','x',now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','bbbb1111-0000-0000-0000-000000000001','authenticated','authenticated','dono.b@teste.local','x',now(),now(),now());

insert into public.companies (id, name) values
  ('aaaa0000-0000-0000-0000-00000000c001','Padaria A'),
  ('bbbb0000-0000-0000-0000-00000000c001','Mercado B');

insert into public.memberships (id, company_id, user_id, full_name, role) values
  ('aaaa0000-0000-0000-0000-0000000d0001','aaaa0000-0000-0000-0000-00000000c001','aaaa1111-0000-0000-0000-000000000001','Dono A','dono'),
  ('aaaa0000-0000-0000-0000-0000000e0001','aaaa0000-0000-0000-0000-00000000c001','aaaa1111-0000-0000-0000-000000000002','Func A','funcionario'),
  ('aaaa0000-0000-0000-0000-0000000f0001','aaaa0000-0000-0000-0000-00000000c001','aaaa1111-0000-0000-0000-000000000003','Gerente A','gerente'),
  ('aaaa0000-0000-0000-0000-0000000e0002','aaaa0000-0000-0000-0000-00000000c001','aaaa1111-0000-0000-0000-000000000004','Func A2','funcionario'),
  ('bbbb0000-0000-0000-0000-0000000d0001','bbbb0000-0000-0000-0000-00000000c001','bbbb1111-0000-0000-0000-000000000001','Dono B','dono');

-- ============================================================
-- 1) DURAÇÃO DE TURNO
-- ============================================================
select is(public.shift_duration_minutes('08:00','17:00'), 540,
  'turno diurno de 9 horas dá 540 minutos');

select is(public.shift_duration_minutes('22:00','06:00'), 480,
  'turno que vira o dia dá 480 minutos, não negativo');

-- ============================================================
-- 2) TURNOS — validação
-- ============================================================
select set_config('request.jwt.claims',
  '{"sub":"aaaa1111-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $q$insert into public.shift_templates
       (company_id, key, label, start_time, end_time, break_minutes)
     values ('aaaa0000-0000-0000-0000-00000000c001','integral','Integral',
             '08:00','18:00', 60)$q$,
  'dono cria turno com intervalo');

select throws_ok(
  $q$insert into public.shift_templates
       (company_id, key, label, start_time, end_time, break_minutes)
     values ('aaaa0000-0000-0000-0000-00000000c001','absurdo','Absurdo',
             '08:00','12:00', 300)$q$,
  '23514', null::text,
  'intervalo maior que a jornada é recusado');

select throws_ok(
  $q$insert into public.shift_templates
       (company_id, key, label, start_time, end_time)
     values ('aaaa0000-0000-0000-0000-00000000c001','nulo','Nulo',
             '08:00','08:00')$q$,
  '23514', null::text,
  'turno de duração zero é recusado');

select throws_ok(
  $q$insert into public.shift_templates
       (company_id, key, label, start_time, end_time)
     values ('aaaa0000-0000-0000-0000-00000000c001','Manhã Cedo','X',
             '06:00','12:00')$q$,
  '23514', null::text,
  'chave de turno com espaço e maiúscula é recusada');

select throws_ok(
  $q$insert into public.shift_templates
       (company_id, key, label, start_time, end_time)
     values ('aaaa0000-0000-0000-0000-00000000c001','integral','Duplicado',
             '09:00','18:00')$q$,
  '23505', null::text,
  'duas chaves iguais na mesma empresa são recusadas');

-- Turno que vira o dia com intervalo: o caso que a conta ingênua quebrava.
select lives_ok(
  $q$insert into public.shift_templates
       (company_id, key, label, start_time, end_time, break_minutes)
     values ('aaaa0000-0000-0000-0000-00000000c001','madrugada','Madrugada',
             '22:00','06:00', 60)$q$,
  'turno noturno com intervalo é aceito');

select throws_ok(
  $q$insert into public.shift_templates
       (company_id, key, label, start_time, end_time)
     values ('bbbb0000-0000-0000-0000-00000000c001','invasor','Invasor',
             '08:00','17:00')$q$,
  '42501', null::text,
  'dono da A não cria turno na empresa B');

-- ============================================================
-- 3) UNIDADES — validação
-- ============================================================
select lives_ok(
  $q$insert into public.locations (company_id, name, lat, lng, radius_m)
     values ('aaaa0000-0000-0000-0000-00000000c001','Loja Centro',
             -8.0476, -34.8770, 100)$q$,
  'dono cria unidade com coordenada e raio');

select throws_ok(
  $q$insert into public.locations (company_id, name, lat, lng, radius_m)
     values ('aaaa0000-0000-0000-0000-00000000c001','Raio Absurdo',
             -8.0476, -34.8770, 5)$q$,
  '23514', null::text,
  'raio menor que 20 m é recusado');

select throws_ok(
  $q$insert into public.locations (company_id, name, lat, lng, radius_m)
     values ('aaaa0000-0000-0000-0000-00000000c001','Raio Inutil',
             -8.0476, -34.8770, 9000)$q$,
  '23514', null::text,
  'raio maior que 2 km é recusado');

-- Unidade por GPS sem coordenada não valida nada: é pior que não ter unidade.
select throws_ok(
  $q$insert into public.locations (company_id, name, method)
     values ('aaaa0000-0000-0000-0000-00000000c001','Sem Coordenada','gps')$q$,
  '23514', null::text,
  'unidade por GPS sem coordenada é recusada');

select throws_ok(
  $q$insert into public.locations (company_id, name, lat, lng)
     values ('aaaa0000-0000-0000-0000-00000000c001','Polo Norte Falso',
             120.0, -34.8770)$q$,
  '23514', null::text,
  'latitude fora de -90..90 é recusada');

-- ============================================================
-- 4) O QUE O FUNCIONÁRIO PODE
-- ============================================================
reset role;
select set_config('request.jwt.claims',
  '{"sub":"aaaa1111-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;

-- Ele precisa ver: é o horário do próprio turno e o lugar onde vai bater ponto.
select isnt_empty(
  $q$select 1 from public.shift_templates$q$,
  'funcionário LÊ os turnos da empresa');

select isnt_empty(
  $q$select 1 from public.locations$q$,
  'funcionário LÊ as unidades da empresa');

select throws_ok(
  $q$insert into public.shift_templates (company_id, key, label, start_time, end_time)
     values ('aaaa0000-0000-0000-0000-00000000c001','pirata','Pirata','01:00','02:00')$q$,
  '42501', null::text,
  'funcionário NÃO cria turno');

select throws_ok(
  $q$insert into public.locations (company_id, name, lat, lng)
     values ('aaaa0000-0000-0000-0000-00000000c001','Casa dele',-8.0,-34.0)$q$,
  '42501', null::text,
  'funcionário NÃO cria unidade');

-- ============================================================
-- 5) EMPRESA VIZINHA NÃO ENXERGA NADA
-- ============================================================
reset role;
select set_config('request.jwt.claims',
  '{"sub":"bbbb1111-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*) from public.shift_templates)::int, 0,
  'dono da B não enxerga turno nenhum da A');

select is((select count(*) from public.locations)::int, 0,
  'dono da B não enxerga unidade nenhuma da A');

-- ============================================================
-- 6) GESTÃO DE MEMBROS — papel
-- ============================================================
reset role;
select set_config('request.jwt.claims',
  '{"sub":"aaaa1111-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $q$select public.set_member_role('aaaa0000-0000-0000-0000-0000000e0001','gerente')$q$,
  'dono promove funcionário a gerente');

select is((select role::text from public.memberships
           where id = 'aaaa0000-0000-0000-0000-0000000e0001'), 'gerente',
  'e a promoção valeu');

select is((select count(*) from public.audit_log
           where action = 'member.role_change'
             and company_id = 'aaaa0000-0000-0000-0000-00000000c001')::int, 1,
  'a mudança de papel foi auditada');

-- Rebaixar-se é um jeito silencioso de perder o acesso.
select throws_ok(
  $q$select public.set_member_role('aaaa0000-0000-0000-0000-0000000d0001','funcionario')$q$,
  '42501', null::text,
  'ninguém altera o próprio papel');

-- Volta ao que era, para os testes seguintes.
select public.set_member_role('aaaa0000-0000-0000-0000-0000000e0001','funcionario');

reset role;
select set_config('request.jwt.claims',
  '{"sub":"aaaa1111-0000-0000-0000-000000000003","role":"authenticated"}', true);
set local role authenticated;

select throws_ok(
  $q$select public.set_member_role('aaaa0000-0000-0000-0000-0000000e0001','gerente')$q$,
  '42501', null::text,
  'gerente NÃO promove funcionário a gerente');

select throws_ok(
  $q$select public.set_member_role('aaaa0000-0000-0000-0000-0000000d0001','funcionario')$q$,
  '42501', null::text,
  'gerente NÃO rebaixa o dono');

select lives_ok(
  $q$select public.set_member_status('aaaa0000-0000-0000-0000-0000000e0001','inativo')$q$,
  'gerente pode desativar um funcionário');

reset role;
select is((select status::text from public.memberships
           where id = 'aaaa0000-0000-0000-0000-0000000e0001'), 'inativo',
  'e a desativação valeu');

-- Desativado perde alcance: auth_company_ids() só devolve vínculo ativo.
select set_config('request.jwt.claims',
  '{"sub":"aaaa1111-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*) from public.companies)::int, 0,
  'membro desativado não enxerga mais a empresa');

-- ============================================================
-- 7) REMOÇÃO
-- ============================================================
reset role;
select set_config('request.jwt.claims',
  '{"sub":"aaaa1111-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select throws_ok(
  $q$select public.remove_member('aaaa0000-0000-0000-0000-0000000d0001')$q$,
  '42501', null::text,
  'ninguém remove a si mesmo');

select lives_ok(
  $q$select public.remove_member('aaaa0000-0000-0000-0000-0000000e0002')$q$,
  'dono remove funcionário sem histórico');

reset role;
select is((select count(*) from public.memberships
           where id = 'aaaa0000-0000-0000-0000-0000000e0002')::int, 0,
  'o vínculo sumiu');

select is((select count(*) from public.audit_log
           where action = 'member.remove'
             and company_id = 'aaaa0000-0000-0000-0000-00000000c001')::int, 1,
  'a remoção ficou registrada, com o nome de quem saiu');

select is(public.member_has_history('aaaa0000-0000-0000-0000-0000000d0001'), false,
  'sem tabelas de histórico ainda, member_has_history responde false');

-- ============================================================
-- 8) CONFIGURAÇÃO DA EMPRESA
-- ============================================================
select set_config('request.jwt.claims',
  '{"sub":"aaaa1111-0000-0000-0000-000000000003","role":"authenticated"}', true);
set local role authenticated;

select throws_ok(
  $q$select public.update_company('aaaa0000-0000-0000-0000-00000000c001',
                                  'Renomeada pelo gerente','America/Recife')$q$,
  '42501', null::text,
  'gerente NÃO altera a configuração da empresa');

reset role;
select set_config('request.jwt.claims',
  '{"sub":"aaaa1111-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $q$select public.update_company('aaaa0000-0000-0000-0000-00000000c001',
                                  'Padaria A Matriz','America/Sao_Paulo','12345678000199')$q$,
  'dono altera nome, fuso e CNPJ');

select throws_ok(
  $q$select public.update_company('aaaa0000-0000-0000-0000-00000000c001',
                                  'Fuso Errado','Marte/Olympus')$q$,
  '23514', null::text,
  'fuso inexistente é recusado');

reset role;
select is((select timezone from public.companies
           where id = 'aaaa0000-0000-0000-0000-00000000c001'), 'America/Sao_Paulo',
  'o fuso mudou de verdade');

-- ============================================================
-- 9) EMPRESA NOVA JÁ NASCE COM TURNOS
-- ============================================================
select set_config('request.jwt.claims',
  '{"sub":"bbbb1111-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $q$select public.create_company_with_owner('Bar do B','Beto','America/Recife')$q$,
  'criar empresa continua funcionando');

select is((select count(*) from public.shift_templates s
           join public.my_workspaces() w on w.company_id = s.company_id
           where w.company_name = 'Bar do B')::int, 3,
  'empresa nova nasce com os 3 turnos padrão');

select * from finish();
rollback;
