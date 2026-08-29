# PontoEscala — Plano Técnico & Roadmap

> SaaS multi-tenant de gestão de escala e ponto eletrônico.
> Stack: **Next.js (App Router) + Supabase (Postgres, Auth, RLS, Storage, Edge Functions)**.
> Documento de referência para desenvolvimento incremental por sprints.
>
> **Revisão 2** — reescrita depois das Sprints 0 e 1 entregues. O que a
> implementação ensinou está incorporado, e as sprints seguintes foram
> reestruturadas para cobrir buracos que a revisão 1 deixava.

---

## 0. O que mudou nesta revisão

A revisão 1 estava certa na arquitetura e na ordem geral. Construir as duas
primeiras sprints revelou seis lacunas, todas de escopo — não de desenho:

| Lacuna | Por que importa | Onde entra agora |
| --- | --- | --- |
| **Correção de ponto** não existia | Funcionário esquece de bater toda semana. Sem correção, todo relatório nasce errado. E como `punches` é imutável, corrigir exige modelagem própria. | Sprint 6, com o DDL de correção |
| **Ausências justificadas** não existiam | "Falta = escala sem ponto" trata atestado, férias e falta do mesmo jeito | Sprint 6, tabela `absences` |
| **Intervalo** não era modelado | `punch_type` previa intervalo, mas `shift_templates` não. Sem isso não há hora líquida nem checagem de intervalo mínimo | Sprint 2, `break_minutes` |
| **Editar membro** não estava em sprint nenhuma | A Sprint 1 lista e convida; promover, desativar e remover ficavam órfãos | Sprint 2 |
| **`locations` só na Sprint 4** | `schedule_entries.location_id` existe desde a escala. Montar escala sem saber a unidade seria retrabalho | Antecipado para a Sprint 2 |
| **Sem piloto antes de IA e billing** | O plano só colocava cliente real na Sprint 7 | Sprint 8, antes do agente |

Além disso, três decisões de produto foram tomadas e passam a valer como
premissa (ver §8 e §9):

1. **Conformidade é de gestão, não de REP-P.** O sistema não se apresenta como
   registro eletrônico de ponto homologado. Mas o modelo de dados já nasce
   compatível, para que virar REP-P um dia não exija refazer o banco.
2. **Jornada é turno fixo com intervalo.** Escalas cíclicas (12x36, 5x1) e
   jornada por carga horária ficam no backlog, nomeadas, com o custo de adiar
   explicitado.
3. **Piloto gratuito logo depois do ponto funcionar**, antes de investir em
   agente de IA e cobrança.

---

## 1. Visão do produto

Sistema online onde cada empresa (tenant) gerencia sua equipe: convida
funcionários por e-mail, monta escalas (fixa semanal e por data), acompanha o
ponto batido pelo celular com verificação de localização, gera relatórios e
conta com um agente de IA que monta escalas por linguagem natural.

**Papéis:**

- **Dono** — acesso total: configura empresa, regras de ponto, planos, todos os
  relatórios. Só ele concede ou remove os papéis de dono e gerente.
- **Gerente** — monta escala, gerencia funcionários e vê relatórios. Não mexe em
  faturamento, nem em configuração crítica, nem no papel de ninguém acima dele.
- **Funcionário** — vê a própria escala, bate ponto, consulta o próprio
  histórico.

**Princípio central:** multi-tenant desde o dia 1. Todo dado carrega
`company_id` e o isolamento é garantido no banco via Row-Level Security, não
só na aplicação.

**Princípio que a Sprint 0 acrescentou:** privilégio tem teto, e o teto vale em
todo caminho. Não basta impedir o gerente de se promover — é preciso impedir
que ele convide alguém como dono, que edite um dono, que se promova pela API.
Cada caminho novo para mexer em papel precisa passar pela mesma função.

---

## 2. Arquitetura

```
┌──────────────────────────────────────────────────────────┐
│                     CLIENTE (browser / PWA)               │
│   Next.js App Router · React · Tailwind                   │
│   - Área do dono/gerente (painel, escala, relatórios)     │
│   - Área do funcionário (escala, ponto, histórico)        │
│   - PWA p/ ponto pelo celular (geolocation + fila local)  │
└───────────────┬──────────────────────────┬───────────────┘
                │ supabase-js (RLS)         │ server actions / rotas
                ▼                           ▼
┌──────────────────────────┐   ┌───────────────────────────┐
│   SUPABASE                │   │  NEXT.JS SERVER (Vercel)  │
│  - Postgres + RLS         │   │  - src/proxy.ts (sessão)  │
│  - Auth (magic link/OTP)  │   │  - Agente IA (API Claude) │
│  - Storage (selfies)      │◄──┤  - Validação de ponto     │
│  - RPCs security definer  │   │  - Webhooks/CRON          │
└──────────────────────────┘   └───────────────────────────┘
```

