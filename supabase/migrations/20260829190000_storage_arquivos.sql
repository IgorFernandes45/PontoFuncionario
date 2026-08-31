-- ============================================================
-- Arquivos: selfie do ponto e anexo de ausência
--
-- Fecha as duas dívidas deixadas nas Sprints 5 e 6. Enquanto isso não
-- existia, uma unidade com "exigir selfie" ligado bloqueava o ponto na
-- prática: o banco recusava a batida sem foto e a tela não tinha como enviar.
--
-- O caminho do arquivo carrega a autorização:
--   selfies/{company_id}/{membership_id}/{uuid}.jpg
--   anexos/{company_id}/{uuid}.pdf
-- Assim a policy decide sem consultar tabela nenhuma.
-- ============================================================

-- ------------------------------------------------------------
-- Cast que não explode
-- ------------------------------------------------------------
-- `texto::uuid` levanta exceção com entrada inválida. Numa policy isso vira
-- erro para o usuário em vez de negação — e o nome do objeto no Storage é
-- texto livre, então basta alguém criar `selfies/qualquer-coisa/x.jpg`.
create or replace function public.safe_uuid(p_texto text)
returns uuid
language plpgsql
immutable
set search_path = pg_catalog, pg_temp
as $$
begin
  return p_texto::uuid;
exception when others then
  return null;
end;
$$;

grant execute on function public.safe_uuid(text) to authenticated, anon;

-- ------------------------------------------------------------
-- Buckets privados
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  -- Foto de rosto: a tela já reduz antes de enviar, 2 MB é folga larga.
  ('selfies', 'selfies', false, 2097152,
   array['image/jpeg','image/png','image/webp']),
  ('anexos',  'anexos',  false, 10485760,
   array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ------------------------------------------------------------
-- SELFIES
-- ------------------------------------------------------------
drop policy if exists selfies_insert on storage.objects;
drop policy if exists selfies_select on storage.objects;

-- O funcionário envia a PRÓPRIA selfie: o membership no caminho tem que ser
-- um dos dele.
create policy selfies_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'selfies'
    and public.safe_uuid((storage.foldername(name))[1])
        in (select public.auth_company_ids())
    and public.safe_uuid((storage.foldername(name))[2])
        in (select public.auth_membership_ids())
  );

-- Lê quem administra, e a própria pessoa. Selfie de colega não é assunto de
-- colega, pela mesma razão do atestado.
create policy selfies_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'selfies'
    and public.safe_uuid((storage.foldername(name))[1])
        in (select public.auth_company_ids())
    and (
      public.auth_role(public.safe_uuid((storage.foldername(name))[1]))
        in ('dono','gerente')
      or public.safe_uuid((storage.foldername(name))[2])
         in (select public.auth_membership_ids())
    )
  );

-- Sem UPDATE nem DELETE: a selfie é parte de um registro de ponto, e registro
-- de ponto é append-only. Trocar a foto depois esvaziaria a prova.

-- ------------------------------------------------------------
-- ANEXOS (atestado)
-- ------------------------------------------------------------
-- Reescritas: a versão da Sprint 6 fazia `::uuid` direto e quebraria com um
-- caminho fora do padrão.
drop policy if exists anexos_gestao_le on storage.objects;
drop policy if exists anexos_gestao_escreve on storage.objects;
drop policy if exists anexos_gestao_apaga on storage.objects;

create policy anexos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'anexos'
    and public.safe_uuid((storage.foldername(name))[1])
        in (select public.auth_company_ids())
    and public.auth_role(public.safe_uuid((storage.foldername(name))[1]))
        in ('dono','gerente')
  );

create policy anexos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'anexos'
    and public.safe_uuid((storage.foldername(name))[1])
        in (select public.auth_company_ids())
    and public.auth_role(public.safe_uuid((storage.foldername(name))[1]))
        in ('dono','gerente')
  );

-- Atestado se corrige trocando o arquivo; a ausência não é registro de ponto.
create policy anexos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'anexos'
    and public.safe_uuid((storage.foldername(name))[1])
        in (select public.auth_company_ids())
    and public.auth_role(public.safe_uuid((storage.foldername(name))[1]))
        in ('dono','gerente')
  );
