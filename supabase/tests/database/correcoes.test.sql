-- ============================================================
-- GATE DA SPRINT 6 — correção auditável e ausência justificada
--
-- Duas perguntas: a correção altera o registro original? (não pode) E uma
-- falta continua se confundindo com atestado? (não pode)
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

insert into public.companies (id, name, timezone) values
  ('aaaa0000-0000-0000-0000-00000000c001','Padaria A','America/Recife');

insert into public.memberships (id, company_id, user_id, full_name, role) values
  ('aaaa0000-0000-0000-0000-0000000d0001','aaaa0000-0000-0000-0000-00000000c001','aaaa1111-0000-0000-0000-000000000001','Dono A','dono'),
  ('aaaa0000-0000-0000-0000-0000000e0001','aaaa0000-0000-0000-0000-00000000c001','aaaa1111-0000-0000-0000-000000000002','Carla','funcionario'),
  ('aaaa0000-0000-0000-0000-0000000e0002','aaaa0000-0000-0000-0000-00000000c001','aaaa1111-0000-0000-0000-000000000003','Bruno','funcionario');

insert into public.locations (id, company_id, name, lat, lng, radius_m) values
  ('aaaa0000-0000-0000-0000-0000000a0001','aaaa0000-0000-0000-0000-00000000c001',
   'Loja Centro', -8.063200, -34.871300, 100);

-- Carla bateu entrada às 08:00 e saída às 17:00 (horário de Recife).
insert into public.punches (id, company_id, membership_id, location_id, type,
                            punched_at, work_date, verified, distance_m)
values
  ('aaaa0000-0000-0000-0000-0000000b0001','aaaa0000-0000-0000-0000-00000000c001',
   'aaaa0000-0000-0000-0000-0000000e0001','aaaa0000-0000-0000-0000-0000000a0001',
   'entrada','2026-03-02 11:00:00+00','2026-03-02', true, 30),
  ('aaaa0000-0000-0000-0000-0000000b0002','aaaa0000-0000-0000-0000-00000000c001',
   'aaaa0000-0000-0000-0000-0000000e0001','aaaa0000-0000-0000-0000-0000000a0001',
   'saida','2026-03-02 20:00:00+00','2026-03-02', true, 30);

-- ============================================================
-- 1) SEQUÊNCIA DO DIA INTEIRO
-- ============================================================
select is(public.day_sequence_is_valid(
            'aaaa0000-0000-0000-0000-0000000e0001','2026-03-02'), true,
  'entrada seguida de saída é uma sequência válida');

-- Saída sem entrada antes é impossível, não incompleto.
insert into public.punches (id, company_id, membership_id, type, punched_at, work_date)
values ('aaaa0000-0000-0000-0000-0000000b0009','aaaa0000-0000-0000-0000-00000000c001',
        'aaaa0000-0000-0000-0000-0000000e0002','saida','2026-03-05 20:00:00+00','2026-03-05');

select is(public.day_sequence_is_valid(
            'aaaa0000-0000-0000-0000-0000000e0002','2026-03-05'), false,
  'saída sem entrada antes é sequência inválida');

insert into public.punches (id, company_id, membership_id, type, punched_at, work_date)
values ('aaaa0000-0000-0000-0000-0000000b0010','aaaa0000-0000-0000-0000-00000000c001',
        'aaaa0000-0000-0000-0000-0000000e0002','entrada','2026-03-05 11:00:00+00','2026-03-05');

select is(public.day_sequence_is_valid(
            'aaaa0000-0000-0000-0000-0000000e0002','2026-03-05'), true,
  'com a entrada no lugar certo, a mesma saída passa a valer');

-- Dia que termina com o intervalo aberto é incompleto, não impossível: o
-- gestor precisa poder chegar nesse estado enquanto corrige.
insert into public.punches (id, company_id, membership_id, type, punched_at, work_date)
values ('aaaa0000-0000-0000-0000-0000000b0011','aaaa0000-0000-0000-0000-00000000c001',
        'aaaa0000-0000-0000-0000-0000000e0002','intervalo_inicio','2026-03-05 15:00:00+00','2026-03-05');

