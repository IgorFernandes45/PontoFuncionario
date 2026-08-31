-- ============================================================
-- GATE — arquivos: selfie do ponto e anexo de ausência
--
-- O caminho do arquivo é quem carrega a autorização, e o nome de um objeto no
-- Storage é texto livre. A pergunta: dá para alcançar arquivo de outra
-- empresa escrevendo um caminho à mão?
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

-- ============================================================
-- 1) CAST QUE NÃO EXPLODE
-- ============================================================
-- Sem isto, um caminho fora do padrão faria a policy levantar exceção em vez
-- de negar — e erro no lugar de negação já é meia porta aberta.
select is(public.safe_uuid('nao-e-uuid'), null,
  'texto inválido vira nulo em vez de exceção');

select is(public.safe_uuid('aaaa0000-0000-0000-0000-00000000c001'),
  'aaaa0000-0000-0000-0000-00000000c001'::uuid,
  'e um uuid de verdade continua sendo convertido');

select is(public.safe_uuid(null), null, 'nulo continua nulo');

-- ============================================================
-- 2) SELFIE — o funcionário envia a própria
-- ============================================================
select set_config('request.jwt.claims',
  '{"sub":"aaaa1111-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $q$insert into storage.objects (bucket_id, name, owner)
     values ('selfies',
             'aaaa0000-0000-0000-0000-00000000c001/aaaa0000-0000-0000-0000-0000000e0001/foto1.jpg',
             'aaaa1111-0000-0000-0000-000000000002')$q$,
  'Carla envia selfie na própria pasta');

-- O caminho é o que autoriza, então forjá-lo é o ataque óbvio.
select throws_ok(
  $q$insert into storage.objects (bucket_id, name, owner)
     values ('selfies',
             'aaaa0000-0000-0000-0000-00000000c001/aaaa0000-0000-0000-0000-0000000e0002/foto2.jpg',
             'aaaa1111-0000-0000-0000-000000000002')$q$,
  '42501', null::text,
  'e NÃO consegue enviar na pasta do colega');

select throws_ok(
  $q$insert into storage.objects (bucket_id, name, owner)
     values ('selfies',
             'bbbb0000-0000-0000-0000-00000000c001/bbbb0000-0000-0000-0000-0000000d0001/x.jpg',
             'aaaa1111-0000-0000-0000-000000000002')$q$,
  '42501', null::text,
  'nem em pasta de outra empresa');

-- O caminho torto é o que quebraria o cast direto.
select throws_ok(
  $q$insert into storage.objects (bucket_id, name, owner)
     values ('selfies','solta.jpg','aaaa1111-0000-0000-0000-000000000002')$q$,
  '42501', null::text,
  'caminho sem pasta é NEGADO, não dá erro de conversão');

select throws_ok(
  $q$insert into storage.objects (bucket_id, name, owner)
     values ('selfies','qualquer-coisa/outra-coisa/x.jpg',
             'aaaa1111-0000-0000-0000-000000000002')$q$,
  '42501', null::text,
  'caminho com pasta que não é uuid também é negado');

-- ============================================================
-- 3) SELFIE — quem lê
-- ============================================================
select is((select count(*) from storage.objects where bucket_id = 'selfies')::int, 1,
  'Carla enxerga a própria selfie');

reset role;
select set_config('request.jwt.claims',
  '{"sub":"aaaa1111-0000-0000-0000-000000000003","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*) from storage.objects where bucket_id = 'selfies')::int, 0,
  'o colega NÃO enxerga a selfie dela');

reset role;
select set_config('request.jwt.claims',
  '{"sub":"aaaa1111-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*) from storage.objects where bucket_id = 'selfies')::int, 1,
  'mas quem administra enxerga, porque precisa conferir');

reset role;
select set_config('request.jwt.claims',
  '{"sub":"bbbb1111-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*) from storage.objects where bucket_id = 'selfies')::int, 0,
  'e o dono da empresa vizinha não enxerga nada');

-- ============================================================
-- 4) O QUE PODE SER APAGADO
-- ============================================================
-- Aqui a verificação é ESTRUTURAL, e de propósito. O Supabase tem um trigger
-- próprio (storage.protect_delete) que recusa DELETE direto em
-- storage.objects e manda usar a Storage API — então um `delete` daqui
-- falharia mesmo sem policy nenhuma, e o teste passaria pela razão errada.
-- O que está sob nosso controle é a existência da policy.
reset role;

select is((select count(*) from pg_policies
           where schemaname = 'storage' and tablename = 'objects'
             and cmd = 'DELETE' and qual like '%selfies%')::int, 0,
  'NÃO existe policy de delete para selfies: a foto é parte de um registro append-only');

select is((select count(*) from pg_policies
           where schemaname = 'storage' and tablename = 'objects'
             and cmd = 'DELETE' and qual like '%anexos%')::int, 1,
  'existe para anexos, porque atestado se corrige trocando o arquivo');

select is((select count(*) from pg_policies
           where schemaname = 'storage' and tablename = 'objects'
             and cmd = 'UPDATE')::int, 0,
  'e nenhum dos dois buckets aceita substituir o arquivo no lugar');

-- ============================================================
-- 5) ANEXO DE ATESTADO — só gestão
-- ============================================================
-- A seção acima terminou como superuser, que ignora RLS. Sem voltar para uma
-- sessão de verdade, os testes abaixo passariam sem provar nada.
select set_config('request.jwt.claims',
  '{"sub":"aaaa1111-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $q$insert into storage.objects (bucket_id, name, owner)
     values ('anexos','aaaa0000-0000-0000-0000-00000000c001/atestado1.pdf',
             'aaaa1111-0000-0000-0000-000000000001')$q$,
  'quem administra envia o anexo do atestado');

select throws_ok(
  $q$insert into storage.objects (bucket_id, name, owner)
     values ('anexos','bbbb0000-0000-0000-0000-00000000c001/invasor.pdf',
             'aaaa1111-0000-0000-0000-000000000001')$q$,
  '42501', null::text,
  'e não alcança a pasta da empresa vizinha');

reset role;
select set_config('request.jwt.claims',
  '{"sub":"aaaa1111-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;

select throws_ok(
  $q$insert into storage.objects (bucket_id, name, owner)
     values ('anexos','aaaa0000-0000-0000-0000-00000000c001/meu-atestado.pdf',
             'aaaa1111-0000-0000-0000-000000000002')$q$,
  '42501', null::text,
  'funcionário NÃO envia anexo direto — quem registra a ausência é a gestão');

-- ============================================================
-- 6) OS BUCKETS SÃO PRIVADOS
-- ============================================================
reset role;
select is((select bool_and(not public) from storage.buckets
           where id in ('selfies','anexos')), true,
  'os dois buckets são privados: nada é acessível por URL pública');

select ok((select file_size_limit from storage.buckets where id = 'selfies') <= 2097152,
  'selfie tem teto de tamanho, porque foto de celular chega grande');

select * from finish();
rollback;
