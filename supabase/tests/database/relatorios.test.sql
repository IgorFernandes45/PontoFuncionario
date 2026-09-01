-- ============================================================
-- GATE DA SPRINT 7 — os números batem nos casos de borda?
--
-- Relatório errado com cara de certo é pior que não ter relatório. Estes
-- testes montam os casos que a conta ingênua erra: turno que vira o dia,
-- intervalo, atraso dentro da tolerância, atestado e falta.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions, pg_catalog;
select * from no_plan();

-- ------------------------------------------------------------
-- SETUP  (fuso America/Recife = UTC-3, sem horário de verão)
-- ------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000','aaaa1111-0000-0000-0000-000000000001','authenticated','authenticated','dono.a@teste.local','x',now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','aaaa1111-0000-0000-0000-000000000002','authenticated','authenticated','carla@teste.local','x',now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','aaaa1111-0000-0000-0000-000000000003','authenticated','authenticated','bruno@teste.local','x',now(),now(),now());

insert into public.companies (id, name, timezone, late_tolerance_minutes) values
  ('aaaa0000-0000-0000-0000-00000000c001','Padaria A','America/Recife', 10);

insert into public.memberships (id, company_id, user_id, full_name, role) values
  ('aaaa0000-0000-0000-0000-0000000d0001','aaaa0000-0000-0000-0000-00000000c001','aaaa1111-0000-0000-0000-000000000001','Dono A','dono'),
  ('aaaa0000-0000-0000-0000-0000000e0001','aaaa0000-0000-0000-0000-00000000c001','aaaa1111-0000-0000-0000-000000000002','Carla','funcionario'),
  ('aaaa0000-0000-0000-0000-0000000e0002','aaaa0000-0000-0000-0000-00000000c001','aaaa1111-0000-0000-0000-000000000003','Bruno','funcionario');

insert into public.locations (id, company_id, name, lat, lng, radius_m) values
  ('aaaa0000-0000-0000-0000-0000000a0001','aaaa0000-0000-0000-0000-00000000c001','Centro',-8.06,-34.87,100);

-- Manhã 08:00–17:00 com 1h de intervalo -> 8h líquidas previstas.
-- Noite 22:00–06:00 com 1h -> 7h líquidas, virando o dia.
insert into public.shift_templates (company_id, key, label, start_time, end_time, break_minutes) values
  ('aaaa0000-0000-0000-0000-00000000c001','dia','Dia','08:00','17:00',60),
  ('aaaa0000-0000-0000-0000-00000000c001','noite','Noite','22:00','06:00',60);

-- Carla no turno do dia, seg a sex. Bruno na noite, seg a sex.
insert into public.schedule_entries (company_id, membership_id, weekday, shift_key, location_id)
select 'aaaa0000-0000-0000-0000-00000000c001','aaaa0000-0000-0000-0000-0000000e0001',
       d,'dia','aaaa0000-0000-0000-0000-0000000a0001' from generate_series(1,5) d;
insert into public.schedule_entries (company_id, membership_id, weekday, shift_key, location_id)
select 'aaaa0000-0000-0000-0000-00000000c001','aaaa0000-0000-0000-0000-0000000e0002',
       d,'noite','aaaa0000-0000-0000-0000-0000000a0001' from generate_series(1,5) d;

-- ============================================================
-- 1) DIA NORMAL COM INTERVALO
-- ============================================================
-- Segunda 2026-03-02. Carla: 08:00 às 17:00, intervalo 12:00–13:00.
-- Em UTC: 11:00, 15:00, 16:00, 20:00.
insert into public.punches (company_id, membership_id, location_id, type, punched_at, work_date, verified)
values
  ('aaaa0000-0000-0000-0000-00000000c001','aaaa0000-0000-0000-0000-0000000e0001','aaaa0000-0000-0000-0000-0000000a0001','entrada',         '2026-03-02 11:00:00+00','2026-03-02',true),
  ('aaaa0000-0000-0000-0000-00000000c001','aaaa0000-0000-0000-0000-0000000e0001','aaaa0000-0000-0000-0000-0000000a0001','intervalo_inicio','2026-03-02 15:00:00+00','2026-03-02',true),
  ('aaaa0000-0000-0000-0000-00000000c001','aaaa0000-0000-0000-0000-0000000e0001','aaaa0000-0000-0000-0000-0000000a0001','intervalo_fim',   '2026-03-02 16:00:00+00','2026-03-02',true),
  ('aaaa0000-0000-0000-0000-00000000c001','aaaa0000-0000-0000-0000-0000000e0001','aaaa0000-0000-0000-0000-0000000a0001','saida',           '2026-03-02 20:00:00+00','2026-03-02',true);