**Decisões-chave, com o que a implementação confirmou ou corrigiu:**

- **Auth por magic link / OTP.** Confirmado. Simplifica onboarding e reduz
  superfície de ataque.
- **RLS filtra tudo por `company_id`.** Confirmado, com dois acréscimos que a
  Sprint 0 mostrou necessários: `force row level security` (sem ele, uma query
  rodando como dono da tabela escapa das policies) e `revoke ... from anon`
  (RLS filtra linhas, mas o `GRANT` decide se a tabela é alcançável).
- **RPC `security definer` para o que RLS não consegue expressar.** Padrão que
  emergiu na prática: criar empresa (o usuário ainda não é membro de nada),
  ver e aceitar convite (idem), listar equipe com e-mail (`auth.users` não é
  alcançável pelo client). Sempre com `set search_path = public, pg_temp`.
- **Agente IA roda no servidor**, nunca expõe a API key ao browser.
- **Selfies** em bucket privado do Storage, com URL assinada de curta duração.
- **Validação de ponto no servidor.** O cliente envia coordenadas; quem decide
  se está dentro do raio é o servidor. Reforço da revisão 2: o cliente **não
  tem INSERT em `punches`**. A rota grava com `service_role`, já verificado, em
  escrita única — em vez de inserir cru e atualizar depois, que violaria a
  imutabilidade.
- **Next 16 chama de `proxy` o antigo `middleware`.** O arquivo é
  `src/proxy.ts`.

---

## 3. Modelo de dados

### 3.1 Diagrama de entidades

```
companies ──┬── memberships ──┬── auth.users
            │                 ├── schedule_entries
            │                 ├── punches
            │                 └── absences
            ├── invitations
            ├── locations ──── location_wifi
            ├── shift_templates
            ├── schedules ──── schedule_entries
            └── audit_log
```

### 3.2 Implantado (Sprints 0 e 1)

Já em produção no banco, com testes. Resumo — o DDL completo vive em
`supabase/migrations/`:

- **`companies`** — tenant raiz. `timezone` não é decorativo: todo cálculo de
  atraso e falta converte por ele.
- **`memberships`** — o coração do multi-tenant. Papel por empresa, não global.
  Protegida por `protect_last_owner()`: a empresa nunca fica sem dono ativo.
- **`invitations`** — token de 24 bytes, prazo de 7 dias, um pendente por
  e-mail por empresa.
- **`audit_log`** — append-only via `deny_mutation()`, com uma exceção
  deliberada: delete em cascata de `companies` passa, para que apagar a conta
  continue possível (LGPD, art. 18).

Funções de apoio já existentes: `auth_company_ids()`, `auth_role()`,
`auth_membership_ids()`, `can_manage_member()`, `create_company_with_owner()`,
`my_workspaces()`, `accept_invitation()`, `invitation_preview()`,
`my_pending_invitations()`, `company_members()`,
`expire_stale_invitations()`.

### 3.3 Planejado

O DDL abaixo é o alvo das próximas sprints. Cada tabela entra na sprint que a
usa — nunca antes.

