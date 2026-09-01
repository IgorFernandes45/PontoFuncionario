-- ============================================================
-- Sprint 8 — Endurecer para uso real
--
-- O que só importa quando existe gente de verdade usando: limite de
-- requisição, saída e exclusão de dados (LGPD), fila de notificação e um
-- lugar para o erro aparecer.
-- ============================================================

-- ============================================================
-- LIMITE DE REQUISIÇÃO
-- ============================================================
-- `/api/punch` é a rota que um script consegue martelar: ela aceita
-- coordenada e devolve se aquele ponto do mapa é válido. Sem limite, dá para
-- varrer o mapa até achar o raio da unidade.
create table public.rate_events (
  id         bigserial primary key,
  chave      text not null,
  created_at timestamptz not null default clock_timestamp()
);
create index rate_events_chave_idx on public.rate_events (chave, created_at desc);

alter table public.rate_events enable row level security;
alter table public.rate_events force row level security;
-- Nenhuma policy: só o servidor (service_role) escreve e lê.
revoke all on public.rate_events from anon, authenticated;

create or replace function public.check_rate_limit(
  p_chave    text,
  p_max      integer,
  p_janela_s integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_qtd integer;
begin
  delete from public.rate_events
   where created_at < clock_timestamp() - make_interval(secs => p_janela_s * 10);

  select count(*) into v_qtd
  from public.rate_events
  where chave = p_chave
    and created_at > clock_timestamp() - make_interval(secs => p_janela_s);

  if v_qtd >= p_max then
    return false;
  end if;

  insert into public.rate_events (chave) values (p_chave);
  return true;
end;
$$;

revoke all on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;

-- ============================================================
-- FILA DE NOTIFICAÇÃO
-- ============================================================
-- A Sprint 4 deixou o aviso de mudança de escala pendente por falta de
-- provedor de e-mail. A fila resolve a parte que é nossa: a mensagem fica
-- registrada com destinatário e conteúdo, e o envio vira um detalhe de
-- configuração. Sem chave, o piloto roda e nada se perde.
create type public.outbox_status as enum ('pendente','enviado','falhou');

create table public.outbox (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  para_email  text not null,
  assunto     text not null,
  corpo       text not null,
  status      public.outbox_status not null default 'pendente',
  tentativas  integer not null default 0,
  erro        text,
  enviado_em  timestamptz,
  created_at  timestamptz not null default clock_timestamp()
);
create index outbox_pendentes_idx on public.outbox (status, created_at)
  where status = 'pendente';
create index outbox_company_idx on public.outbox (company_id, created_at desc);

alter table public.outbox enable row level security;
alter table public.outbox force row level security;

-- Só quem administra vê o que saiu em nome da empresa.
create policy outbox_select on public.outbox
  for select to authenticated
  using (public.auth_role(company_id) in ('dono','gerente'));

revoke all on public.outbox from anon;
grant select on public.outbox to authenticated;

-- ------------------------------------------------------------
-- Avisar quem teve a escala mudada
-- ------------------------------------------------------------
-- Agrupado por pessoa e por dia: mexer em vinte turnos gera um aviso por
-- pessoa, não vinte. Sem isso o e-mail vira ruído e a pessoa desliga.
create or replace function public.queue_schedule_notices(
  p_company_id uuid,
  p_desde      timestamptz default (now() - interval '1 day')
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_n integer := 0;
  v_empresa text;
  r record;
begin
  if public.auth_role(p_company_id) not in ('dono','gerente') then
    raise exception 'Sem permissão' using errcode = 'insufficient_privilege';
  end if;

  select name into v_empresa from public.companies where id = p_company_id;

  for r in
    select m.id, m.full_name, u.email, count(*) as mudancas
    from public.schedule_entries e
    join public.memberships m on m.id = e.membership_id
    join auth.users u on u.id = m.user_id
    where e.company_id = p_company_id
      and m.status = 'ativo'
      and e.created_at >= p_desde
      -- Uma mensagem por pessoa por rodada: se já existe aviso pendente
      -- para ela, o próximo lote não cria outro.
      and not exists (
        select 1 from public.outbox o
        where o.company_id = p_company_id
          and o.para_email = u.email
          and o.status = 'pendente'
      )
    group by m.id, m.full_name, u.email
  loop
    insert into public.outbox (company_id, para_email, assunto, corpo)
    values (
      p_company_id,
      r.email,
      'Sua escala mudou — ' || v_empresa,
      r.full_name || ', sua escala na ' || v_empresa || ' teve '
        || r.mudancas || ' alteração(ões). Abra o aplicativo para conferir os '
        || 'seus próximos turnos antes de ir trabalhar.'
    );
    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$$;

revoke all on function public.queue_schedule_notices(uuid, timestamptz) from public, anon;
grant execute on function public.queue_schedule_notices(uuid, timestamptz) to authenticated;

-- ============================================================
-- LGPD — SAÍDA DE DADOS
-- ============================================================
-- Art. 18: o titular tem direito à portabilidade e à eliminação. Na prática,
-- é isto que impede o produto de virar sequestro de dados.
create or replace function public.export_company_data(p_company_id uuid)
returns jsonb
language plpgsql
-- Volatile de proposito: a funcao grava na auditoria, e `stable` proibiria o
-- insert. Exportar a base inteira precisa deixar rastro.
security definer
set search_path = public, pg_temp
as $$
declare
  v_dados jsonb;
begin
  if public.auth_role(p_company_id) <> 'dono' then
    raise exception 'Só o dono exporta os dados da empresa'
      using errcode = 'insufficient_privilege';
  end if;

  select jsonb_build_object(
    'exportado_em', clock_timestamp(),
    'empresa', (select to_jsonb(c) from public.companies c where c.id = p_company_id),
    'membros', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'nome', m.full_name, 'email', u.email, 'papel', m.role,
        'status', m.status, 'desde', m.created_at)), '[]'::jsonb)
      from public.memberships m
      join auth.users u on u.id = m.user_id
      where m.company_id = p_company_id
    ),
    'turnos', (
      select coalesce(jsonb_agg(to_jsonb(s) - 'company_id'), '[]'::jsonb)
      from public.shift_templates s where s.company_id = p_company_id
    ),
    'unidades', (
      select coalesce(jsonb_agg(to_jsonb(l) - 'company_id'), '[]'::jsonb)
      from public.locations l where l.company_id = p_company_id
    ),
    'escala', (
      select coalesce(jsonb_agg(to_jsonb(e) - 'company_id'), '[]'::jsonb)
      from public.schedule_entries e where e.company_id = p_company_id
    ),
    'ponto', (
      select coalesce(jsonb_agg(to_jsonb(p) - 'company_id'), '[]'::jsonb)
      from public.punches p where p.company_id = p_company_id
    ),
    'ausencias', (
      select coalesce(jsonb_agg(to_jsonb(a) - 'company_id'), '[]'::jsonb)
      from public.absences a where a.company_id = p_company_id
    ),
    'solicitacoes', (
      select coalesce(jsonb_agg(to_jsonb(r) - 'company_id'), '[]'::jsonb)
      from public.punch_requests r where r.company_id = p_company_id
    ),
    'auditoria', (
      select coalesce(jsonb_agg(to_jsonb(al) - 'company_id'), '[]'::jsonb)
      from public.audit_log al where al.company_id = p_company_id
    )
  ) into v_dados;

  insert into public.audit_log (company_id, actor, action, target)
  values (p_company_id, auth.uid(), 'company.export', p_company_id::text);

  return v_dados;
