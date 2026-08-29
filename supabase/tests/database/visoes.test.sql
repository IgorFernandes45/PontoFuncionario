-- ============================================================
-- GATE DA SPRINT 4 — resumo, cobertura e auditoria da escala
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
  ('00000000-0000-0000-0000-000000000000','aaaa1111-0000-0000-0000-000000000003','authenticated','authenticated','bruno@teste.local','x',now(),now(),now());

insert into public.companies (id, name) values
  ('aaaa0000-0000-0000-0000-00000000c001','Padaria A');

insert into public.memberships (id, company_id, user_id, full_name, role) values
  ('aaaa0000-0000-0000-0000-0000000d0001','aaaa0000-0000-0000-0000-00000000c001','aaaa1111-0000-0000-0000-000000000001','Dono A','dono'),
  ('aaaa0000-0000-0000-0000-0000000e0001','aaaa0000-0000-0000-0000-00000000c001','aaaa1111-0000-0000-0000-000000000002','Carla','funcionario'),
  ('aaaa0000-0000-0000-0000-0000000e0002','aaaa0000-0000-0000-0000-00000000c001','aaaa1111-0000-0000-0000-000000000003','Bruno','funcionario');

-- Manhã: 8h de jornada, 1h de intervalo -> 7h líquidas (420 min).
-- Noite: 22:00–06:00, mesma coisa, mas virando o dia.
-- Sem pausa: 4h cheias (240 min), para provar que o desconto não é fixo.
insert into public.shift_templates (company_id, key, label, start_time, end_time, break_minutes) values
  ('aaaa0000-0000-0000-0000-00000000c001','manha','Manhã','06:00','14:00',60),
  ('aaaa0000-0000-0000-0000-00000000c001','noite','Noite','22:00','06:00',60),
  ('aaaa0000-0000-0000-0000-00000000c001','curto','Curto','08:00','12:00',0);

