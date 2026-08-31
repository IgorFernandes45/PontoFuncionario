-- ============================================================
-- GATE DA SPRINT 5 — ponto server-authoritative
--
-- A pergunta que estes testes respondem: um funcionário mal-intencionado,
-- com acesso total ao próprio navegador, consegue registrar um ponto que não
-- deveria valer? A resposta precisa ser não.
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

-- Marco Zero do Recife. Raio de 100 m.
insert into public.locations (id, company_id, name, lat, lng, radius_m) values
  ('aaaa0000-0000-0000-0000-0000000a0001','aaaa0000-0000-0000-0000-00000000c001',
   'Loja Centro', -8.063200, -34.871300, 100);

-- ============================================================
-- 1) HAVERSINE
-- ============================================================
select ok(public.haversine_m(-8.0632, -34.8713, -8.0632, -34.8713) < 1,
  'a mesma coordenada dá distância zero');

-- 0,01 grau de latitude ≈ 1,11 km.
select ok(
  public.haversine_m(-8.0632, -34.8713, -8.0732, -34.8713) between 1050 and 1160,
  'um centésimo de grau de latitude dá pouco mais de 1 km');

-- ============================================================
-- 2) DENTRO E FORA DO RAIO
-- ============================================================
-- ~30 m ao norte: dentro do raio de 100 m.
select lives_ok(
  $q$select public.register_punch('aaaa0000-0000-0000-0000-0000000e0001','entrada',
       -8.06293, -34.87130, 15)$q$,
  'batida a ~30 m da unidade é aceita');

select is((select verified from public.punches
           where membership_id = 'aaaa0000-0000-0000-0000-0000000e0001'), true,
  'e é gravada como verificada');

select ok((select distance_m from public.punches
           where membership_id = 'aaaa0000-0000-0000-0000-0000000e0001') between 20 and 45,
  'com a distância calculada pelo servidor, não informada pelo cliente');

-- ~1,1 km: fora.
select throws_ok(
  $q$select public.register_punch('aaaa0000-0000-0000-0000-0000000e0002','entrada',
       -8.0732, -34.8713, 15)$q$,
  '23514', null::text,
  'batida a mais de 1 km é recusada');

select is((select count(*) from public.punches
           where membership_id = 'aaaa0000-0000-0000-0000-0000000e0002')::int, 0,
  'e nada é gravado quando a batida é recusada');

-- ============================================================
-- 3) GPS IMPRECISO NÃO PROVA NADA
-- ============================================================
-- Estar "dentro" com precisão de ±500 m num raio de 100 m é coincidência,
-- não prova. Aceitar seria fingir que valida.
select throws_ok(
  $q$select public.register_punch('aaaa0000-0000-0000-0000-0000000e0002','entrada',
       -8.06293, -34.87130, 500)$q$,
  '23514', null::text,
  'precisão pior que o raio é recusada mesmo com coordenada dentro');

select throws_ok(
  $q$select public.register_punch('aaaa0000-0000-0000-0000-0000000e0002','entrada',
       null, null, null)$q$,
  '23514', null::text,
  'sem coordenada nenhuma é recusada');

-- ============================================================
-- 4) O CLIENTE NÃO ESCREVE
-- ============================================================
-- A defesa mais importante: não existe caminho de escrita pelo cliente.
select set_config('request.jwt.claims',
  '{"sub":"aaaa1111-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;

select throws_ok(
  $q$insert into public.punches
       (company_id, membership_id, type, punched_at, work_date, verified)
     values ('aaaa0000-0000-0000-0000-00000000c001',
             'aaaa0000-0000-0000-0000-0000000e0001','entrada', now(),
             current_date, true)$q$,
  '42501', null::text,
  'funcionário NÃO insere ponto direto, nem com verified=true no payload');

select throws_ok(
  $q$select public.register_punch('aaaa0000-0000-0000-0000-0000000e0001','saida',
       -8.06293, -34.87130, 15)$q$,
  '42501', null::text,
  'e NÃO consegue nem chamar a função de registro');

-- Append-only: nem alterar o que já existe.
reset role;
select throws_ok(
  $q$update public.punches set distance_m = 0$q$,
  '23001', null::text,
  'ponto registrado não pode ser alterado');

select throws_ok(
  $q$delete from public.punches$q$,
  '23001', null::text,
  'nem apagado');

-- ============================================================
-- 5) SEQUÊNCIA
-- ============================================================
-- Carla já bateu entrada. Outra entrada viraria hora fantasma no relatório.
select throws_ok(
  $q$select public.register_punch('aaaa0000-0000-0000-0000-0000000e0001','entrada',
       -8.06293, -34.87130, 15)$q$,
  '23514', null::text,
  'duas entradas seguidas são recusadas');

select throws_ok(
  $q$select public.register_punch('aaaa0000-0000-0000-0000-0000000e0001','intervalo_fim',
       -8.06293, -34.87130, 15)$q$,
  '23514', null::text,
  'fim de intervalo sem início é recusado');

select lives_ok(
  $q$select public.register_punch('aaaa0000-0000-0000-0000-0000000e0001','intervalo_inicio',
       -8.06293, -34.87130, 15)$q$,
  'início de intervalo depois da entrada é aceito');

select throws_ok(
  $q$select public.register_punch('aaaa0000-0000-0000-0000-0000000e0001','saida',
       -8.06293, -34.87130, 15)$q$,
  '23514', null::text,
  'sair sem voltar do intervalo é recusado');