select is((select trabalhado_min from public.worked_minutes(
             'aaaa0000-0000-0000-0000-0000000e0001','2026-03-02')), 480,
  '9h de presença com 1h de intervalo dão 8h líquidas');

select is((select intervalo_min from public.worked_minutes(
             'aaaa0000-0000-0000-0000-0000000e0001','2026-03-02')), 60,
  'e o intervalo batido é 60 minutos');

select set_config('request.jwt.claims',
  '{"sub":"aaaa1111-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select is((select situacao::text from public.daily_report(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-02','2026-03-02')
           where membership_id = 'aaaa0000-0000-0000-0000-0000000e0001'), 'trabalhado',
  'o dia consta como trabalhado');

select is((select previsto_min from public.daily_report(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-02','2026-03-02')
           where membership_id = 'aaaa0000-0000-0000-0000-0000000e0001'), 480,
  'com 8h previstas — a jornada menos o intervalo');

select is((select atraso_min from public.daily_report(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-02','2026-03-02')
           where membership_id = 'aaaa0000-0000-0000-0000-0000000e0001'), 0,
  'e sem atraso: entrou na hora');

-- ============================================================
-- 2) TURNO QUE VIRA O DIA
-- ============================================================
-- Bruno na segunda: entra 22:00 (01:00 UTC de terça) e sai 06:00 de terça
-- (09:00 UTC). As duas batidas pertencem à SEGUNDA.
reset role;
insert into public.punches (company_id, membership_id, location_id, type, punched_at, work_date, verified)
values ('aaaa0000-0000-0000-0000-00000000c001','aaaa0000-0000-0000-0000-0000000e0002','aaaa0000-0000-0000-0000-0000000a0001','entrada','2026-03-03 01:00:00+00','2026-03-02',true);

-- A pergunta tem de ser feita AGORA, com o turno ainda aberto: e esse o
-- estado em que a saida de madrugada chega.
select is(public.punch_work_date('aaaa0000-0000-0000-0000-0000000e0002',
            '2026-03-03 09:00:00+00','America/Recife'), '2026-03-02'::date,
  'a saida de madrugada pertence ao dia de trabalho anterior');

select is(public.punch_work_date('aaaa0000-0000-0000-0000-0000000e0001',
            '2026-03-10 11:00:00+00','America/Recife'), '2026-03-10'::date,
  'sem turno em aberto, vale o dia do relogio');

insert into public.punches (company_id, membership_id, location_id, type, punched_at, work_date, verified)
values ('aaaa0000-0000-0000-0000-00000000c001','aaaa0000-0000-0000-0000-0000000e0002','aaaa0000-0000-0000-0000-0000000a0001','saida','2026-03-03 09:00:00+00','2026-03-02',true);

select is((select trabalhado_min from public.worked_minutes(
             'aaaa0000-0000-0000-0000-0000000e0002','2026-03-02')), 480,
  'turno noturno de 22:00 a 06:00 conta 8 horas, não valor negativo');

select set_config('request.jwt.claims',
  '{"sub":"aaaa1111-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select is((select trabalhado_min from public.daily_report(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-02','2026-03-02')
           where membership_id = 'aaaa0000-0000-0000-0000-0000000e0002'), 420,
  'as horas caem na SEGUNDA, o dia em que o turno começou');

-- 420 e nao 480 porque o turno da noite tambem preve 1h de intervalo, que o
-- Bruno nao bateu. worked_minutes acima devolve 480 (o realizado bruto);
-- quem aplica a presuncao e o relatorio.

select is((select trabalhado_min from public.daily_report(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-03','2026-03-03')
           where membership_id = 'aaaa0000-0000-0000-0000-0000000e0002'), 0,
  'sem sobrar nada na terça');

-- ============================================================
-- 3) TOLERÂNCIA DE ATRASO
-- ============================================================
-- Quarta: Carla entra 08:07, dentro da tolerância de 10 minutos.
reset role;
insert into public.punches (company_id, membership_id, location_id, type, punched_at, work_date, verified)
values
  ('aaaa0000-0000-0000-0000-00000000c001','aaaa0000-0000-0000-0000-0000000e0001','aaaa0000-0000-0000-0000-0000000a0001','entrada','2026-03-04 11:07:00+00','2026-03-04',true),
  ('aaaa0000-0000-0000-0000-00000000c001','aaaa0000-0000-0000-0000-0000000e0001','aaaa0000-0000-0000-0000-0000000a0001','saida',  '2026-03-04 20:00:00+00','2026-03-04',true);