select is(public.day_sequence_is_valid(
            'aaaa0000-0000-0000-0000-0000000e0002','2026-03-05'), true,
  'intervalo aberto no fim do dia é incompleto, e passa');

-- Sem limpeza: `punches` é append-only e o trigger recusa DELETE mesmo aqui.
-- Estas batidas ficam em 2026-03-05, longe do dia usado nos testes seguintes.

-- ============================================================
-- 2) CORRIGIR HORÁRIO
-- ============================================================
select set_config('request.jwt.claims',
  '{"sub":"aaaa1111-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select throws_ok(
  $q$select public.adjust_punch('aaaa0000-0000-0000-0000-0000000b0001',
       '2026-03-02 10:00:00+00', 'ok')$q$,
  '23514', null::text,
  'justificativa curta demais é recusada');

select lives_ok(
  $q$select public.adjust_punch('aaaa0000-0000-0000-0000-0000000b0001',
       '2026-03-02 10:00:00+00', 'Bateu no relógio da parede, o celular estava sem bateria')$q$,
  'gestor corrige o horário da entrada');

reset role;

-- A prova de que corrigir não é alterar.
select is((select punched_at from public.punches
           where id = 'aaaa0000-0000-0000-0000-0000000b0001'),
  '2026-03-02 11:00:00+00'::timestamptz,
  'o registro ORIGINAL continua intacto no banco');

select is((select count(*) from public.punches
           where membership_id = 'aaaa0000-0000-0000-0000-0000000e0001')::int, 3,
  'a correção acrescentou um registro em vez de mudar um');