```sql
-- ============ SPRINT 2: UNIDADES ============
create type punch_method as enum ('gps','wifi','ambos');

create table locations (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id) on delete cascade,
  name           text not null,
  lat            double precision,
  lng            double precision,
  radius_m       integer not null default 120 check (radius_m between 20 and 2000),
  method         punch_method not null default 'gps',
  require_selfie boolean not null default false,
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);
create index on locations (company_id);

-- SSIDs permitidos por unidade. Tabela criada na Sprint 2, usada só na 11:
-- ler SSID no navegador é bloqueado por iOS e Android.
create table location_wifi (
  id          uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id) on delete cascade,
  ssid        text not null,
  bssid       text
);

-- ============ SPRINT 2: TURNOS ============
create table shift_templates (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  key           text not null,
  label         text not null,
  start_time    time not null,
  end_time      time not null,
  -- Intervalo PREVISTO. Sem isto não há hora líquida nem como checar o
  -- intervalo mínimo. A revisão 1 esquecia disto.
  break_minutes integer not null default 0 check (break_minutes >= 0),
  color         text not null default '#2f5bff',
  active        boolean not null default true,
  unique (company_id, key)
);
create index on shift_templates (company_id);

-- ============ SPRINT 3: ESCALAS ============
create type schedule_kind as enum ('fixa','avulsa');

create table schedules (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  kind        schedule_kind not null default 'avulsa',
  name        text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table schedule_entries (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  schedule_id   uuid references schedules(id) on delete set null,
  membership_id uuid not null references memberships(id) on delete cascade,
  location_id   uuid references locations(id),
  shift_key     text not null,
  work_date     date,       -- avulsa
  weekday       smallint check (weekday between 0 and 6),  -- fixa
  created_at    timestamptz not null default now(),
  -- Exatamente um dos dois, nunca os dois nem nenhum.
  check (num_nonnulls(work_date, weekday) = 1),
  -- FK composta: escala não pode apontar para turno inexistente ou de outra
  -- empresa. A revisão 1 deixava `shift_key` como texto solto.
  foreign key (company_id, shift_key)
    references shift_templates (company_id, key) on update cascade
);
create index on schedule_entries (company_id, work_date);
create index on schedule_entries (membership_id);
-- Um funcionário não pode ter dois turnos no mesmo dia na mesma escala.
create unique index on schedule_entries (membership_id, work_date)
  where work_date is not null;
create unique index on schedule_entries (membership_id, weekday)
  where weekday is not null;

-- ============ SPRINT 5: PONTO ============
create type punch_type as enum ('entrada','saida','intervalo_inicio','intervalo_fim');
create type punch_origin as enum ('app','ajuste_manual','importacao');

create table punches (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  membership_id uuid not null references memberships(id) on delete cascade,
  location_id   uuid references locations(id),
  type          punch_type not null,
  punched_at    timestamptz not null,
  origin        punch_origin not null default 'app',
  lat           double precision,
  lng           double precision,
  accuracy_m    integer,          -- precisão informada pelo GPS
  distance_m    integer,          -- calculado no servidor
  wifi_ssid     text,
  verified      boolean not null default false,
  verify_method punch_method,
  selfie_path   text,
  -- Sprint 6: correção. Nunca UPDATE — a correção é um registro NOVO que
  -- aponta para o que substitui. O registro efetivo é o que ninguém
  -- substituiu.
  replaces_punch_id uuid references punches(id),
  voided        boolean not null default false,
  justification text,
  created_by    uuid references auth.users(id),  -- gestor, no ajuste manual
  created_at    timestamptz not null default now(),
  -- Ajuste manual exige justificativa e autor. Regra no banco, não na tela.
  check (origin <> 'ajuste_manual'
         or (justification is not null and length(btrim(justification)) > 0
             and created_by is not null))
);
create index on punches (company_id, punched_at);
create index on punches (membership_id, punched_at);
create index on punches (replaces_punch_id) where replaces_punch_id is not null;

-- Mesma imutabilidade do audit_log, mesmo trigger.
create trigger punches_immutable
  before update or delete on punches
  for each row execute function deny_mutation();

-- ============ SPRINT 6: AUSÊNCIAS ============
create type absence_kind as enum
  ('atestado','ferias','folga','feriado','falta_justificada','outro');

create table absences (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  -- NULL = vale para a empresa inteira (feriado).
  membership_id uuid references memberships(id) on delete cascade,
  kind          absence_kind not null,
  starts_on     date not null,
  ends_on       date not null,
  note          text,
  attachment_path text,        -- atestado digitalizado, bucket privado
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create index on absences (company_id, starts_on, ends_on);
create index on absences (membership_id);
```

### 3.4 Notas de modelagem

- **`memberships` é o coração do multi-tenant.** O papel é por empresa, não
  global — um contador pode ser dono da própria conta e funcionário em outra.
- **`schedule_entries` cobre os dois modelos:** `work_date` preenchido = escala
  por data; `weekday` preenchido = escala fixa semanal. O `check` garante que é
  um ou outro, nunca ambos.
- **Precedência:** existindo entrada avulsa para a data, ela substitui a fixa
  daquele dia da semana. Regra da camada de leitura, não do banco.
- **Faltas são derivadas, não armazenadas.** Falta = existe `schedule_entry`
  para o dia, **não** existe punch de entrada efetivo, **e** não existe
  `absence` cobrindo a data. A revisão 1 esquecia a terceira condição, o que
  transformava atestado em falta.
- **`company_id` redundante em tabelas filhas** é de propósito: deixa as
  policies de RLS simples e rápidas, sem JOIN em toda checagem.
- **`punches` é append-only e a correção é um registro novo.** Um punch é
  *efetivo* quando nenhum outro punch o referencia em `replaces_punch_id`.
  Anular uma batida indevida = inserir um punch com `voided = true` apontando
  para ela. O histórico inteiro fica auditável, e nada é sobrescrito.
- **Turno que vira o dia** (`end_time < start_time`) é aceito pelo modelo e
  tratado no cálculo desde a Sprint 7. O que fica fora do escopo é a regra
  trabalhista de hora noturna reduzida e adicional — ver §9.

---

## 4. Segurança — Row-Level Security

RLS é o que torna o multi-tenant seguro. Sem ela, um bug numa query vaza dados
entre empresas.

### 4.1 As seis regras que valem para toda tabela nova

1. `enable row level security` **e** `force row level security`.
2. `revoke all ... from anon`, e `grant` explícito só do que `authenticated`
   precisa.
3. Toda função `security definer` leva `set search_path = public, pg_temp`.
4. Papel se checa por `can_manage_member()` / `auth_role()`, nunca inline —
   assim um caminho novo não escapa da regra.