-- ============================================================
-- 1) HORAS PREVISTAS SÃO LÍQUIDAS
-- ============================================================
select set_config('request.jwt.claims',
  '{"sub":"aaaa1111-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

-- Segunda 2026-03-02 e terça 03-03 de manhã.
select public.set_day_shift('aaaa0000-0000-0000-0000-0000000e0001','2026-03-02','manha');
select public.set_day_shift('aaaa0000-0000-0000-0000-0000000e0001','2026-03-03','manha');

select is((select minutos_previstos from public.schedule_summary(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-02','2026-03-08')
           where membership_id = 'aaaa0000-0000-0000-0000-0000000e0001'), 840,
  'dois turnos de 8h com 1h de intervalo dão 14h líquidas, não 16h');

select is((select dias_com_turno from public.schedule_summary(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-02','2026-03-08')
           where membership_id = 'aaaa0000-0000-0000-0000-0000000e0001'), 2,
  'e contam como 2 dias com turno');

-- Turno sem intervalo não perde minuto nenhum.
select public.set_day_shift('aaaa0000-0000-0000-0000-0000000e0001','2026-03-04','curto');

select is((select minutos_previstos from public.schedule_summary(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-04','2026-03-04')
           where membership_id = 'aaaa0000-0000-0000-0000-0000000e0001'), 240,
  'turno sem intervalo conta a jornada inteira');

-- O caso que a aritmética ingênua erra.
select public.set_day_shift('aaaa0000-0000-0000-0000-0000000e0002','2026-03-02','noite');

select is((select minutos_previstos from public.schedule_summary(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-02','2026-03-02')
           where membership_id = 'aaaa0000-0000-0000-0000-0000000e0002'), 420,
  'turno noturno 22:00–06:00 dá 7h líquidas, não valor negativo');

-- ============================================================
-- 2) FOLGA NÃO SOMA HORA
-- ============================================================
select public.set_day_shift('aaaa0000-0000-0000-0000-0000000e0001','2026-03-05');

select is((select dias_de_folga from public.schedule_summary(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-02','2026-03-08')
           where membership_id = 'aaaa0000-0000-0000-0000-0000000e0001'), 1,
  'a folga aparece como dia de folga');

select is((select minutos_previstos from public.schedule_summary(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-05','2026-03-05')
           where membership_id = 'aaaa0000-0000-0000-0000-0000000e0001'), 0,
  'e não acrescenta minuto nenhum');

-- ============================================================
-- 3) COBERTURA POR DIA
-- ============================================================
-- Segunda: Carla de manhã, Bruno à noite. Dois turnos, uma pessoa em cada.
select is((select count(*) from public.schedule_coverage(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-02','2026-03-02'))::int, 2,
  'a cobertura da segunda tem duas linhas, uma por turno');

select is((select pessoas from public.schedule_coverage(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-02','2026-03-02')
           where shift_key = 'manha'), 1,
  'com uma pessoa na manhã');

-- Duas pessoas no mesmo turno agregam numa linha só.
select public.set_day_shift('aaaa0000-0000-0000-0000-0000000e0002','2026-03-03','manha');

select is((select pessoas from public.schedule_coverage(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-03','2026-03-03')
           where shift_key = 'manha'), 2,
  'duas pessoas no mesmo turno viram uma linha com contagem 2');

select is((select count(*) from public.schedule_coverage(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-05','2026-03-05'))::int, 0,
  'dia só de folga não aparece na cobertura');

-- ============================================================
-- 4) AUDITORIA
-- ============================================================
select is((select count(*) from public.audit_log
           where action = 'schedule.set_day'
             and company_id = 'aaaa0000-0000-0000-0000-00000000c001')::int, 6,
  'cada alteração de dia deixou rastro na auditoria');

select public.set_day_shift('aaaa0000-0000-0000-0000-0000000e0001','2026-03-02','curto');

select is((select meta->>'de' from public.audit_log
           where action = 'schedule.set_day'
           order by created_at desc limit 1), 'manha',
  'a auditoria guarda o turno anterior');

select is((select meta->>'para' from public.audit_log
           where action = 'schedule.set_day'
           order by created_at desc limit 1), 'curto',
  'e o turno novo');

select public.set_day_shift('aaaa0000-0000-0000-0000-0000000e0001','2026-03-02',
                            null, null, true);

select is((select meta->>'para' from public.audit_log
           where action = 'schedule.set_day'
           order by created_at desc limit 1), 'segue a fixa',
  'limpar a exceção fica registrado como voltar à fixa');

select public.set_weekday_shift('aaaa0000-0000-0000-0000-0000000e0001', 1::smallint, 'manha');

select is((select count(*) from public.audit_log
           where action = 'schedule.set_weekday'
             and company_id = 'aaaa0000-0000-0000-0000-00000000c001')::int, 1,
  'mudança no padrão semanal também é auditada');

-- ============================================================
-- 5) O QUE O FUNCIONÁRIO VÊ
-- ============================================================
reset role;
select set_config('request.jwt.claims',
  '{"sub":"aaaa1111-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*) from public.schedule_summary(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-02','2026-03-08'))::int, 1,
  'o resumo do funcionário traz só a linha dele');

select is((select full_name from public.schedule_summary(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-02','2026-03-08')), 'Carla',
  'e é a linha certa');

-- Cobertura é informação de gestão: para o funcionário sai vazia, porque
-- resolved_schedule já filtra a origem dos dados.
select is((select coalesce(sum(pessoas),0) from public.schedule_coverage(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-02','2026-03-03'))::int,
  (select count(*) from public.resolved_schedule(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-02','2026-03-03')
   where origem <> 'folga')::int,
  'a cobertura vista pelo funcionário nunca soma mais do que ele enxerga');

select isnt((select public.my_schedule_updated_at()), null,
  'o funcionário consegue saber quando a escala dele mudou');

reset role;
select set_config('request.jwt.claims',
  '{"sub":"aaaa1111-0000-0000-0000-000000000003","role":"authenticated"}', true);
set local role authenticated;

select is((select full_name from public.schedule_summary(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-02','2026-03-08')), 'Bruno',
  'outro funcionário recebe o resumo dele, não o do colega');

select * from finish();
rollback;
