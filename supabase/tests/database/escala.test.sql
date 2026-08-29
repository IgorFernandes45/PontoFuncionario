-- ============================================================
-- GATE DA SPRINT 3 — escala fixa, avulsa e precedência
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
  ('00000000-0000-0000-0000-000000000000','aaaa1111-0000-0000-0000-000000000002','authenticated','authenticated','carla@teste.local','x',now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','aaaa1111-0000-0000-0000-000000000003','authenticated','authenticated','bruno@teste.local','x',now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','bbbb1111-0000-0000-0000-000000000001','authenticated','authenticated','dono.b@teste.local','x',now(),now(),now());

insert into public.companies (id, name) values
  ('aaaa0000-0000-0000-0000-00000000c001','Padaria A'),
  ('bbbb0000-0000-0000-0000-00000000c001','Mercado B');

insert into public.memberships (id, company_id, user_id, full_name, role) values
  ('aaaa0000-0000-0000-0000-0000000d0001','aaaa0000-0000-0000-0000-00000000c001','aaaa1111-0000-0000-0000-000000000001','Dono A','dono'),
  ('aaaa0000-0000-0000-0000-0000000e0001','aaaa0000-0000-0000-0000-00000000c001','aaaa1111-0000-0000-0000-000000000002','Carla','funcionario'),
  ('aaaa0000-0000-0000-0000-0000000e0002','aaaa0000-0000-0000-0000-00000000c001','aaaa1111-0000-0000-0000-000000000003','Bruno','funcionario'),
  ('bbbb0000-0000-0000-0000-0000000d0001','bbbb0000-0000-0000-0000-00000000c001','bbbb1111-0000-0000-0000-000000000001','Dono B','dono');

insert into public.shift_templates (company_id, key, label, start_time, end_time, break_minutes) values
  ('aaaa0000-0000-0000-0000-00000000c001','manha','Manhã','06:00','14:00',60),
  ('aaaa0000-0000-0000-0000-00000000c001','tarde','Tarde','14:00','22:00',60),
  ('bbbb0000-0000-0000-0000-00000000c001','manha','Manhã B','07:00','15:00',60);

insert into public.locations (id, company_id, name, lat, lng) values
  ('aaaa0000-0000-0000-0000-0000000a0001','aaaa0000-0000-0000-0000-00000000c001','Centro',-8.05,-34.88),
  ('bbbb0000-0000-0000-0000-0000000a0001','bbbb0000-0000-0000-0000-00000000c001','Filial B',-8.10,-34.90);

-- 2026-03-02 é uma segunda-feira. A semana vai até domingo 2026-03-08.
-- dow: segunda = 1 ... domingo = 0.

-- ============================================================
-- 1) INTEGRIDADE
-- ============================================================
select set_config('request.jwt.claims',
  '{"sub":"aaaa1111-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select throws_ok(
  $q$insert into public.schedule_entries (company_id, membership_id, work_date, shift_key)
     values ('aaaa0000-0000-0000-0000-00000000c001','aaaa0000-0000-0000-0000-0000000e0001',
             '2026-03-02','turno_que_nao_existe')$q$,
  '23503', null::text,
  'entrada apontando turno inexistente é recusada pela FK');

select throws_ok(
  $q$insert into public.schedule_entries (company_id, membership_id, work_date, weekday, shift_key)
     values ('aaaa0000-0000-0000-0000-00000000c001','aaaa0000-0000-0000-0000-0000000e0001',
             '2026-03-02', 1, 'manha')$q$,
  '23514', null::text,
  'entrada com data E dia-da-semana é recusada');

select throws_ok(
  $q$insert into public.schedule_entries (company_id, membership_id, shift_key)
     values ('aaaa0000-0000-0000-0000-00000000c001','aaaa0000-0000-0000-0000-0000000e0001','manha')$q$,
  '23514', null::text,
  'entrada sem data e sem dia-da-semana é recusada');

-- Folga é exceção de um dia; na fixa, folga é ausência de linha.
select throws_ok(
  $q$insert into public.schedule_entries (company_id, membership_id, weekday, shift_key)
     values ('aaaa0000-0000-0000-0000-00000000c001','aaaa0000-0000-0000-0000-0000000e0001', 1, null)$q$,
  '23514', null::text,
  'folga na escala FIXA é recusada');

-- company_id é redundante de propósito; sem guarda, viraria inconsistência.
select throws_ok(
  $q$insert into public.schedule_entries (company_id, membership_id, work_date, shift_key)
     values ('aaaa0000-0000-0000-0000-00000000c001','bbbb0000-0000-0000-0000-0000000d0001',
             '2026-03-02','manha')$q$,
  '23503', null::text,
  'escalar membro de OUTRA empresa é recusado');