select set_config('request.jwt.claims',
  '{"sub":"aaaa1111-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select is((select atraso_min from public.daily_report(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-04','2026-03-04')
           where membership_id = 'aaaa0000-0000-0000-0000-0000000e0001'), 0,
  '7 minutos com tolerancia de 10 nao e atraso');

-- Presenca de 8h53 sem bater intervalo: o previsto e descontado mesmo assim.
select is((select trabalhado_min from public.daily_report(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-04','2026-03-04')
           where membership_id = 'aaaa0000-0000-0000-0000-0000000e0001'), 473,
  'intervalo previsto e nao batido e descontado do mesmo jeito');

select is((select intervalo_presumido from public.daily_report(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-04','2026-03-04')
           where membership_id = 'aaaa0000-0000-0000-0000-0000000e0001'), true,
  'e o dia fica marcado como desconto presumido, para o numero ser explicavel');

select is((select intervalo_presumido from public.daily_report(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-02','2026-03-02')
           where membership_id = 'aaaa0000-0000-0000-0000-0000000e0001'), false,
  'quando o intervalo foi batido, nao ha presuncao nenhuma');

-- Quinta: entra 08:25, quinze minutos além da tolerância.
reset role;
insert into public.punches (company_id, membership_id, location_id, type, punched_at, work_date, verified)
values
  ('aaaa0000-0000-0000-0000-00000000c001','aaaa0000-0000-0000-0000-0000000e0001','aaaa0000-0000-0000-0000-0000000a0001','entrada','2026-03-05 11:25:00+00','2026-03-05',true),
  ('aaaa0000-0000-0000-0000-00000000c001','aaaa0000-0000-0000-0000-0000000e0001','aaaa0000-0000-0000-0000-0000000a0001','saida',  '2026-03-05 20:00:00+00','2026-03-05',true);

select set_config('request.jwt.claims',
  '{"sub":"aaaa1111-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select is((select atraso_min from public.daily_report(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-05','2026-03-05')
           where membership_id = 'aaaa0000-0000-0000-0000-0000000e0001'), 15,
  '25 minutos viram 15 de atraso: só o que passa da tolerância conta');

-- ============================================================
-- 4) FALTA, ATESTADO E FOLGA SÃO COISAS DIFERENTES
-- ============================================================
-- Sexta 2026-03-06: Carla tinha turno e não bateu nada.
select is((select situacao::text from public.daily_report(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-06','2026-03-06')
           where membership_id = 'aaaa0000-0000-0000-0000-0000000e0001'), 'falta',
  'turno previsto sem batida nenhuma é falta');

-- O mesmo dia com atestado deixa de ser falta.
reset role;
insert into public.absences (company_id, membership_id, kind, starts_on, ends_on)
values ('aaaa0000-0000-0000-0000-00000000c001','aaaa0000-0000-0000-0000-0000000e0001',
        'atestado','2026-03-06','2026-03-06');

select set_config('request.jwt.claims',
  '{"sub":"aaaa1111-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select is((select situacao::text from public.daily_report(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-06','2026-03-06')
           where membership_id = 'aaaa0000-0000-0000-0000-0000000e0001'), 'ausencia',
  'com atestado, o mesmo dia vira ausência justificada');

select is((select ausencia_tipo::text from public.daily_report(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-06','2026-03-06')
           where membership_id = 'aaaa0000-0000-0000-0000-0000000e0001'), 'atestado',
  'com o tipo da ausência à mão');

-- Sábado: ninguém tem escala fixa. Não é falta.
select is((select situacao::text from public.daily_report(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-07','2026-03-07')
           where membership_id = 'aaaa0000-0000-0000-0000-0000000e0001'), 'sem_escala',
  'dia sem escala não é falta');

-- ============================================================
-- 5) TURNO EM ABERTO
-- ============================================================
-- 2026-03-09: Carla entra e esquece de sair.
reset role;
insert into public.punches (company_id, membership_id, location_id, type, punched_at, work_date, verified)
values ('aaaa0000-0000-0000-0000-00000000c001','aaaa0000-0000-0000-0000-0000000e0001','aaaa0000-0000-0000-0000-0000000a0001','entrada','2026-03-09 11:00:00+00','2026-03-09',true);

select set_config('request.jwt.claims',
  '{"sub":"aaaa1111-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select is((select situacao::text from public.daily_report(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-09','2026-03-09')
           where membership_id = 'aaaa0000-0000-0000-0000-0000000e0001'), 'em_aberto',
  'entrada sem saída é sinalizada como em aberto, não como 0 horas');

