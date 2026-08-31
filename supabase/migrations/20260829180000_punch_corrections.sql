-- ============================================================
-- Sprint 6 — Correção de ponto
--
-- `punches` é append-only. Corrigir NÃO é alterar: é inserir um registro novo
-- que aponta para o que substitui. O original continua no banco, consultável,
-- e a cadeia inteira fica auditável.
--
--   corrigir horário -> punch novo com replaces_punch_id = original
--   anular batida    -> punch novo com voided = true e replaces_punch_id
--   incluir faltante -> punch novo sem replaces, origin = 'ajuste_manual'
--
-- Um punch é EFETIVO quando ninguém o substituiu e ele não está anulado.
-- ============================================================

-- ------------------------------------------------------------
-- Sequência do dia inteiro
-- ------------------------------------------------------------
-- allowed_punch_types() olha só a última batida, o que serve para o app onde
-- as batidas chegam em ordem. Uma correção insere NO MEIO do dia, então a
-- pergunta muda: depois desta mudança, o dia inteiro continua coerente?
-- A pergunta muda conforme quem pergunta.
--
-- allowed_punch_types() (Sprint 5) guia o app e é ESTRITA: depois de abrir o
-- intervalo, só cabe fechá-lo. Serve para o funcionário não errar.
--
-- Esta aqui valida uma CORREÇÃO, que entra no meio do dia e costuma ser feita
-- em duas etapas — primeiro o início do intervalo, depois o fim. Ser estrita
-- aqui impediria o gestor de trabalhar: no meio do caminho o dia fica
-- incompleto, e incompleto não é impossível.
--
-- Então proíbe só o que não pode existir: duas entradas sem saída no meio,
-- dois intervalos abertos, fim sem início, saída sem entrada. Um dia que
-- termina com o intervalo aberto passa — e o relatório da Sprint 7 sinaliza.
create or replace function public.day_sequence_is_valid(
  p_membership_id uuid,
  p_work_date     date
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_no_turno     boolean := false;
  v_no_intervalo boolean := false;
  r              record;
begin
  for r in
    select p.type
    from public.punches p
    where p.membership_id = p_membership_id
      and p.work_date = p_work_date
      and not p.voided
      and not exists (select 1 from public.punches s where s.replaces_punch_id = p.id)
    order by p.punched_at, p.created_at
  loop
    case r.type
      when 'entrada' then
        if v_no_turno then return false; end if;
        v_no_turno := true;

      when 'saida' then
        if not v_no_turno then return false; end if;
        v_no_turno := false;
        v_no_intervalo := false;   -- sair fecha o intervalo esquecido aberto

      when 'intervalo_inicio' then
        if not v_no_turno or v_no_intervalo then return false; end if;
        v_no_intervalo := true;

      when 'intervalo_fim' then
        if not v_no_intervalo then return false; end if;
        v_no_intervalo := false;
    end case;
  end loop;

  return true;
end;
$$;

-- ------------------------------------------------------------
-- Corrigir o horário de uma batida
-- ------------------------------------------------------------
create or replace function public.adjust_punch(
  p_punch_id      uuid,
  p_punched_at    timestamptz,
  p_justification text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_p    public.punches%rowtype;
  v_tz   text;
  v_dia  date;
  v_novo uuid;
begin
  select * into v_p from public.punches where id = p_punch_id;
  if not found then
    raise exception 'Batida não encontrada' using errcode = 'no_data_found';
  end if;

  if public.auth_role(v_p.company_id) not in ('dono','gerente') then
    raise exception 'Só quem administra corrige ponto'
      using errcode = 'insufficient_privilege';
  end if;

  if p_justification is null or length(btrim(p_justification)) < 3 then
    raise exception 'A correção exige justificativa' using errcode = 'check_violation';
  end if;

  if exists (select 1 from public.punches s where s.replaces_punch_id = p_punch_id) then
    raise exception 'Esta batida já foi corrigida. Corrija a versão mais recente.'
      using errcode = 'check_violation';
  end if;

  select timezone into v_tz from public.companies where id = v_p.company_id;
  v_dia := (p_punched_at at time zone v_tz)::date;

  -- Ajuste manual não tem prova de local: `verified` fica falso e a distância
  -- some. Fingir que foi verificado seria pior que a lacuna.
  insert into public.punches
    (company_id, membership_id, location_id, type, punched_at, work_date,
     origin, verified, replaces_punch_id, justification, created_by, selfie_path)
  values
    (v_p.company_id, v_p.membership_id, v_p.location_id, v_p.type, p_punched_at,
     v_dia, 'ajuste_manual', false, p_punch_id, btrim(p_justification), v_uid,
     v_p.selfie_path)
  returning id into v_novo;

  if not public.day_sequence_is_valid(v_p.membership_id, v_dia) then
    raise exception 'Com esse horário a sequência do dia fica inválida'
      using errcode = 'check_violation';
  end if;

  insert into public.audit_log (company_id, actor, action, target, meta)
  values (v_p.company_id, v_uid, 'punch.adjust', v_novo::text,
          jsonb_build_object('substitui', p_punch_id,
                             'de', v_p.punched_at, 'para', p_punched_at,
                             'motivo', btrim(p_justification)));

  return v_novo;
end;
$$;

-- ------------------------------------------------------------
-- Anular uma batida indevida
-- ------------------------------------------------------------
create or replace function public.void_punch(
  p_punch_id      uuid,
  p_justification text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_p    public.punches%rowtype;
  v_novo uuid;
begin
  select * into v_p from public.punches where id = p_punch_id;
  if not found then
    raise exception 'Batida não encontrada' using errcode = 'no_data_found';
  end if;

  if public.auth_role(v_p.company_id) not in ('dono','gerente') then
    raise exception 'Só quem administra anula ponto'
      using errcode = 'insufficient_privilege';
  end if;

  if p_justification is null or length(btrim(p_justification)) < 3 then
    raise exception 'A anulação exige justificativa' using errcode = 'check_violation';
  end if;

  if exists (select 1 from public.punches s where s.replaces_punch_id = p_punch_id) then
    raise exception 'Esta batida já foi corrigida ou anulada'
      using errcode = 'check_violation';
  end if;

  -- O registro de anulação substitui o original E é ele mesmo anulado: some
  -- dos efetivos sem que nada seja apagado.
  insert into public.punches
    (company_id, membership_id, location_id, type, punched_at, work_date,
     origin, verified, voided, replaces_punch_id, justification, created_by)
  values
    (v_p.company_id, v_p.membership_id, v_p.location_id, v_p.type, v_p.punched_at,
     v_p.work_date, 'ajuste_manual', false, true, p_punch_id,
     btrim(p_justification), v_uid)
  returning id into v_novo;

  insert into public.audit_log (company_id, actor, action, target, meta)
  values (v_p.company_id, v_uid, 'punch.void', v_novo::text,
          jsonb_build_object('anula', p_punch_id, 'tipo', v_p.type,
                             'horario', v_p.punched_at,
                             'motivo', btrim(p_justification)));

  return v_novo;
end;
$$;

-- ------------------------------------------------------------
-- Incluir uma batida que faltou
-- ------------------------------------------------------------
create or replace function public.add_missing_punch(
  p_membership_id uuid,
  p_type          public.punch_type,
  p_punched_at    timestamptz,
  p_justification text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_m    public.memberships%rowtype;
  v_tz   text;
  v_dia  date;
  v_loc  uuid;
  v_novo uuid;
begin
  select * into v_m from public.memberships where id = p_membership_id;
  if not found then
    raise exception 'Membro não encontrado' using errcode = 'no_data_found';
  end if;

  if public.auth_role(v_m.company_id) not in ('dono','gerente') then
    raise exception 'Só quem administra inclui ponto'
      using errcode = 'insufficient_privilege';
  end if;

  if p_justification is null or length(btrim(p_justification)) < 3 then
    raise exception 'A inclusão exige justificativa' using errcode = 'check_violation';
  end if;

  if p_punched_at > now() then
    raise exception 'Não dá para registrar ponto no futuro' using errcode = 'check_violation';
  end if;

  select timezone into v_tz from public.companies where id = v_m.company_id;
  v_dia := (p_punched_at at time zone v_tz)::date;

  select l.id into v_loc
  from public.resolved_schedule(v_m.company_id, v_dia, v_dia) r
  join public.locations l on l.id = r.location_id
  where r.membership_id = p_membership_id
  limit 1;

  insert into public.punches
    (company_id, membership_id, location_id, type, punched_at, work_date,
     origin, verified, justification, created_by)
  values
    (v_m.company_id, p_membership_id, v_loc, p_type, p_punched_at, v_dia,
     'ajuste_manual', false, btrim(p_justification), v_uid)
  returning id into v_novo;

  -- A inclusão entra NO MEIO do dia, então a checagem é sobre o resultado.
  if not public.day_sequence_is_valid(p_membership_id, v_dia) then
    raise exception 'Essa batida deixaria a sequência do dia inválida'
      using errcode = 'check_violation';
  end if;

  insert into public.audit_log (company_id, actor, action, target, meta)
  values (v_m.company_id, v_uid, 'punch.add_missing', v_novo::text,
          jsonb_build_object('nome', v_m.full_name, 'tipo', p_type,
                             'horario', p_punched_at,
                             'motivo', btrim(p_justification)));

  return v_novo;
end;
$$;

revoke all on function public.adjust_punch(uuid, timestamptz, text) from public, anon;
revoke all on function public.void_punch(uuid, text) from public, anon;
revoke all on function public.add_missing_punch(uuid, public.punch_type, timestamptz, text) from public, anon;
revoke all on function public.day_sequence_is_valid(uuid, date) from public, anon;

grant execute on function public.adjust_punch(uuid, timestamptz, text) to authenticated;
grant execute on function public.void_punch(uuid, text) to authenticated;
grant execute on function public.add_missing_punch(uuid, public.punch_type, timestamptz, text) to authenticated;
grant execute on function public.day_sequence_is_valid(uuid, date) to authenticated;

-- ------------------------------------------------------------
-- Histórico de uma batida
-- ------------------------------------------------------------
-- "O que era, o que virou, quem mudou, por quê." Sem isso a imutabilidade
-- guarda o dado mas não conta a história.
create or replace function public.punch_history(p_punch_id uuid)
returns table (
  id            uuid,
  type          public.punch_type,
  punched_at    timestamptz,
  origin        public.punch_origin,
  voided        boolean,
  justification text,
  autor         text,
  registrado_em timestamptz,
  efetivo       boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with recursive cadeia as (
    -- Sobe até a batida original.
    select p.* from public.punches p where p.id = p_punch_id
    union
    select ant.* from public.punches ant
    join cadeia c on c.replaces_punch_id = ant.id
  ),
  completa as (
    select * from cadeia
    union
    -- E desce por quem substituiu.
    select p.* from public.punches p
    join cadeia c on p.replaces_punch_id = c.id
  )
  select c.id, c.type, c.punched_at, c.origin, c.voided, c.justification,
         coalesce(m.full_name, u.email::text) as autor,
         c.created_at,
         (not c.voided
          and not exists (select 1 from public.punches s where s.replaces_punch_id = c.id))
  from completa c
  left join auth.users u on u.id = c.created_by
  left join public.memberships m
    on m.user_id = c.created_by and m.company_id = c.company_id
  where c.company_id in (select public.auth_company_ids())
    and public.auth_role(c.company_id) in ('dono','gerente')
  order by c.created_at;
$$;

revoke all on function public.punch_history(uuid) from public, anon;
grant execute on function public.punch_history(uuid) to authenticated;

-- ============================================================
-- SOLICITAÇÃO DO FUNCIONÁRIO
-- ============================================================
-- O funcionário não corrige o próprio ponto — isso esvaziaria o controle.
-- Mas é ele quem sabe que esqueceu de bater, então pede.
create type public.request_kind   as enum ('inclusao','ajuste','anulacao');
create type public.request_status as enum ('pendente','aprovada','recusada');

create table public.punch_requests (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  membership_id  uuid not null references public.memberships(id) on delete cascade,
  kind           public.request_kind not null,
  punch_id       uuid references public.punches(id),
  requested_type public.punch_type,
  requested_at   timestamptz,
  reason         text not null check (length(btrim(reason)) >= 3),
  status         public.request_status not null default 'pendente',
  decided_by     uuid references auth.users(id),
  decided_at     timestamptz,
  decision_note  text,
  created_at     timestamptz not null default clock_timestamp(),

  -- Inclusão precisa de tipo e horário; ajuste e anulação precisam da batida.
  constraint request_campos_coerentes check (
    (kind = 'inclusao'  and punch_id is null
                        and requested_type is not null and requested_at is not null)
    or (kind = 'ajuste' and punch_id is not null and requested_at is not null)
    or (kind = 'anulacao' and punch_id is not null)
  )
);
create index punch_requests_company_idx on public.punch_requests (company_id, status);
create index punch_requests_membership_idx on public.punch_requests (membership_id);

alter table public.punch_requests enable row level security;
alter table public.punch_requests force row level security;

create policy requests_select on public.punch_requests
  for select to authenticated
  using (
    company_id in (select public.auth_company_ids())
    and (public.auth_role(company_id) in ('dono','gerente')
         or membership_id in (select public.auth_membership_ids()))
  );

-- O funcionário abre pedido só para si mesmo.
create policy requests_insert on public.punch_requests
  for insert to authenticated
  with check (
    company_id in (select public.auth_company_ids())
    and membership_id in (select public.auth_membership_ids())
    and status = 'pendente'
  );

revoke all on public.punch_requests from anon;
grant select, insert on public.punch_requests to authenticated;

-- Decidir é ato de gestão, e aplicar a correção junto evita que o gestor
-- aprove e esqueça de executar.
create or replace function public.decide_punch_request(
  p_request_id uuid,
  p_aprovar    boolean,
  p_nota       text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_r   public.punch_requests%rowtype;
  v_novo uuid;
  v_motivo text;
begin
  select * into v_r from public.punch_requests where id = p_request_id;
  if not found then
    raise exception 'Solicitação não encontrada' using errcode = 'no_data_found';
  end if;

  if public.auth_role(v_r.company_id) not in ('dono','gerente') then
    raise exception 'Só quem administra decide solicitação'
      using errcode = 'insufficient_privilege';
  end if;

  if v_r.status <> 'pendente' then
    raise exception 'Esta solicitação já foi decidida' using errcode = 'check_violation';
  end if;

  update public.punch_requests
     set status = (case when p_aprovar then 'aprovada' else 'recusada' end)::public.request_status,
         decided_by = v_uid,
         decided_at = clock_timestamp(),
         decision_note = nullif(btrim(p_nota), '')
   where id = p_request_id;

  if not p_aprovar then
    insert into public.audit_log (company_id, actor, action, target, meta)
    values (v_r.company_id, v_uid, 'punch_request.reject', p_request_id::text,
            jsonb_build_object('motivo_pedido', v_r.reason, 'nota', p_nota));
    return null;
  end if;

  v_motivo := 'Pedido do funcionário: ' || v_r.reason;

  if v_r.kind = 'inclusao' then
    v_novo := public.add_missing_punch(v_r.membership_id, v_r.requested_type,
                                       v_r.requested_at, v_motivo);
  elsif v_r.kind = 'ajuste' then
    v_novo := public.adjust_punch(v_r.punch_id, v_r.requested_at, v_motivo);
  else
    v_novo := public.void_punch(v_r.punch_id, v_motivo);
  end if;

  insert into public.audit_log (company_id, actor, action, target, meta)
  values (v_r.company_id, v_uid, 'punch_request.approve', p_request_id::text,
          jsonb_build_object('tipo', v_r.kind, 'punch_novo', v_novo));

  return v_novo;
end;
$$;

revoke all on function public.decide_punch_request(uuid, boolean, text) from public, anon;
grant execute on function public.decide_punch_request(uuid, boolean, text) to authenticated;
