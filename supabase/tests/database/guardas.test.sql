-- ============================================================
-- REGRESSÃO — a guarda de papel barra quem NÃO É MEMBRO?
--
-- Os outros testes sempre perguntam "o funcionário consegue fazer o que é do
-- gerente?". Nenhum perguntava "e alguém de fora, que não pertence a esta
-- empresa?". A diferença importa porque auth_role() devolve NULL para o
-- estranho, e NULL não dispara `if`:
--
--   NULL <> 'dono'                    -> NULL, não TRUE
--   NULL not in ('dono','gerente')    -> NULL, não TRUE
--
-- Como essas funções são security definer e ignoram RLS de propósito, a
-- guarda era a única barreira. Um usuário de outra empresa exportou 6
-- membros e 341 batidas da base alheia antes desta correção.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions, pg_catalog;
select * from no_plan();

-- ------------------------------------------------------------
-- SETUP: duas empresas que nada têm a ver uma com a outra
-- ------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000','aaaa1111-0000-0000-0000-000000000001','authenticated','authenticated','dono.a@teste.local','x',now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','aaaa1111-0000-0000-0000-000000000002','authenticated','authenticated','carla@teste.local','x',now(),now(),now()),
  -- Estranho: tem conta na plataforma, mas nenhum vínculo com a empresa A.
  ('00000000-0000-0000-0000-000000000000','cccc1111-0000-0000-0000-000000000001','authenticated','authenticated','estranho@teste.local','x',now(),now(),now());

insert into public.companies (id, name, timezone) values
  ('aaaa0000-0000-0000-0000-00000000c001','Padaria A','America/Recife'),
  ('cccc0000-0000-0000-0000-00000000c001','Empresa do Estranho','America/Recife');

insert into public.memberships (id, company_id, user_id, full_name, role) values
  ('aaaa0000-0000-0000-0000-0000000d0001','aaaa0000-0000-0000-0000-00000000c001','aaaa1111-0000-0000-0000-000000000001','Dono A','dono'),
  ('aaaa0000-0000-0000-0000-0000000e0001','aaaa0000-0000-0000-0000-00000000c001','aaaa1111-0000-0000-0000-000000000002','Carla','funcionario'),
  ('cccc0000-0000-0000-0000-0000000d0001','cccc0000-0000-0000-0000-00000000c001','cccc1111-0000-0000-0000-000000000001','Estranho','dono');

insert into public.locations (id, company_id, name, lat, lng, radius_m) values
  ('aaaa0000-0000-0000-0000-0000000a0001','aaaa0000-0000-0000-0000-00000000c001','Centro',-8.06,-34.87,100);

insert into public.shift_templates (company_id, key, label, start_time, end_time, break_minutes) values
  ('aaaa0000-0000-0000-0000-00000000c001','dia','Dia','08:00','17:00',60);

insert into public.punches (id, company_id, membership_id, location_id, type,
                            punched_at, work_date, verified)
values ('aaaa0000-0000-0000-0000-0000000b0001',
        'aaaa0000-0000-0000-0000-00000000c001','aaaa0000-0000-0000-0000-0000000e0001',
        'aaaa0000-0000-0000-0000-0000000a0001','entrada','2026-03-02 11:00:00+00',
        '2026-03-02', true);

-- ============================================================
-- 1) A RAIZ DO PROBLEMA
-- ============================================================
select set_config('request.jwt.claims',
  '{"sub":"cccc1111-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select is(public.auth_role('aaaa0000-0000-0000-0000-00000000c001'), null,
  'auth_role devolve NULL para quem não é membro da empresa');

-- É esta linha que enganava toda guarda escrita como `if ... <> ... then`.
select is((public.auth_role('aaaa0000-0000-0000-0000-00000000c001') <> 'dono'), null,
  'e NULL <> dono avalia como NULL, não como verdadeiro');

select is((public.auth_role('aaaa0000-0000-0000-0000-00000000c001')
           not in ('dono','gerente')), null,
  'idem para NOT IN: por isso o `if` nunca disparava');

-- As funções novas respondem em booleano e nunca devolvem NULL.
select is(public.is_manager('aaaa0000-0000-0000-0000-00000000c001'), false,
  'is_manager responde FALSE, não NULL, para quem é de fora');

select is(public.is_owner('aaaa0000-0000-0000-0000-00000000c001'), false,
  'is_owner também');

select is(public.is_owner('cccc0000-0000-0000-0000-00000000c001'), true,
  'e responde TRUE na empresa em que a pessoa é dona de verdade');