end;
$$;

revoke all on function public.export_company_data(uuid) from public, anon;
grant execute on function public.export_company_data(uuid) to authenticated;

-- ------------------------------------------------------------
-- Apagar a empresa
-- ------------------------------------------------------------
-- Exige o nome digitado por extenso. Um clique errado aqui apaga o histórico
-- de jornada de todo mundo, e isso não se desfaz.
create or replace function public.delete_company(
  p_company_id uuid,
  p_confirmacao text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_nome text;
begin
  if public.auth_role(p_company_id) <> 'dono' then
    raise exception 'Só o dono apaga a empresa'
      using errcode = 'insufficient_privilege';
  end if;

  select name into v_nome from public.companies where id = p_company_id;

  if btrim(coalesce(p_confirmacao, '')) <> v_nome then
    raise exception 'Digite o nome exato da empresa para confirmar'
      using errcode = 'check_violation';
  end if;

  -- A cascata leva tudo. `deny_mutation` já abre exceção para este caso: a
  -- imutabilidade protege o registro, não a conta.
  delete from public.companies where id = p_company_id;
end;
$$;

revoke all on function public.delete_company(uuid, text) from public, anon;
grant execute on function public.delete_company(uuid, text) to authenticated;

-- ============================================================
-- IMPORTAR EQUIPE
-- ============================================================
-- Digitar trinta convites um a um é onde o cliente desiste antes de começar.
create or replace function public.bulk_invite(
  p_company_id uuid,
  p_pessoas    jsonb   -- [{"nome": "...", "email": "...", "papel": "funcionario"}]
)
returns table (email text, resultado text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r        jsonb;
  v_email  text;
  v_nome   text;
  v_papel  public.app_role;
begin
  if public.auth_role(p_company_id) not in ('dono','gerente') then
    raise exception 'Sem permissão para convidar' using errcode = 'insufficient_privilege';
  end if;

  perform public.expire_stale_invitations(p_company_id);

  for r in select * from jsonb_array_elements(p_pessoas)
  loop
    v_email := lower(btrim(r->>'email'));
    v_nome  := btrim(coalesce(r->>'nome', ''));
    begin
      v_papel := coalesce(nullif(r->>'papel',''), 'funcionario')::public.app_role;
    exception when others then
      v_papel := 'funcionario';
    end;

    if v_email is null or position('@' in v_email) < 2 then
      email := coalesce(v_email, '(vazio)'); resultado := 'e-mail inválido';
      return next; continue;
    end if;

    if v_nome = '' then
      email := v_email; resultado := 'nome vazio';
      return next; continue;
    end if;

    -- Quem já é da casa não precisa de convite.
    if exists (
      select 1 from public.memberships m
      join auth.users u on u.id = m.user_id
      where m.company_id = p_company_id and lower(u.email) = v_email
    ) then
      email := v_email; resultado := 'já é membro';
      return next; continue;
    end if;

    if not public.can_manage_member(p_company_id, v_papel) then
      email := v_email; resultado := 'você não pode convidar com esse papel';
      return next; continue;
    end if;

    begin
      insert into public.invitations (company_id, email, full_name, role, created_by)
      values (p_company_id, v_email, v_nome, v_papel, auth.uid());
      email := v_email; resultado := 'convidado';
    exception
      when unique_violation then
        email := v_email; resultado := 'já tinha convite pendente';
      when others then
        email := v_email; resultado := 'erro: ' || sqlerrm;
    end;
    return next;
  end loop;
end;
$$;

revoke all on function public.bulk_invite(uuid, jsonb) from public, anon;
grant execute on function public.bulk_invite(uuid, jsonb) to authenticated;

-- ============================================================
-- SAÚDE DA OPERAÇÃO
-- ============================================================
-- O que o gestor precisa ver ao abrir o painel de manhã, sem procurar.
create or replace function public.operation_health(p_company_id uuid)
returns table (
  turnos_abertos_ontem integer,
  pedidos_pendentes    integer,
  faltas_ontem         integer,
  sem_escala_hoje      integer,
  avisos_na_fila       integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with tz as (select timezone from public.companies where id = p_company_id),
       hoje as (select (now() at time zone (select timezone from tz))::date as d),
       ontem as (select d - 1 as d from hoje)
  select
    (select count(*)::integer from public.daily_report(p_company_id,
       (select d from ontem), (select d from ontem)) where situacao = 'em_aberto'),
    (select count(*)::integer from public.punch_requests
      where company_id = p_company_id and status = 'pendente'),
    (select count(*)::integer from public.daily_report(p_company_id,
       (select d from ontem), (select d from ontem)) where situacao = 'falta'),
    (select count(*)::integer from public.daily_report(p_company_id,
       (select d from hoje), (select d from hoje)) where situacao = 'sem_escala'),
    (select count(*)::integer from public.outbox
      where company_id = p_company_id and status = 'pendente')
  where public.auth_role(p_company_id) in ('dono','gerente');
$$;

revoke all on function public.operation_health(uuid) from public, anon;
grant execute on function public.operation_health(uuid) to authenticated;