5. Registro de ponto e auditoria são append-only; correção é registro novo.
6. Guarda em três camadas: a UI esconde, o `requireManager()` bloqueia a URL
   direta, e o RLS dá a palavra final.

### 4.2 O que a Sprint 0 corrigiu no desenho original

- **`USING` filtra em silêncio.** Um `UPDATE` que não casa com a policy devolve
  zero linhas **sem erro**. Só `WITH CHECK` levanta `42501`. A aplicação
  precisa verificar linhas afetadas, ou a tela dirá "salvo" sem ter salvado.
- **Escalada de privilégio pelo gerente.** As policies originais davam
  `UPDATE` ao gerente sobre qualquer membership sem restringir o valor de
  `role`. Fechado com `can_manage_member()`: dono mexe em qualquer um, gerente
  só em funcionários.
- **A cascata precisa passar pela imutabilidade.** `on delete cascade` de
  `companies` batia no trigger append-only e tornava impossível apagar uma
  empresa. O trigger agora distingue cascata de mexida avulsa.

---

## 5. Fluxos críticos

### 5.1 Convite → cadastro (implementado)

1. Dono/gerente cria `invitation`. Gerente só convida funcionário — a policy
   recusa qualquer papel acima.
2. O e-mail leva para `/auth/callback?token_hash=…&type=invite`, **não** para o
   link padrão do Supabase: aquele devolve a sessão no fragmento da URL, que
   nunca chega ao servidor.
3. A pessoa entra sem senha e cai em `/convites`.
4. `accept_invitation(token)` confere que **o e-mail do convite bate com o
   e-mail de quem logou** — token sozinho não basta, porque e-mail se
   encaminha — valida prazo e status, cria a `membership` e audita.

### 5.2 Bater ponto (Sprint 5)

1. PWA lê `navigator.geolocation` com `enableHighAccuracy`, guarda também a
   precisão informada.
2. Se a unidade exige selfie, captura e sobe para bucket privado.
3. Cliente chama `/api/punch` com coordenadas, precisão, tipo e caminho da
   selfie. **Sem internet, a batida entra numa fila local e sobe depois**, com
   o horário de origem preservado e marcada como sincronizada em atraso.
4. Servidor busca a `location`, calcula Haversine, compara com `radius_m`,
   recusa precisão pior que o raio, decide `verified` e grava **uma vez**, com
   `service_role`.
5. Retorna aceite ou recusa. Só o servidor decide.

### 5.3 Corrigir ponto (Sprint 6)

1. Gestor abre o dia do funcionário e vê batidas efetivas e ausências.
2. Ao ajustar, informa **justificativa obrigatória**.
3. O sistema insere um punch novo com `origin='ajuste_manual'`,
   `replaces_punch_id` apontando o anterior (ou nenhum, se a batida faltou),
   `created_by` = o gestor.
4. O registro original continua no banco, visível no histórico. Auditado.

### 5.4 Agente IA monta escala (Sprint 9)

1. Dono escreve: *"coloca a Carla na manhã de segunda a sexta"*.
2. Rota server-side chama a API da Anthropic com tool definitions
   (`assign_shift`, `remove_shift`, `query_schedule`, `explain_feature`).
3. O modelo devolve tool calls; o servidor executa gravando em
   `schedule_entries`, respeitando papel e RLS.
4. Mudança em massa pede confirmação antes de aplicar. Tudo vai para
   `audit_log`.

---

## 6. Roadmap de sprints

Cada sprint segue o mesmo ciclo: **Desenvolver → Testar → Validar → Gate →
Próxima**. Só se avança quando o gate passa.

Legenda: 🎯 objetivo · 🔨 dev · 🧪 testes · ✅ validação · 🚦 gate.

---

### ✅ Sprint 0 — Fundação & multi-tenant `CONCLUÍDA`

🎯 Projeto rodando local, auth por magic link e isolamento de tenant provado.

**Entregue:** Next.js 16 + Supabase local; `companies`, `memberships`,
`invitations`, `audit_log`; RLS com `force` e grants explícitos; RPC
`create_company_with_owner`; login OTP; painel; navegação por papel.

🚦 **Gate cumprido:** 31 asserções pgTAP provando isolamento entre empresas +
login real ponta a ponta.

**Correções feitas no caminho:** escalada de privilégio do gerente; empresa que
não podia ser apagada por causa do trigger de imutabilidade.

---

### ✅ Sprint 1 — Equipe & convites `CONCLUÍDA`

🎯 Dono/gerente monta a equipe; funcionário se cadastra sozinho pelo convite.

**Entregue:** tela de Equipe; criar, reenviar e cancelar convite; página
pública `/aceitar/{token}`; `/convites` achando o convite pelo e-mail;
template de e-mail próprio; teto de privilégio também no convite.

🚦 **Gate cumprido:** 33 asserções pgTAP (64 no total) + ciclo
convite→cadastro→ativo validado no navegador.

