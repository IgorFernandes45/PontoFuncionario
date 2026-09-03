-- ============================================================
-- Sprint 4 — Visões da escala
--
-- Horas previstas viram número num lugar só. Se cada tela somasse por conta,
-- o total do gestor e o do funcionário divergiriam — e o relatório da Sprint
-- 7 seria um terceiro número diferente.
-- ============================================================

-- ------------------------------------------------------------
-- Resumo por pessoa num período
-- ------------------------------------------------------------
create or replace function public.schedule_summary(
  p_company_id uuid,
  p_from       date,
  p_to         date
)
returns table (
  membership_id     uuid,
  full_name         text,
  dias_com_turno    integer,
  dias_de_folga     integer,
  minutos_previstos integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    r.membership_id,
    r.full_name,
    count(*) filter (where r.origem <> 'folga')::integer,
    count(*) filter (where r.origem = 'folga')::integer,
    -- Previsto é LÍQUIDO: a jornada menos o intervalo. Mostrar bruto faria a
    -- conta bater com o relógio e não com a folha.
    coalesce(sum(
      public.shift_duration_minutes(r.start_time, r.end_time) - r.break_minutes
    ) filter (where r.origem <> 'folga'), 0)::integer
  from public.resolved_schedule(p_company_id, p_from, p_to) r
  group by r.membership_id, r.full_name
  order by r.full_name;
$$;

revoke all on function public.schedule_summary(uuid, date, date) from public, anon;
grant execute on function public.schedule_summary(uuid, date, date) to authenticated;

-- ------------------------------------------------------------
-- Quando a escala de alguém mudou pela última vez
-- ------------------------------------------------------------
-- O funcionário precisa saber que mudou. Sem canal de e-mail configurado, o
-- mínimo é a própria tela dizer quando foi a última alteração.
create or replace function public.my_schedule_updated_at()
returns timestamptz
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select max(e.created_at)
  from public.schedule_entries e
  join public.memberships m on m.id = e.membership_id
  where m.user_id = auth.uid() and m.status = 'ativo';
$$;

revoke all on function public.my_schedule_updated_at() from public, anon;
grant execute on function public.my_schedule_updated_at() to authenticated;

-- ------------------------------------------------------------
-- Auditoria das mudanças de escala
-- ------------------------------------------------------------
-- set_day_shift e set_weekday_shift gravavam sem deixar rastro. Escala é
-- decisão sobre a jornada de alguém: precisa de autor e momento, como todo o
-- resto do sistema.
create or replace function public.set_day_shift(
  p_membership_id uuid,
  p_date          date,
  p_shift_key     text default null,
  p_location_id   uuid default null,
  p_limpar        boolean default false
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;

create or replace function public.set_weekday_shift(
  p_membership_id uuid,
  p_weekday       smallint,
  p_shift_key     text default null,
  p_location_id   uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;

revoke all on function public.set_day_shift(uuid, date, text, uuid, boolean) from public, anon;
revoke all on function public.set_weekday_shift(uuid, smallint, text, uuid) from public, anon;
grant execute on function public.set_day_shift(uuid, date, text, uuid, boolean) to authenticated;
grant execute on function public.set_weekday_shift(uuid, smallint, text, uuid) to authenticated;

-- ------------------------------------------------------------
-- Cobertura por dia — a pergunta do gestor na visão mensal
-- ------------------------------------------------------------
-- "Quantas pessoas trabalham em cada dia, em cada turno?" Agregar no banco
-- evita mandar o mês inteiro linha a linha para o navegador.
create or replace function public.schedule_coverage(
  p_company_id uuid,
  p_from       date,
  p_to         date
)
returns table (
  work_date   date,
  shift_key   text,
  shift_label text,
  color       text,
  pessoas     integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.work_date, r.shift_key, r.shift_label, r.color, count(*)::integer
  from public.resolved_schedule(p_company_id, p_from, p_to) r
  where r.origem <> 'folga'
  group by r.work_date, r.shift_key, r.shift_label, r.color, r.start_time
  order by r.work_date, r.start_time;
$$;

revoke all on function public.schedule_coverage(uuid, date, date) from public, anon;
grant execute on function public.schedule_coverage(uuid, date, date) to authenticated;

-- ------------------------------------------------------------
-- Ordem cronológica confiável na auditoria
-- ------------------------------------------------------------
-- `now()` devolve o instante em que a TRANSAÇÃO começou, igual para todas as
-- linhas gravadas nela. Duas ações auditadas na mesma transação ficavam com o
-- mesmo horário, e a ordem virava indeterminada — num log de auditoria isso
-- é defeito. `clock_timestamp()` marca o instante real de cada linha.
alter table public.audit_log
  alter column created_at set default clock_timestamp();