select is((select trabalhado_min from public.daily_report(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-09','2026-03-09')
           where membership_id = 'aaaa0000-0000-0000-0000-0000000e0001'), 0,
  'e não inventa hora trabalhada a partir de uma batida só');

-- ============================================================
-- 6) RESUMO DO PERÍODO
-- ============================================================
-- Semana de 02 a 08 para a Carla: seg trabalhada (480), qua 480, qui 480,
-- sex ausência. Previsto de seg a sex = 5 x 480.
select is((select trabalhado_min from public.period_report(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-02','2026-03-08')
           where membership_id = 'aaaa0000-0000-0000-0000-0000000e0001'), 1408,
  'a soma do periodo usa o mesmo desconto de intervalo do dia a dia');

select is((select faltas from public.period_report(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-02','2026-03-08')
           where membership_id = 'aaaa0000-0000-0000-0000-0000000e0001'), 1,
  'a terça sem batida conta como falta');

select is((select ausencias from public.period_report(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-02','2026-03-08')
           where membership_id = 'aaaa0000-0000-0000-0000-0000000e0001'), 1,
  'e a sexta com atestado conta como ausência, não como falta');

select is((select atrasos from public.period_report(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-02','2026-03-08')
           where membership_id = 'aaaa0000-0000-0000-0000-0000000e0001'), 1,
  'só um dia teve atraso além da tolerância');

select is((select atraso_total_min from public.period_report(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-02','2026-03-08')
           where membership_id = 'aaaa0000-0000-0000-0000-0000000e0001'), 15,
  'somando 15 minutos');

-- Atestado não vira dívida de horas: o saldo desconta só os dias devidos.
-- Previsto seg-sex = 2400. Trabalhado = 1440. Sexta (ausência) sai da conta,
-- então o saldo é 1440 - (2400 - 480) = -480.
select is((select saldo_min from public.period_report(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-02','2026-03-08')
           where membership_id = 'aaaa0000-0000-0000-0000-0000000e0001'), -512,
  'o dia de atestado nao entra no saldo como hora devida');

-- ============================================================
-- 7) O FUNCIONÁRIO SÓ VÊ O PRÓPRIO RELATÓRIO
-- ============================================================
reset role;
select set_config('request.jwt.claims',
  '{"sub":"aaaa1111-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*) from public.period_report(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-02','2026-03-08'))::int, 1,
  'o resumo do funcionário traz só a linha dele');

select is((select full_name from public.period_report(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-02','2026-03-08')), 'Carla',
  'e é a linha certa');

select is((select count(distinct membership_id) from public.daily_report(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-02','2026-03-08'))::int, 1,
  'o dia a dia também');

-- ============================================================
-- 8) AJUSTE MANUAL FICA VISÍVEL NO RELATÓRIO
-- ============================================================
reset role;
select set_config('request.jwt.claims',
  '{"sub":"aaaa1111-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select is((select tem_ajuste from public.daily_report(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-02','2026-03-02')
           where membership_id = 'aaaa0000-0000-0000-0000-0000000e0001'), false,
  'dia só com batidas do app não tem marca de ajuste');

select lives_ok(
  $q$select public.add_missing_punch('aaaa0000-0000-0000-0000-0000000e0001',
       'saida','2026-03-09 20:00:00+00','Esqueceu de bater a saída')$q$,
  'gestor inclui a saída que faltou');

select is((select tem_ajuste from public.daily_report(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-09','2026-03-09')
           where membership_id = 'aaaa0000-0000-0000-0000-0000000e0001'), true,
  'e o dia passa a exibir que houve ajuste manual');

select is((select situacao::text from public.daily_report(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-09','2026-03-09')
           where membership_id = 'aaaa0000-0000-0000-0000-0000000e0001'), 'trabalhado',
  'deixando de estar em aberto');

select is((select trabalhado_min from public.daily_report(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-09','2026-03-09')
           where membership_id = 'aaaa0000-0000-0000-0000-0000000e0001'), 480,
  'com 9h de presenca menos a hora de intervalo presumida');

select * from finish();
rollback;