**Correções feitas no caminho:** gerente convidando alguém como dono; marcação
de convite expirado que a exceção desfazia; template de e-mail cuja sessão não
chegava ao servidor.

---

### Sprint 2 — Cadastros: membros, turnos e unidades

Sprint de configuração. Nada aqui é vistoso, mas a escala não existe sem os
três.

🎯 **Objetivo:** a empresa fica configurável — equipe editável, turnos
definidos, unidades cadastradas.

🔨 **Desenvolver**
- **Gestão de membros** (a lacuna da Sprint 1): promover, rebaixar, desativar e
  remover. Respeitando `can_manage_member` e `protect_last_owner`.
- **Desativar ≠ remover.** Desativado perde acesso mas mantém histórico de
  ponto; remover só é permitido para quem nunca bateu ponto.
- CRUD de `shift_templates`: manhã/tarde/noite + custom, com horário de
  entrada, saída, **intervalo previsto** e cor.
- CRUD de `locations`: nome, endereço, coordenadas, raio, método, exigir
  selfie. Seletor de ponto no mapa **ou** entrada manual de lat/lng.
- Tela de configuração da empresa: nome, CNPJ, fuso horário.

🧪 **Testar**
- Dono promove funcionário a gerente; gerente não consegue.
- Rebaixar o último dono é recusado.
- Desativar preserva o histórico; remover quem tem ponto é recusado.
- Turno com intervalo maior que a jornada é recusado.
- Raio fora de 20–2000 m é recusado.
- Turno e unidade de outra empresa não aparecem nem podem ser referenciados.

✅ **Validação:** você configura sua operação real — turnos de verdade,
unidade com o raio certo, equipe com os papéis certos — em menos de 10 minutos.

🚦 **Gate:** os três cadastros gravam, leem e respeitam papel; nenhuma
operação de papel escapa de `can_manage_member`.

---

### Sprint 3 — Escala: montar e persistir

🎯 **Objetivo:** os dois modelos de escala funcionando, com precedência
correta.

🔨 **Desenvolver**
- Grid funcionários × dias, com navegação entre semanas.
- Clique aplica turno (modelo por data). Arrastar aplica em vários dias.
- Ação "aplicar fixa semanal": Seg–Sex de um funcionário de uma vez.
- Persistência em `schedule_entries`, com a FK composta para
  `shift_templates`.
- Precedência avulsa > fixa na leitura.
- Unidade por entrada, quando a empresa tem mais de uma.
- Copiar semana anterior.

🧪 **Testar**
- Escala fixa aparece em todas as semanas seguintes.
- Avulsa sobrepõe a fixa no dia específico, e removê-la faz a fixa voltar.
- Dois turnos no mesmo dia para a mesma pessoa é recusado pelo índice.
- Entrada apontando turno inexistente é recusada pela FK.
- Funcionário recebe erro de RLS ao tentar escrever.
- Semana com virada de mês e horário de verão não desalinha.

✅ **Validação:** você monta a escala de uma semana real da sua operação em
poucos minutos, e ela persiste após recarregar.

🚦 **Gate:** os dois modelos gravam, leem e respeitam precedência.

---

### Sprint 4 — Escala: visões por papel e comunicação

🎯 **Objetivo:** cada papel vê o que precisa, e o funcionário fica sabendo.

🔨 **Desenvolver**
- Dono/gerente: calendário de todos, por semana e por mês.
- Funcionário: "minha escala", semana e próximos turnos.
- Resumo: turnos no período e **horas previstas líquidas** (jornada menos
  intervalo).
- Legenda de turnos, destaque do dia atual, indicação da unidade.
- E-mail ao funcionário quando a escala dele muda (agrupado, não um por
  clique).
- Exportar a escala da semana em PDF para imprimir e colar na parede.

🧪 **Testar**
- Funcionário só enxerga os próprios turnos — confirmado por RLS, não pela UI.
- Calendário do gestor bate exatamente com o que foi montado na Sprint 3.
- Fuso da empresa aplicado corretamente, inclusive para quem acessa de outro
  fuso.
- Horas previstas descontam o intervalo.
- Mudar 20 turnos gera um e-mail, não vinte.

✅ **Validação:** um funcionário de teste abre o app no celular e entende a
própria semana sem explicação.

🚦 **Gate:** visões corretas, consistentes com os dados, e notificação
funcionando.

---

### Sprint 5 — Ponto por GPS

A sprint mais sensível. Foco em confiabilidade e antifraude.

🎯 **Objetivo:** funcionário bate ponto pelo celular com verificação de raio no
servidor, e a batida não se perde quando a internet cai.

🔨 **Desenvolver**
- Tela de bater ponto (PWA instalável): lê `navigator.geolocation`, mostra
  estado (localizando, no local, fora do raio, sem permissão).
- Validação **server-side**: Haversine, comparação com `radius_m`, recusa
  quando a precisão do GPS é pior que o raio.