select throws_ok(
  $q$insert into public.schedule_entries (company_id, membership_id, work_date, shift_key, location_id)
     values ('aaaa0000-0000-0000-0000-00000000c001','aaaa0000-0000-0000-0000-0000000e0001',
             '2026-03-02','manha','bbbb0000-0000-0000-0000-0000000a0001')$q$,
  '23503', null::text,
  'unidade de OUTRA empresa é recusada');

-- ============================================================
-- 2) ESCALA FIXA
-- ============================================================
-- Carla na manhã de segunda a sexta (dow 1..5).
select public.set_weekday_shift('aaaa0000-0000-0000-0000-0000000e0001', 1::smallint, 'manha');
select public.set_weekday_shift('aaaa0000-0000-0000-0000-0000000e0001', 2::smallint, 'manha');
select public.set_weekday_shift('aaaa0000-0000-0000-0000-0000000e0001', 3::smallint, 'manha');
select public.set_weekday_shift('aaaa0000-0000-0000-0000-0000000e0001', 4::smallint, 'manha');
select public.set_weekday_shift('aaaa0000-0000-0000-0000-0000000e0001', 5::smallint, 'manha');

select is((select count(*) from public.resolved_schedule(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-02','2026-03-08')
           where membership_id = 'aaaa0000-0000-0000-0000-0000000e0001')::int, 5,
  'a fixa de seg a sex rende 5 dias na semana');

-- E na semana seguinte também: é o que "fixa" quer dizer.
select is((select count(*) from public.resolved_schedule(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-09','2026-03-15')
           where membership_id = 'aaaa0000-0000-0000-0000-0000000e0001')::int, 5,
  'a mesma fixa aparece na semana seguinte, sem nada ser recriado');

select is((select origem from public.resolved_schedule(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-04','2026-03-04')
           where membership_id = 'aaaa0000-0000-0000-0000-0000000e0001'), 'fixa',
  'e vem marcada como origem fixa');

-- Reaplicar o mesmo dia-da-semana troca o turno, não duplica.
select public.set_weekday_shift('aaaa0000-0000-0000-0000-0000000e0001', 3::smallint, 'tarde');

select is((select count(*) from public.schedule_entries
           where membership_id = 'aaaa0000-0000-0000-0000-0000000e0001'
             and weekday = 3)::int, 1,
  'redefinir o mesmo dia-da-semana atualiza em vez de duplicar');

select is((select shift_key from public.resolved_schedule(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-04','2026-03-04')
           where membership_id = 'aaaa0000-0000-0000-0000-0000000e0001'), 'tarde',
  'e o turno novo é o que aparece');

select public.set_weekday_shift('aaaa0000-0000-0000-0000-0000000e0001', 3::smallint, 'manha');

-- ============================================================
-- 3) PRECEDÊNCIA: AVULSA GANHA DA FIXA
-- ============================================================
-- Quarta 2026-03-04: Carla vai para a tarde, só nesse dia.
select public.set_day_shift('aaaa0000-0000-0000-0000-0000000e0001','2026-03-04','tarde');

select is((select shift_key from public.resolved_schedule(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-04','2026-03-04')
           where membership_id = 'aaaa0000-0000-0000-0000-0000000e0001'), 'tarde',
  'a avulsa sobrepõe a fixa no dia');

select is((select origem from public.resolved_schedule(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-04','2026-03-04')
           where membership_id = 'aaaa0000-0000-0000-0000-0000000e0001'), 'avulsa',
  'e vem marcada como avulsa');

-- A quinta continua seguindo a fixa: a exceção não vaza para os vizinhos.
select is((select shift_key from public.resolved_schedule(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-05','2026-03-05')
           where membership_id = 'aaaa0000-0000-0000-0000-0000000e0001'), 'manha',
  'a exceção de um dia não afeta o dia seguinte');

-- Remover a avulsa faz a fixa voltar. É o teste que prova que não apagamos
-- o padrão ao criar a exceção.
select public.set_day_shift('aaaa0000-0000-0000-0000-0000000e0001','2026-03-04',
                            null, null, true);

select is((select shift_key from public.resolved_schedule(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-04','2026-03-04')
           where membership_id = 'aaaa0000-0000-0000-0000-0000000e0001'), 'manha',
  'removida a avulsa, a fixa volta a valer');

-- ============================================================
-- 4) FOLGA MARCADA
-- ============================================================
-- Sexta 2026-03-06: folga, mesmo tendo fixa.
select public.set_day_shift('aaaa0000-0000-0000-0000-0000000e0001','2026-03-06', null);

select is((select origem from public.resolved_schedule(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-06','2026-03-06')
           where membership_id = 'aaaa0000-0000-0000-0000-0000000e0001'), 'folga',
  'folga marcada aparece como folga, não como turno');

select is((select shift_key from public.resolved_schedule(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-06','2026-03-06')
           where membership_id = 'aaaa0000-0000-0000-0000-0000000e0001'), null,
  'e sem turno nenhum');

-- Só quatro dias de trabalho na semana agora: seg, ter, qua, qui.
select is((select count(*) from public.resolved_schedule(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-02','2026-03-08')
           where membership_id = 'aaaa0000-0000-0000-0000-0000000e0001'
             and origem <> 'folga')::int, 4,
  'a folga tira o dia da conta de trabalho');

select public.set_day_shift('aaaa0000-0000-0000-0000-0000000e0001','2026-03-06',
                            null, null, true);

-- ============================================================
-- 5) UM TURNO POR PESSOA POR DIA
-- ============================================================
select throws_ok(
  $q$insert into public.schedule_entries (company_id, membership_id, work_date, shift_key)
     values ('aaaa0000-0000-0000-0000-00000000c001','aaaa0000-0000-0000-0000-0000000e0001',
             '2026-03-02','manha')$q$,
  '23505', null::text,
  'segunda entrada avulsa no mesmo dia para a mesma pessoa é recusada')
  from (select public.set_day_shift('aaaa0000-0000-0000-0000-0000000e0001','2026-03-02','manha')) _;

-- ============================================================
-- 6) COPIAR A SEMANA
-- ============================================================
select public.set_day_shift('aaaa0000-0000-0000-0000-0000000e0002','2026-03-03','tarde');

select isnt((select public.copy_week('aaaa0000-0000-0000-0000-00000000c001',
                                     '2026-03-02','2026-03-09')), 0,
  'copiar a semana grava linhas');

select is((select shift_key from public.resolved_schedule(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-10','2026-03-10')
           where membership_id = 'aaaa0000-0000-0000-0000-0000000e0002'), 'tarde',
  'o turno do Bruno na terça foi para a terça seguinte');

select is((select origem from public.resolved_schedule(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-10','2026-03-10')
           where membership_id = 'aaaa0000-0000-0000-0000-0000000e0002'), 'avulsa',
  'e virou avulsa na semana de destino, não regra fixa');

-- Quinta 2026-03-12 vem da fixa da Carla. Copiar NÃO deve tê-la congelado
-- como avulsa: a fixa já se repete, e congelar faria a semana parar de
-- acompanhar mudanças no padrão.
select is((select origem from public.resolved_schedule(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-12','2026-03-12')
           where membership_id = 'aaaa0000-0000-0000-0000-0000000e0001'), 'fixa',
  'o que vinha da fixa continua fixa depois de copiar a semana');

-- ============================================================
-- 7) QUEM VÊ O QUÊ
-- ============================================================
reset role;
select set_config('request.jwt.claims',
  '{"sub":"aaaa1111-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;

-- A tabela é legível por todos da empresa: saber quem trabalha com você é
-- parte de trabalhar em turno.
select isnt_empty(
  $q$select 1 from public.schedule_entries$q$,
  'funcionário LÊ a tabela de escala da empresa');

-- Mas resolved_schedule() devolve só a linha dele: é o que "minha escala" usa.
select is((select count(distinct membership_id) from public.resolved_schedule(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-02','2026-03-08'))::int, 1,
  'resolved_schedule() devolve só a própria escala para o funcionário');

select throws_ok(
  $q$select public.set_day_shift('aaaa0000-0000-0000-0000-0000000e0001','2026-03-07','manha')$q$,
  '42501', null::text,
  'funcionário NÃO altera a escala');

select throws_ok(
  $q$insert into public.schedule_entries (company_id, membership_id, work_date, shift_key)
     values ('aaaa0000-0000-0000-0000-00000000c001','aaaa0000-0000-0000-0000-0000000e0001',
             '2026-03-07','manha')$q$,
  '42501', null::text,
  'nem por insert direto');

-- ============================================================
-- 8) EMPRESA VIZINHA
-- ============================================================
reset role;
select set_config('request.jwt.claims',
  '{"sub":"bbbb1111-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*) from public.schedule_entries)::int, 0,
  'dono da B não enxerga entrada nenhuma da A');

select is((select count(*) from public.resolved_schedule(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-02','2026-03-08'))::int, 0,
  'nem pela função resolvida, passando o id da empresa alheia');

-- ============================================================
-- 9) REMOÇÃO DE MEMBRO COM ESCALA
-- ============================================================
reset role;
select set_config('request.jwt.claims',
  '{"sub":"aaaa1111-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

-- member_has_history() enxerga schedule_entries agora que a tabela existe.
select is(public.member_has_history('aaaa0000-0000-0000-0000-0000000e0001'), true,
  'quem tem escala já conta como tendo histórico');

select throws_ok(
  $q$select public.remove_member('aaaa0000-0000-0000-0000-0000000e0001')$q$,
  '23001', null::text,
  'e por isso não pode ser removido, só desativado');

select * from finish();
rollback;