select is((select count(*) from public.effective_punches(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-02','2026-03-02'))::int, 2,
  'mas só duas batidas contam como efetivas');

select is((select punched_at from public.effective_punches(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-02','2026-03-02')
           where type = 'entrada'),
  '2026-03-02 10:00:00+00'::timestamptz,
  'e a efetiva é a corrigida');

select is((select origin::text from public.effective_punches(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-02','2026-03-02')
           where type = 'entrada'), 'ajuste_manual',
  'marcada como ajuste manual');

select is((select verified from public.punches
           where replaces_punch_id = 'aaaa0000-0000-0000-0000-0000000b0001'), false,
  'e NÃO verificada: ajuste manual não tem prova de local');

-- Corrigir a mesma batida duas vezes seria bifurcar a história.
select set_config('request.jwt.claims',
  '{"sub":"aaaa1111-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select throws_ok(
  $q$select public.adjust_punch('aaaa0000-0000-0000-0000-0000000b0001',
       '2026-03-02 09:00:00+00', 'tentando corrigir de novo a mesma')$q$,
  '23514', null::text,
  'não se corrige uma batida que já foi corrigida');

-- ============================================================
-- 3) HISTÓRICO CONTA A HISTÓRIA
-- ============================================================
select is((select count(*) from public.punch_history(
             'aaaa0000-0000-0000-0000-0000000b0001'))::int, 2,
  'o histórico mostra a batida original e a correção');

select is((select count(*) from public.punch_history(
             'aaaa0000-0000-0000-0000-0000000b0001') where efetivo)::int, 1,
  'com exatamente uma efetiva');

select is((select autor from public.punch_history(
             'aaaa0000-0000-0000-0000-0000000b0001') where not efetivo is false
           order by registrado_em desc limit 1), 'Dono A',
  'e diz quem fez a correção');

-- ============================================================
-- 4) INCLUIR BATIDA QUE FALTOU
-- ============================================================
-- Intervalo esquecido no meio de um dia que já tem entrada e saída: é o caso
-- que a validação "última batida" não pegaria.
select lives_ok(
  $q$select public.add_missing_punch('aaaa0000-0000-0000-0000-0000000e0001',
       'intervalo_inicio','2026-03-02 15:00:00+00','Esqueceu de bater o almoço')$q$,
  'gestor inclui início de intervalo no meio do dia');

select lives_ok(
  $q$select public.add_missing_punch('aaaa0000-0000-0000-0000-0000000e0001',
       'intervalo_fim','2026-03-02 16:00:00+00','Esqueceu de bater a volta')$q$,
  'e a volta do intervalo');

select is((select count(*) from public.effective_punches(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-02','2026-03-02'))::int, 4,
  'o dia passa a ter quatro batidas efetivas, na ordem certa');

-- Uma entrada extra no meio quebraria a sequência do dia.
select throws_ok(
  $q$select public.add_missing_punch('aaaa0000-0000-0000-0000-0000000e0001',
       'entrada','2026-03-02 15:30:00+00','entrada no meio do intervalo')$q$,
  '23514', null::text,
  'inclusão que deixaria o dia incoerente é recusada');

select is((select count(*) from public.effective_punches(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-02','2026-03-02'))::int, 4,
  'e nada é gravado quando a inclusão é recusada');

select throws_ok(
  $q$select public.add_missing_punch('aaaa0000-0000-0000-0000-0000000e0002',
       'entrada', now() + interval '2 hours','ponto no futuro')$q$,
  '23514', null::text,
  'não dá para incluir ponto no futuro');

-- ============================================================
-- 5) ANULAR
-- ============================================================
select lives_ok(
  $q$select public.void_punch('aaaa0000-0000-0000-0000-0000000b0002',
       'Bateu saída por engano e continuou trabalhando')$q$,
  'gestor anula uma batida indevida');

reset role;
select is((select count(*) from public.effective_punches(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-02','2026-03-02'))::int, 3,
  'a batida anulada sai dos efetivos');

select is((select count(*) from public.punches
           where membership_id = 'aaaa0000-0000-0000-0000-0000000e0001')::int, 6,
  'sem apagar nada: os registros continuam todos lá');

-- ============================================================
-- 6) O FUNCIONÁRIO PEDE, NÃO CORRIGE
-- ============================================================
select set_config('request.jwt.claims',
  '{"sub":"aaaa1111-0000-0000-0000-000000000003","role":"authenticated"}', true);
set local role authenticated;

select throws_ok(
  $q$select public.add_missing_punch('aaaa0000-0000-0000-0000-0000000e0002',
       'entrada','2026-03-02 11:00:00+00','vou me registrar sozinho')$q$,
  '42501', null::text,
  'funcionário NÃO inclui ponto');

select throws_ok(
  $q$select public.void_punch('aaaa0000-0000-0000-0000-0000000b0001',
       'quero apagar isso')$q$,
  '42501', null::text,
  'funcionário NÃO anula ponto');

select lives_ok(
  $q$insert into public.punch_requests
       (company_id, membership_id, kind, requested_type, requested_at, reason)
     values ('aaaa0000-0000-0000-0000-00000000c001',
             'aaaa0000-0000-0000-0000-0000000e0002','inclusao','entrada',
             '2026-03-02 11:00:00+00','Esqueci de bater na chegada')$q$,
  'mas PODE pedir a inclusão');

-- Pedir no lugar de outro seria abrir a porta pelos fundos.
select throws_ok(
  $q$insert into public.punch_requests
       (company_id, membership_id, kind, requested_type, requested_at, reason)
     values ('aaaa0000-0000-0000-0000-00000000c001',
             'aaaa0000-0000-0000-0000-0000000e0001','inclusao','entrada',
             '2026-03-02 12:00:00+00','pedindo pela colega')$q$,
  '42501', null::text,
  'e NÃO pode pedir no lugar de outra pessoa');

select throws_ok(
  $q$select public.decide_punch_request(
       (select id from public.punch_requests limit 1), true, null)$q$,
  '42501', null::text,
  'nem decidir a própria solicitação');

-- ============================================================
-- 7) APROVAR APLICA A CORREÇÃO
-- ============================================================
reset role;
select set_config('request.jwt.claims',
  '{"sub":"aaaa1111-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $q$select public.decide_punch_request(
       (select id from public.punch_requests where status = 'pendente' limit 1),
       true, 'Confere com a escala')$q$,
  'gestor aprova a solicitação');

select is((select count(*) from public.effective_punches(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-02','2026-03-02')
           where membership_id = 'aaaa0000-0000-0000-0000-0000000e0002')::int, 1,
  'e aprovar já registra a batida — sem passo extra para esquecer');

select is((select status::text from public.punch_requests limit 1), 'aprovada',
  'a solicitação fica marcada como aprovada');

select throws_ok(
  $q$select public.decide_punch_request(
       (select id from public.punch_requests limit 1), false, null)$q$,
  '23514', null::text,
  'e não pode ser decidida duas vezes');

-- ============================================================
-- 8) AUSÊNCIAS
-- ============================================================
select lives_ok(
  $q$insert into public.absences (company_id, membership_id, kind, starts_on, ends_on, note)
     values ('aaaa0000-0000-0000-0000-00000000c001',
             'aaaa0000-0000-0000-0000-0000000e0001','atestado',
             '2026-03-10','2026-03-12','Atestado de 3 dias')$q$,
  'gestor registra atestado com período');

select lives_ok(
  $q$insert into public.absences (company_id, kind, starts_on, ends_on, note)
     values ('aaaa0000-0000-0000-0000-00000000c001','feriado',
             '2026-03-20','2026-03-20','Feriado municipal')$q$,
  'e um feriado da empresa inteira');

select throws_ok(
  $q$insert into public.absences (company_id, membership_id, kind, starts_on, ends_on)
     values ('aaaa0000-0000-0000-0000-00000000c001',
             'aaaa0000-0000-0000-0000-0000000e0001','feriado','2026-03-21','2026-03-21')$q$,
  '23514', null::text,
  'feriado com dono específico é recusado: feriado é de todos');

select throws_ok(
  $q$insert into public.absences (company_id, kind, starts_on, ends_on)
     values ('aaaa0000-0000-0000-0000-00000000c001','atestado','2026-03-22','2026-03-22')$q$,
  '23514', null::text,
  'atestado sem pessoa é recusado: atestado é de alguém');

select throws_ok(
  $q$insert into public.absences (company_id, membership_id, kind, starts_on, ends_on)
     values ('aaaa0000-0000-0000-0000-00000000c001',
             'aaaa0000-0000-0000-0000-0000000e0001','ferias','2026-03-30','2026-03-25')$q$,
  '23514', null::text,
  'período invertido é recusado');

-- Três dias de atestado viram três dias cobertos.
select is((select count(*) from public.absences_in_range(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-01','2026-03-31')
           where kind = 'atestado')::int, 3,
  'o atestado de 3 dias cobre exatamente 3 dias');

-- O feriado alcança as três pessoas sem virar três linhas na tabela.
select is((select count(*) from public.absences_in_range(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-20','2026-03-20'))::int, 3,
  'o feriado da empresa cobre todo mundo');

select is((select bool_and(da_empresa) from public.absences_in_range(
             'aaaa0000-0000-0000-0000-00000000c001','2026-03-20','2026-03-20')), true,
  'e vem marcado como da empresa');

-- ============================================================
-- 9) ATESTADO DE COLEGA NÃO É ASSUNTO DE COLEGA
-- ============================================================
reset role;
select set_config('request.jwt.claims',
  '{"sub":"aaaa1111-0000-0000-0000-000000000003","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*) from public.absences where kind = 'atestado')::int, 0,
  'funcionário NÃO vê o atestado de outra pessoa');

select is((select count(*) from public.absences where kind = 'feriado')::int, 1,
  'mas vê o feriado da empresa');

select throws_ok(
  $q$insert into public.absences (company_id, membership_id, kind, starts_on, ends_on)
     values ('aaaa0000-0000-0000-0000-00000000c001',
             'aaaa0000-0000-0000-0000-0000000e0002','ferias','2026-04-01','2026-04-10')$q$,
  '42501', null::text,
  'e NÃO se dá férias sozinho');

select * from finish();
rollback;