- Escrita única com `service_role`. O cliente **não** tem INSERT em `punches`.
- Selfie opcional por unidade → Storage privado + URL assinada.
- **Fila offline:** batida sem rede vai para IndexedDB e sobe ao reconectar,
  preservando o horário de origem e marcada como sincronizada em atraso.
- Sequência coerente: não aceitar duas entradas seguidas nem saída sem
  entrada.
- Histórico do próprio ponto na área do funcionário.

🧪 **Testar**
- Dentro do raio aceita; fora recusa — com coordenadas simuladas.
- Cliente forjando `verified=true` no payload: o servidor ignora e recalcula.
- Cliente tentando INSERT direto em `punches`: recusado por permissão.
- Precisão de 500 m num raio de 100 m: recusado com mensagem clara.
- Selfie exigida e ausente: bloqueado.
- Sem permissão de GPS: mensagem clara, sem quebrar.
- Modo avião: batida enfileira e sobe depois, sem duplicar.
- Duas entradas seguidas: recusado.

✅ **Validação:** você vai fisicamente até o local, bate ponto e é aceito; anda
até fora do raio e é recusado; põe em modo avião, bate, volta a ter rede e a
batida aparece.

🚦 **Gate:** verificação server-authoritative comprovadamente não forjável, e
nenhuma batida perdida no teste offline.

> **Nota de plataforma:** ler SSID de Wi-Fi no navegador é bloqueado por iOS e
> Android. Wi-Fi confiável exige app nativo — Sprint 11. Por isso GPS vem
> primeiro.
>
> **Limite conhecido:** GPS é falsificável por apps de mock location. O
> servidor garante que a coordenada *recebida* está no raio, não que o aparelho
> disse a verdade. Mitigação real só com app nativo (§10).

---

### Sprint 6 — Correções e ausências

Sprint nova. Sem ela, os relatórios da Sprint 7 nascem errados.

🎯 **Objetivo:** o registro reflete a realidade, mesmo quando a batida falhou.

🔨 **Desenvolver**
- Tela do gestor: dia a dia de um funcionário, batidas efetivas e pendências.
- Ajustar batida: corrigir horário, incluir batida faltante, anular batida
  indevida. **Justificativa obrigatória**, sempre como registro novo.
- Histórico da correção visível: o que era, o que virou, quem mudou, por quê.
- `absences`: atestado, férias, folga, feriado, falta justificada. Período,
  observação e anexo em bucket privado.
- Feriado da empresa inteira (`membership_id` nulo).
- Funcionário pode **solicitar** correção; gestor aprova ou recusa.

🧪 **Testar**
- Correção não altera o registro original — ele continua consultável.
- Ajuste sem justificativa é recusado pelo banco, não só pela tela.
- Funcionário não corrige o próprio ponto, só solicita.
- Ausência cobrindo o dia impede que ele conte como falta.
- Feriado da empresa vale para todos sem criar uma linha por pessoa.
- Anexo de atestado não é acessível por URL pública.

✅ **Validação:** um dia com batida esquecida é corrigido, e o relatório passa
a mostrar o número certo — com o rastro de quem corrigiu.

🚦 **Gate:** correção auditável e imutável, e falta deixa de confundir-se com
ausência justificada.

---

### Sprint 7 — Relatórios e espelho de ponto

🎯 **Objetivo:** transformar pontos e escalas em informação de gestão
confiável.

🔨 **Desenvolver**
- Relatório por funcionário: horas trabalhadas líquidas, atrasos, faltas,
  ausências justificadas, aderência à escala.
- Cálculo de horas com virada de dia e com intervalo descontado.
- Atraso = diferença entre início do turno e a entrada efetiva, com tolerância
  configurável por empresa.
- Filtros por período, funcionário e unidade.
- **Espelho de ponto** mensal por funcionário, em PDF: escala prevista,
  batidas, ajustes e totais.
- Export CSV com os mesmos números da tela.
- Histórico individual na área do funcionário.

🧪 **Testar**
- Turno noturno 22:00–06:00 conta as horas no dia certo.
- Intervalo descontado corretamente, inclusive quando não foi batido.
- Atraso dentro da tolerância não conta como atraso.
- Falta, folga e atestado aparecem em categorias distintas.
- CSV e PDF batem com a tela, número a número.
- Funcionário só vê o próprio relatório.
- Relatório de mês com 500 batidas responde em tempo aceitável.

✅ **Validação:** os números de uma semana real conferem com sua conferência
manual, incluindo um dia corrigido e um atestado.

🚦 **Gate:** relatórios corretos nos casos de borda, e espelho de ponto que uma
pessoa consegue ler e conferir.

---

### Sprint 8 — Piloto: endurecer para uso real

Sprint nova, e a mais importante depois da 0. Antes de IA e cobrança, um
cliente real usa.