select lives_ok(
  $q$select public.register_punch('aaaa0000-0000-0000-0000-0000000e0001','intervalo_fim',
       -8.06293, -34.87130, 15)$q$,
  'volta do intervalo é aceita');

select lives_ok(
  $q$select public.register_punch('aaaa0000-0000-0000-0000-0000000e0001','saida',
       -8.06293, -34.87130, 15)$q$,
  'e a saída depois dela também');

select is((select array_length(public.allowed_punch_types(
             'aaaa0000-0000-0000-0000-0000000e0001', current_date), 1)), 1,
  'depois da saída sobra uma opção');

select ok('entrada' = any(public.allowed_punch_types(
             'aaaa0000-0000-0000-0000-0000000e0001', current_date)),
  'que é entrada, porque turno dobrado no mesmo dia existe');

-- ============================================================
-- 6) HORÁRIO INFORMADO PELO CLIENTE
-- ============================================================
-- A fila offline precisa mandar o momento da batida. Isso não pode virar
-- uma porta para inventar horário.
select throws_ok(
  $q$select public.register_punch('aaaa0000-0000-0000-0000-0000000e0002','entrada',
       -8.06293, -34.87130, 15, now() + interval '3 hours')$q$,
  '23514', null::text,
  'horário no futuro é recusado');

select throws_ok(
  $q$select public.register_punch('aaaa0000-0000-0000-0000-0000000e0002','entrada',
       -8.06293, -34.87130, 15, now() - interval '3 days')$q$,
  '23514', null::text,
  'batida velha demais é recusada — isso é caso de ajuste, não de sincronia');

select lives_ok(
  $q$select public.register_punch('aaaa0000-0000-0000-0000-0000000e0002','entrada',
       -8.06293, -34.87130, 15, now() - interval '40 minutes')$q$,
  'batida de 40 minutos atrás sobe pela fila offline');

select is((select sincronizado_em is not null from public.punches
           where membership_id = 'aaaa0000-0000-0000-0000-0000000e0002'), true,
  'e fica marcada como sincronizada em atraso');

select is((select punched_at < now() - interval '30 minutes' from public.punches
           where membership_id = 'aaaa0000-0000-0000-0000-0000000e0002'), true,
  'preservando o horário em que a pessoa realmente bateu');

-- ============================================================
-- 7) SELFIE OBRIGATÓRIA
-- ============================================================
update public.locations set require_selfie = true
 where id = 'aaaa0000-0000-0000-0000-0000000a0001';

select throws_ok(
  $q$select public.register_punch('aaaa0000-0000-0000-0000-0000000e0002','saida',
       -8.06293, -34.87130, 15)$q$,
  '23514', null::text,
  'unidade que exige foto recusa batida sem foto');

select lives_ok(
  $q$select public.register_punch('aaaa0000-0000-0000-0000-0000000e0002','saida',
       -8.06293, -34.87130, 15, null, 'selfies/abc.jpg')$q$,
  'e aceita quando a foto vem junto');

update public.locations set require_selfie = false
 where id = 'aaaa0000-0000-0000-0000-0000000a0001';

-- ============================================================
-- 8) QUEM LÊ O QUÊ
-- ============================================================
select set_config('request.jwt.claims',
  '{"sub":"aaaa1111-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;

select is((select count(distinct membership_id) from public.punches)::int, 1,
  'funcionário lê só o próprio ponto');

select is((select count(distinct membership_id) from public.effective_punches(
             'aaaa0000-0000-0000-0000-00000000c001',
             current_date - 1, current_date + 1))::int, 1,
  'e a função de leitura respeita a mesma regra');

reset role;
select set_config('request.jwt.claims',
  '{"sub":"aaaa1111-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select is((select count(distinct membership_id) from public.effective_punches(
             'aaaa0000-0000-0000-0000-00000000c001',
             current_date - 1, current_date + 1))::int, 2,
  'o dono lê o ponto das duas pessoas');

-- ============================================================
-- 9) ESTADO DA TELA DE BATER PONTO
-- ============================================================
reset role;
select set_config('request.jwt.claims',
  '{"sub":"aaaa1111-0000-0000-0000-000000000003","role":"authenticated"}', true);
set local role authenticated;

select is((select location_name from public.my_punch_state(
             'aaaa0000-0000-0000-0000-00000000c001')), 'Loja Centro',
  'a tela recebe a unidade onde a pessoa bate ponto');

select is((select radius_m from public.my_punch_state(
             'aaaa0000-0000-0000-0000-00000000c001')), 100,
  'com o raio, para dar retorno antes de tentar');

select is((select ultimo_tipo::text from public.my_punch_state(
             'aaaa0000-0000-0000-0000-00000000c001')), 'saida',
  'e o que foi batido por último');

-- ============================================================
-- 10) VÍNCULO INATIVO NÃO BATE PONTO
-- ============================================================
reset role;
update public.memberships set status = 'inativo'
 where id = 'aaaa0000-0000-0000-0000-0000000e0002';

select throws_ok(
  $q$select public.register_punch('aaaa0000-0000-0000-0000-0000000e0002','entrada',
       -8.06293, -34.87130, 15)$q$,
  '42501', null::text,
  'quem foi desativado não registra ponto');

select * from finish();
rollback;