-- ============================================================
-- 2) NENHUMA PORTA ABRE PARA QUEM É DE FORA
-- ============================================================
-- O ataque que vazou a base: exportar passando o id da empresa alheia.
select throws_ok(
  $q$select public.export_company_data('aaaa0000-0000-0000-0000-00000000c001')$q$,
  '42501', null::text,
  'estranho NÃO exporta a base de outra empresa');

select throws_ok(
  $q$select public.delete_company('aaaa0000-0000-0000-0000-00000000c001','Padaria A')$q$,
  '42501', null::text,
  'estranho NÃO apaga outra empresa, mesmo sabendo o nome exato');

select throws_ok(
  $q$select public.update_company('aaaa0000-0000-0000-0000-00000000c001',
                                  'Invadida','America/Recife')$q$,
  '42501', null::text,
  'estranho NÃO renomeia outra empresa');

select throws_ok(
  $q$select public.set_day_shift('aaaa0000-0000-0000-0000-0000000e0001',
                                 '2026-03-02','dia')$q$,
  '42501', null::text,
  'estranho NÃO mexe na escala de outra empresa');

select throws_ok(
  $q$select public.set_weekday_shift('aaaa0000-0000-0000-0000-0000000e0001',
                                     1::smallint,'dia')$q$,
  '42501', null::text,
  'nem no padrão semanal');

select throws_ok(
  $q$select public.copy_week('aaaa0000-0000-0000-0000-00000000c001',
                             '2026-03-02','2026-03-09')$q$,
  '42501', null::text,
  'nem copia a semana');

select throws_ok(
  $q$select public.add_missing_punch('aaaa0000-0000-0000-0000-0000000e0001',
       'saida','2026-03-02 20:00:00+00','inventando uma batida')$q$,
  '42501', null::text,
  'estranho NÃO inclui ponto para funcionário de outra empresa');

select throws_ok(
  $q$select public.adjust_punch('aaaa0000-0000-0000-0000-0000000b0001',
       '2026-03-02 10:00:00+00','mexendo no ponto alheio')$q$,
  '42501', null::text,
  'nem corrige o horário de uma batida alheia');

select throws_ok(
  $q$select public.void_punch('aaaa0000-0000-0000-0000-0000000b0001',
       'anulando ponto alheio')$q$,
  '42501', null::text,
  'nem anula');

select throws_ok(
  $q$select * from public.bulk_invite('aaaa0000-0000-0000-0000-00000000c001',
     '[{"nome":"Intruso","email":"intruso@teste.local"}]'::jsonb)$q$,
  '42501', null::text,
  'estranho NÃO convida gente para outra empresa');

select throws_ok(
  $q$select public.queue_schedule_notices('aaaa0000-0000-0000-0000-00000000c001')$q$,
  '42501', null::text,
  'nem dispara aviso em nome dela');

select throws_ok(
  $q$select public.expire_stale_invitations('aaaa0000-0000-0000-0000-00000000c001')$q$,
  '42501', null::text,
  'nem mexe nos convites dela');

-- ============================================================
-- 3) NADA FOI ALTERADO NA TENTATIVA
-- ============================================================
reset role;

select is((select name from public.companies
           where id = 'aaaa0000-0000-0000-0000-00000000c001'), 'Padaria A',
  'depois de tudo, a empresa continua com o nome dela');

-- Escopado na empresa do teste: contar a tabela inteira faria o resultado
-- depender de o banco estar vazio.
select is((select count(*) from public.punches
           where company_id = 'aaaa0000-0000-0000-0000-00000000c001')::int, 1,
  'e com o mesmo número de batidas');

select is((select count(*) from public.schedule_entries
           where company_id = 'aaaa0000-0000-0000-0000-00000000c001')::int, 0,
  'sem escala inventada por quem é de fora');

-- ============================================================
-- 4) QUEM É DE DENTRO CONTINUA TRABALHANDO
-- ============================================================
-- Guarda que barra todo mundo não é guarda, é parede.
select set_config('request.jwt.claims',
  '{"sub":"aaaa1111-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select is(public.is_manager('aaaa0000-0000-0000-0000-00000000c001'), true,
  'o dono continua sendo reconhecido como gestor');

select lives_ok(
  $q$select public.set_weekday_shift('aaaa0000-0000-0000-0000-0000000e0001',
                                     1::smallint,'dia')$q$,
  'e continua montando a escala');

select lives_ok(
  $q$select public.update_company('aaaa0000-0000-0000-0000-00000000c001',
                                  'Padaria A','America/Recife')$q$,
  'e alterando a configuração da empresa');

select isnt((select public.export_company_data(
               'aaaa0000-0000-0000-0000-00000000c001')), null,
  'e exportando os próprios dados');

select * from finish();
rollback;