🎯 **Objetivo:** o sistema aguenta um negócio de verdade usando todo dia.

🔨 **Desenvolver**
- Estados vazios e mensagens de erro que uma pessoa entende.
- Convite em lote e importação de equipe por CSV.
- LGPD: exportar todos os dados da empresa, apagar a conta de verdade.
- Observabilidade: log de erro no servidor, alerta quando `/api/punch` falha.
- Limites de requisição em `/api/punch` e no envio de convites.
- Backup e restauração testados — não presumidos.
- Ajuste fino de responsividade no celular, que é onde o ponto acontece.
- Tela de ajuda com o básico.

🧪 **Testar**
- Uma semana inteira de operação real, sem intervenção sua no banco.
- Derrubar o Supabase por 5 minutos: o app degrada com mensagem clara e não
  perde batida enfileirada.
- Exportação de dados contém tudo que a empresa gerou.
- Exclusão de conta remove mesmo, incluindo arquivos do Storage.

✅ **Validação:** um cliente-piloto opera uma semana e você não precisou abrir
o banco nenhuma vez.

🚦 **Gate:** uma semana real sem intervenção manual. **Este é o gate que
decide se o produto existe.**

---

### Sprint 9 — Agente de IA

🎯 **Objetivo:** montar escala por linguagem natural e responder sobre o
sistema.

🔨 **Desenvolver**
- Rota server-side com a API da Anthropic. Chave só no servidor.
- Tool definitions: `assign_shift`, `remove_shift`, `query_schedule`,
  `explain_feature`.
- Executor aplicando as tool calls com o papel de quem pediu — o agente nunca
  tem mais poder que o usuário.
- Chat na área do dono/gerente. Toda ação para `audit_log`.
- Confirmação antes de aplicar mudança em massa.
- Teto de gasto por empresa.

🧪 **Testar**
- "coloca a Carla na manhã de seg a sex" cria as 5 entradas certas.
- "dá folga pro Bruno no sábado" remove a entrada certa.
- "quem trabalha na sexta?" responde com a lista real.
- Comando ambíguo: o agente pergunta, não inventa.
- Gerente pedindo para promover alguém a dono: recusado pela mesma policy.
- Funcionário não acessa o agente de escala.
- Prompt injection no nome de um funcionário não vira comando.

✅ **Validação:** você monta a escala de uma semana inteira só conversando.

🚦 **Gate:** ações corretas, confirmadas, auditadas e limitadas pelo papel de
quem pede.

---

### Sprint 10 — Billing & planos

🎯 **Objetivo:** cobrar por empresa.

🔨 **Desenvolver**
- Gateway brasileiro (Asaas ou Pagar.me) com Pix e cartão — Pix é o que o
  mercado local usa.
- Planos: trial 14 dias → básico/pro por número de funcionários.
- Limites por plano aplicados **no backend**.
- Tela de assinatura e faturas para o dono.
- Aviso de trial acabando; degradação suave, não corte seco.

🧪 **Testar**
- Trial expira e o acesso restringe conforme a regra — **sem bloquear o
  registro de ponto**, que é obrigação trabalhista do empregador.
- Upgrade e downgrade ajustam limites na hora.
- Webhook de pagamento é idempotente: entregue duas vezes, cobra uma.
- Passar do limite de funcionários é recusado no servidor.

✅ **Validação:** um cliente-piloto assina e usa pagando.

🚦 **Gate:** ciclo de cobrança confiável, limites aplicados server-side, ponto
nunca bloqueado por inadimplência.

---

### Sprint 11 — App nativo, Wi-Fi e antifraude

🎯 **Objetivo:** ponto mais robusto e presença nas lojas.

🔨 **Desenvolver**
- Empacotar com Capacitor, reaproveitando o front.
- Ponto por Wi-Fi (SSID/BSSID) e/ou QR code no local.
- **Detecção de mock location** — só possível no nativo.
- Push: lembrete de turno e de ponto não batido.
- Biometria do aparelho antes da batida.

🧪 **Testar** rede certa valida, rede diferente recusa, mock location é
detectado e a batida é marcada como suspeita, push chega.

✅ **Validação** funcionário bate ponto por Wi-Fi no estabelecimento real.

🚦 **Gate:** método Wi-Fi confiável, fraude por GPS falso detectável, app
publicável.

---

## 7. Ordem de dependência

```
S0 Fundação ─► S1 Equipe ─► S2 Cadastros ─► S3 Escala ─► S4 Visões
                                                │
                                                ▼
                              S5 Ponto ─► S6 Correções ─► S7 Relatórios
                                                                │
                                                                ▼
                                                          S8 PILOTO
                                                                │
                                          ┌─────────────────────┼──────────┐
                                          ▼                     ▼          ▼
                                     S9 Agente IA        S10 Billing   S11 Nativo
```

