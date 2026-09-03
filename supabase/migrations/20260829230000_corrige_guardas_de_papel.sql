-- ============================================================
-- FALHA DE SEGURANÇA: guarda de papel não barrava quem não é membro
--
-- `auth_role()` devolve NULL para quem não pertence à empresa. E em SQL,
-- `NULL <> 'dono'` e `NULL not in ('dono','gerente')` avaliam como NULL —
-- não como verdadeiro. O `if` nunca disparava, e a função seguia em frente.
--
-- Como essas funções são `security definer` (ignoram RLS de propósito), a
-- guarda era a ÚNICA barreira. Resultado, medido: um usuário de outra
-- empresa chamou export_company_data() com o id da Padaria e recebeu 6
-- membros e 341 batidas de ponto.
--
-- As 15 guardas do sistema tinham o mesmo defeito. A correção é uma função
-- que responde em booleano e nunca devolve NULL — o tipo de coisa que não dá
-- para errar por engano.
--
-- Encontrado pela bateria de verificação de ponta a ponta, não pelos testes
-- de banco: os testes pgTAP sempre rodavam como alguém DE dentro da empresa.
-- ============================================================

create or replace function public.is_manager(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select coalesce(public.auth_role(p_company_id) in ('dono','gerente'), false);
$fn$;

create or replace function public.is_owner(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select coalesce(public.auth_role(p_company_id) = 'dono', false);
$fn$;

revoke all on function public.is_manager(uuid) from public, anon;
revoke all on function public.is_owner(uuid) from public, anon;
grant execute on function public.is_manager(uuid) to authenticated, service_role;
grant execute on function public.is_owner(uuid) to authenticated, service_role;

-- ------------------------------------------------------------
-- expire_stale_invitations
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expire_stale_invitations(p_company_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_n integer;
begin
  if not public.is_manager(p_company_id) then
    raise exception 'Sem permissão' using errcode = 'insufficient_privilege';
  end if;

  update public.invitations
     set status = 'expirado'
   where company_id = p_company_id
     and status = 'pendente'
     and expires_at <= now();

  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;

-- ------------------------------------------------------------
-- update_company
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_company(p_company_id uuid, p_name text, p_timezone text, p_cnpj text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_old public.companies%rowtype;
begin
  if not public.is_owner(p_company_id) then
    raise exception 'Só o dono altera a configuração da empresa'
      using errcode = 'insufficient_privilege';
  end if;

  if p_name is null or length(btrim(p_name)) = 0 then
    raise exception 'Nome da empresa é obrigatório' using errcode = 'check_violation';
  end if;

  if not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'Fuso horário inválido: %', p_timezone using errcode = 'check_violation';
  end if;

  select * into v_old from public.companies where id = p_company_id;

  update public.companies
     set name = btrim(p_name),
         timezone = p_timezone,
         cnpj = nullif(btrim(p_cnpj), '')
   where id = p_company_id;

  insert into public.audit_log (company_id, actor, action, target, meta)
  values (p_company_id, v_uid, 'company.update', p_company_id::text,
          jsonb_build_object('nome_antes', v_old.name, 'nome_depois', btrim(p_name),
                             'fuso_antes', v_old.timezone, 'fuso_depois', p_timezone));
end;
$function$;

-- ------------------------------------------------------------
-- set_day_shift
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_day_shift(p_membership_id uuid, p_date date, p_shift_key text DEFAULT NULL::text, p_location_id uuid DEFAULT NULL::uuid, p_limpar boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_company uuid;
  v_nome    text;
  v_antes   text;
begin
  select company_id, full_name into v_company, v_nome
  from public.memberships where id = p_membership_id;

  if v_company is null then
    raise exception 'Membro não encontrado' using errcode = 'no_data_found';
  end if;

  if not public.is_manager(v_company) then
    raise exception 'Você não pode alterar a escala'
      using errcode = 'insufficient_privilege';
  end if;

  select shift_key into v_antes
  from public.schedule_entries
  where membership_id = p_membership_id and work_date = p_date;

  if p_limpar then
    delete from public.schedule_entries
     where membership_id = p_membership_id and work_date = p_date;
  else
    insert into public.schedule_entries
      (company_id, membership_id, work_date, shift_key, location_id, created_by)
    values (v_company, p_membership_id, p_date, p_shift_key, p_location_id, auth.uid())
    on conflict (membership_id, work_date) where work_date is not null
    do update set shift_key   = excluded.shift_key,
                  location_id = excluded.location_id,
                  created_by  = excluded.created_by,
                  created_at  = now();
  end if;

  insert into public.audit_log (company_id, actor, action, target, meta)
  values (v_company, auth.uid(), 'schedule.set_day', p_membership_id::text,
          jsonb_build_object('nome', v_nome, 'data', p_date,
                             'de', v_antes,
                             'para', case when p_limpar then 'segue a fixa'
                                          else coalesce(p_shift_key, 'folga') end));
end;
$function$;

-- ------------------------------------------------------------
-- set_weekday_shift
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_weekday_shift(p_membership_id uuid, p_weekday smallint, p_shift_key text DEFAULT NULL::text, p_location_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_company uuid;
  v_nome    text;
  v_antes   text;
begin
  select company_id, full_name into v_company, v_nome
  from public.memberships where id = p_membership_id;

  if v_company is null then
    raise exception 'Membro não encontrado' using errcode = 'no_data_found';
  end if;

  if not public.is_manager(v_company) then
    raise exception 'Você não pode alterar a escala'
      using errcode = 'insufficient_privilege';
  end if;

  select shift_key into v_antes
  from public.schedule_entries
  where membership_id = p_membership_id and weekday = p_weekday;

  if p_shift_key is null then
    delete from public.schedule_entries
     where membership_id = p_membership_id and weekday = p_weekday;
  else
    insert into public.schedule_entries
      (company_id, membership_id, weekday, shift_key, location_id, created_by)
    values (v_company, p_membership_id, p_weekday, p_shift_key, p_location_id, auth.uid())
    on conflict (membership_id, weekday) where weekday is not null
    do update set shift_key   = excluded.shift_key,
                  location_id = excluded.location_id,
                  created_by  = excluded.created_by,
                  created_at  = now();
  end if;

  insert into public.audit_log (company_id, actor, action, target, meta)
  values (v_company, auth.uid(), 'schedule.set_weekday', p_membership_id::text,
          jsonb_build_object('nome', v_nome, 'weekday', p_weekday,
                             'de', v_antes,
                             'para', coalesce(p_shift_key, 'sem turno')));
end;
$function$;

-- ------------------------------------------------------------
-- copy_week
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.copy_week(p_company_id uuid, p_origem date, p_destino date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_n integer := 0;
begin
  if not public.is_manager(p_company_id) then
    raise exception 'Você não pode alterar a escala'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.schedule_entries
    (company_id, membership_id, work_date, shift_key, location_id, created_by)
  select p_company_id, r.membership_id,
         p_destino + (r.work_date - p_origem),
         r.shift_key, r.location_id, auth.uid()
  from public.resolved_schedule(p_company_id, p_origem, p_origem + 6) r
  where r.origem in ('avulsa','folga')
  on conflict (membership_id, work_date) where work_date is not null
  do update set shift_key   = excluded.shift_key,
                location_id = excluded.location_id,
                created_by  = excluded.created_by;

  get diagnostics v_n = row_count;

  insert into public.audit_log (company_id, actor, action, target, meta)
  values (p_company_id, auth.uid(), 'schedule.copy_week', p_destino::text,
          jsonb_build_object('origem', p_origem, 'destino', p_destino, 'linhas', v_n));

  return v_n;
end;
$function$;

-- ------------------------------------------------------------
-- adjust_punch
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.adjust_punch(p_punch_id uuid, p_punched_at timestamp with time zone, p_justification text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  if not public.is_manager(v_p.company_id) then
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
$function$;

-- ------------------------------------------------------------
-- void_punch
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.void_punch(p_punch_id uuid, p_justification text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid  uuid := auth.uid();
  v_p    public.punches%rowtype;
  v_novo uuid;
begin
  select * into v_p from public.punches where id = p_punch_id;
  if not found then
    raise exception 'Batida não encontrada' using errcode = 'no_data_found';
  end if;

  if not public.is_manager(v_p.company_id) then
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
$function$;

-- ------------------------------------------------------------
-- add_missing_punch
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_missing_punch(p_membership_id uuid, p_type punch_type, p_punched_at timestamp with time zone, p_justification text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  if not public.is_manager(v_m.company_id) then
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
$function$;

-- ------------------------------------------------------------
-- decide_punch_request
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.decide_punch_request(p_request_id uuid, p_aprovar boolean, p_nota text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  if not public.is_manager(v_r.company_id) then
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
$function$;

-- ------------------------------------------------------------
-- queue_schedule_notices
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.queue_schedule_notices(p_company_id uuid, p_desde timestamp with time zone DEFAULT (now() - '1 day'::interval))
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_n integer := 0;
  v_empresa text;
  r record;
begin
  if not public.is_manager(p_company_id) then
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
$function$;

-- ------------------------------------------------------------
-- export_company_data
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.export_company_data(p_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_dados jsonb;
begin
  if not public.is_owner(p_company_id) then
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
$function$;

-- ------------------------------------------------------------
-- delete_company
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_company(p_company_id uuid, p_confirmacao text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_nome text;
begin
  if not public.is_owner(p_company_id) then
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
$function$;

-- ------------------------------------------------------------
-- bulk_invite
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bulk_invite(p_company_id uuid, p_pessoas jsonb)
 RETURNS TABLE(email text, resultado text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  r        jsonb;
  v_email  text;
  v_nome   text;
  v_papel  public.app_role;
begin
  if not public.is_manager(p_company_id) then
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
$function$;