- **Nada antes da S0.** Sem tenant isolado, todo o resto é retrabalho.
- **Cadastros antes da escala.** Turno sem intervalo e escala sem unidade
  viram migração dolorosa depois.
- **Escala antes de ponto.** Falta e atraso só existem comparando ponto
  *contra* escala.
- **Correções antes de relatórios.** Relatório sobre dados que ninguém pôde
  corrigir mostra número errado com cara de número certo — pior que não ter
  relatório.
- **Piloto antes de IA e billing.** O agente é conforto e a cobrança é
  consequência. O valor está em escala + ponto + relatório confiável, e só um
  cliente real prova isso.
- **S9, S10 e S11 são paralelas** depois do piloto: a ordem entre elas é
  decisão de negócio, não técnica.

---

## 8. Escopo de conformidade

**O que o PontoEscala é:** um sistema de gestão de escala e registro de
presença, com trilha de auditoria e registros imutáveis.

**O que ele não é (ainda):** um REP-P homologado nos termos da Portaria
671/2021. Não gera AFD, não emite comprovante de marcação a cada batida, não
tem assinatura digital dos registros.

**Por que isso importa:** empresas com mais de 20 funcionários têm obrigação
de controle de jornada, e a forma desse controle tem exigências legais. Um
cliente que use o PontoEscala como único registro pode não estar coberto numa
fiscalização.

**O que já está pronto para o dia em que virar REP-P:**

- Registros imutáveis desde a Sprint 0 — nada de `UPDATE`, correção é registro
  novo.
- Identificação do trabalhador em toda batida (`membership_id` → `auth.users`).
- Trilha de auditoria com autor, ação e momento.
- Espelho de ponto (Sprint 7).

**O que faltaria:** geração de AFD no layout da portaria, comprovante entregue
ao trabalhador a cada marcação, integridade criptográfica dos registros, e
validação jurídica. Estimativa: 2 a 3 sprints.

**Recomendação:** conversar com contador ou advogado trabalhista **antes da
Sprint 10**, porque isso muda como o produto pode ser vendido.

---

## 9. Backlog nomeado

Cada item traz o custo de adiar, para a decisão ser consciente.

| Item | Custo de adiar |
| --- | --- |
| **Escalas cíclicas (12x36, 5x1, 6x1)** | Alto. `schedule_entries` hoje só entende dia-da-semana e data. Ciclos exigem um terceiro tipo com data-âncora. Fecha as portas para segurança, saúde e portaria. |
| **Jornada por carga horária** | Médio. Muda o conceito de atraso e aderência no relatório. |
| **Adicional noturno e hora noturna reduzida** | Médio, se o alvo incluir turno de madrugada. O modelo aceita o turno; falta a regra de cálculo. |
| **Banco de horas** | Médio. Precisa de saldo acumulado e política de compensação. |
| **Troca de turno entre funcionários** | Baixo. Pedido + aprovação sobre o que já existe. |
| **Integração com folha** | Baixo agora, alto quando houver cliente médio. |
| **Multi-unidade avançado** | Baixo. Gerente por unidade, em vez de por empresa. |
| **REP-P completo** | Ver §8. |
| **Testes end-to-end automatizados** | Crescente. Hoje o gate é pgTAP + verificação manual no navegador. A partir da Sprint 5 o fluxo fica complexo demais para conferir na mão a cada mudança. |

---

## 10. Riscos conhecidos

| Risco | Probabilidade | Mitigação |
| --- | --- | --- |
| **GPS falsificado** por app de mock location | Alta — é um app grátis | Detecção só no nativo (S11). Até lá, registrar precisão e distância, e sinalizar padrões suspeitos no relatório |
| **Funcionário sem celular ou sem dados** | Média | QR code no local ou tablet compartilhado na unidade (S11) |
| **Bateria/permissão de GPS negada** | Alta | Mensagem clara e caminho alternativo pelo gestor (S6) |
| **Relatório errado silenciosamente** | Média | Casos de borda são gate explícito da S7; espelho de ponto deixa o funcionário conferir |
| **Custo do agente de IA sem teto** | Média | Limite por empresa desde a S9 |
| **Fuso e horário de verão** | Média | `companies.timezone` desde a S0; testes de virada na S3 e S7 |
| **Vazamento entre tenants** | Baixa, alto impacto | RLS com `force`, gate pgTAP a cada sprint, nenhuma tabela nova sem policy |

---

## 11. Como trabalhar neste repositório

Convenções, comandos e as regras que não se negociam estão em
[`AGENTS.md`](./AGENTS.md). O resumo operacional:

```bash
npm run dev        # app em http://localhost:3000
npm run db:start   # Supabase local (Docker)
npm run db:reset   # recria o banco com todas as migrations
npm run db:test    # gate de cada sprint
npm run db:types   # regenera os tipos do banco
```

Mexeu em migration: `npm run db:reset && npm run db:test`.
Não rode `next build` com o `next dev` de pé — os dois disputam o `.next`.
