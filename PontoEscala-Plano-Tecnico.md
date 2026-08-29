# PontoEscala — Plano Técnico & Roadmap de Desenvolvimento

> SaaS multi-tenant de gestão de escala e ponto eletrônico.
> Stack: **Next.js (App Router) + Supabase (Postgres, Auth, RLS, Storage, Edge Functions)**.
> Documento de referência para desenvolvimento incremental por sprints.

---

## 1. Visão do produto

Sistema online onde cada empresa (tenant) gerencia sua equipe: convida funcionários por e-mail, monta escalas (fixa semanal, por data e por turnos), acompanha o ponto batido pelo celular com verificação de localização, gera relatórios e conta com um agente de IA que monta escalas por linguagem natural e responde dúvidas.

**Papéis:**
- **Dono** — acesso total: configura empresa, regras de ponto, planos, todos os relatórios.
- **Gerente** — monta escala, gerencia equipe e vê relatórios, mas não mexe em faturamento/configuração crítica.
- **Funcionário** — vê a própria escala, bate ponto, consulta o próprio histórico.

**Princípio central:** multi-tenant desde o dia 1. Todo dado carrega `company_id` e o isolamento é garantido no banco via Row-Level Security (RLS), não só na aplicação.

---

## 2. Arquitetura

```
┌──────────────────────────────────────────────────────────┐
│                     CLIENTE (browser / PWA)               │
│   Next.js App Router · React · Tailwind · shadcn/ui       │
│   - Área do dono/gerente (dashboard, escala, relatórios)  │
│   - Área do funcionário (escala, ponto, histórico)        │
│   - PWA p/ ponto pelo celular (geolocation API)           │
└───────────────┬──────────────────────────┬───────────────┘
                │ supabase-js (RLS)         │ /api routes (server)
                ▼                           ▼
┌──────────────────────────┐   ┌───────────────────────────┐
│   SUPABASE                │   │  NEXT.JS SERVER (Vercel)  │
│  - Postgres + RLS         │   │  - Rotas server-side      │
│  - Auth (magic link/OTP)  │   │  - Agente IA (API Claude) │
│  - Storage (selfies)      │◄──┤  - Webhooks/CRON          │
│  - Edge Functions         │   │  - Validação de ponto     │
│  - Realtime (opcional)    │   └───────────────────────────┘
└──────────────────────────┘
```

**Decisões-chave:**
- Auth por **magic link / OTP** (sem senha) — simplifica onboarding e reduz superfície de ataque. Convite de funcionário é um magic link com token.
- **RLS** filtra tudo por `company_id` derivado do usuário logado. Nenhuma query confia no cliente.
- **Agente IA roda no servidor** (nunca expõe a API key ao browser). Ele traduz linguagem natural em *ações estruturadas* (tool calls) que gravam na mesma camada de dados que a UI.
- **Selfies** vão para o Storage em bucket privado, com URL assinada de curta duração.
- **Validação de ponto no servidor**: o cliente envia coordenadas, mas quem decide se está dentro do raio é a função no backend (cliente é não-confiável).

---

## 3. Modelo de dados (schema Postgres)

### 3.1 Diagrama de entidades

```
companies ──┬── memberships ──── auth.users
            ├── invitations
            ├── locations ──── location_wifi
            ├── shift_templates
            ├── schedules ──── schedule_entries
            ├── punches
            ├── plans (billing)
            └── audit_log
```

### 3.2 DDL

```sql
-- ============ EXTENSÕES ============
create extension if not exists "pgcrypto";

-- ============ EMPRESAS (tenant raiz) ============
create table companies (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  cnpj          text,
  timezone      text not null default 'America/Recife',
  plan          text not null default 'trial',      -- trial|basic|pro
  trial_ends_at timestamptz default (now() + interval '14 days'),
  created_at    timestamptz not null default now()
);

-- ============ VÍNCULO USUÁRIO↔EMPRESA (papéis) ============
-- Um usuário pode pertencer a mais de uma empresa (multi-tenant real).
create type app_role as enum ('dono','gerente','funcionario');
create type member_status as enum ('ativo','pendente','inativo');

create table memberships (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  full_name   text not null,
  role        app_role not null default 'funcionario',
  status      member_status not null default 'ativo',
  created_at  timestamptz not null default now(),
  unique (company_id, user_id)
);
create index on memberships (company_id);
create index on memberships (user_id);

-- ============ CONVITES ============
create table invitations (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  email       text not null,
  full_name   text not null,
  role        app_role not null default 'funcionario',
  token       text not null unique default encode(gen_random_bytes(24),'hex'),
  status      text not null default 'pendente',   -- pendente|aceito|expirado
  expires_at  timestamptz not null default (now() + interval '7 days'),
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now()
);
create index on invitations (company_id);
create index on invitations (token);

-- ============ UNIDADES / LOCAIS DE TRABALHO ============
create type punch_method as enum ('gps','wifi','ambos');

create table locations (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id) on delete cascade,
  name           text not null,
  lat            double precision,        -- centro do estabelecimento
  lng            double precision,
  radius_m       integer not null default 120,
  method         punch_method not null default 'gps',
  require_selfie boolean not null default false,
  created_at     timestamptz not null default now()
);
create index on locations (company_id);

-- SSIDs de Wi-Fi permitidos por unidade (1:N)
create table location_wifi (
  id          uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id) on delete cascade,
  ssid        text not null,
  bssid       text                                   -- MAC do AP, mais confiável
);

-- ============ TURNOS PRÉ-DEFINIDOS ============
create table shift_templates (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  key         text not null,             -- manha|tarde|noite|custom
  label       text not null,
  start_time  time not null,
  end_time    time not null,
  color       text not null default '#2f5bff',
  unique (company_id, key)
);
create index on shift_templates (company_id);

-- ============ ESCALAS ============
-- schedules = "planta" da escala (fixa semanal ou avulsa)
create type schedule_kind as enum ('fixa','avulsa');

create table schedules (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  kind        schedule_kind not null default 'avulsa',
  name        text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- schedule_entries = turno de UM funcionário em UM dia (ou dia-da-semana p/ fixa)
create table schedule_entries (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id) on delete cascade,
  schedule_id  uuid references schedules(id) on delete set null,
  membership_id uuid not null references memberships(id) on delete cascade,
  location_id  uuid references locations(id),
  shift_key    text not null,             -- referencia shift_templates.key
  work_date    date,                      -- usado quando avulsa
  weekday      smallint,                  -- 0..6 usado quando fixa
  created_at   timestamptz not null default now(),
  check (work_date is not null or weekday is not null)
);
create index on schedule_entries (company_id, work_date);
create index on schedule_entries (membership_id);

-- ============ PONTO ============
create type punch_type as enum ('entrada','saida','intervalo_inicio','intervalo_fim');

create table punches (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  membership_id uuid not null references memberships(id) on delete cascade,
  location_id   uuid references locations(id),
  type          punch_type not null,
  punched_at    timestamptz not null default now(),
  lat           double precision,
  lng           double precision,
  distance_m    integer,                  -- distância calculada no servidor
  wifi_ssid     text,
  verified      boolean not null default false,
  verify_method punch_method,
  selfie_path   text,                     -- caminho no Storage
  created_at    timestamptz not null default now()
);
create index on punches (company_id, punched_at);
create index on punches (membership_id, punched_at);

-- ============ AUDITORIA ============
create table audit_log (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  actor       uuid references auth.users(id),
  action      text not null,             -- ex: 'schedule.create','punch.verify'
  target      text,
  meta        jsonb,
  created_at  timestamptz not null default now()
);
create index on audit_log (company_id, created_at);
```

### 3.3 Notas de modelagem

- **`memberships` é o coração do multi-tenant.** O papel do usuário é por empresa, não global — um contador pode ser "dono" da própria conta e "funcionário" em outra.
- **`schedule_entries` cobre os 3 modelos:** `work_date` preenchido = escala por data/avulsa; `weekday` preenchido = escala fixa semanal (uma linha por dia-da-semana que se repete). Turnos pré-definidos são apenas o `shift_key` apontando para `shift_templates`.
- **Faltas são derivadas, não armazenadas:** falta = existe `schedule_entry` para o dia mas não existe `punch` de entrada correspondente. Calculado na camada de relatório.
- **`company_id` redundante** em tabelas filhas (ex.: `schedule_entries` também guarda `company_id`) — de propósito: deixa as policies de RLS simples e rápidas, sem JOINs em toda checagem.

---

## 4. Segurança — Row-Level Security (RLS)

RLS é o que torna o multi-tenant seguro. Sem ela, um bug numa query vaza dados entre empresas.

### 4.1 Função auxiliar

```sql
-- Retorna as empresas do usuário logado e seu papel
create or replace function auth_company_ids()
returns setof uuid language sql stable security definer as $$
  select company_id from memberships
  where user_id = auth.uid() and status = 'ativo';
$$;

create or replace function auth_role(cid uuid)
returns app_role language sql stable security definer as $$
  select role from memberships
  where user_id = auth.uid() and company_id = cid and status = 'ativo'
  limit 1;
$$;
```

### 4.2 Ativação e políticas (exemplo por tabela)

```sql
alter table companies         enable row level security;
alter table memberships       enable row level security;
alter table schedule_entries  enable row level security;
alter table punches           enable row level security;
-- ... (idem para todas as tabelas com company_id)

-- COMPANIES: só vejo empresas às quais pertenço
create policy company_read on companies
  for select using (id in (select auth_company_ids()));

-- MEMBERSHIPS: vejo os membros da(s) minha(s) empresa(s)
create policy mbr_read on memberships
  for select using (company_id in (select auth_company_ids()));
-- só dono/gerente cria ou altera membros
create policy mbr_write on memberships
  for all using (
    company_id in (select auth_company_ids())
    and auth_role(company_id) in ('dono','gerente')
  );

-- SCHEDULE_ENTRIES: todos da empresa leem; só dono/gerente escreve
create policy sched_read on schedule_entries
  for select using (company_id in (select auth_company_ids()));
create policy sched_write on schedule_entries
  for all using (
    company_id in (select auth_company_ids())
    and auth_role(company_id) in ('dono','gerente')
  );

-- PUNCHES: funcionário só vê/insere o PRÓPRIO ponto; dono/gerente vê todos
create policy punch_read on punches
  for select using (
    company_id in (select auth_company_ids())
    and (
      auth_role(company_id) in ('dono','gerente')
      or membership_id in (
        select id from memberships where user_id = auth.uid()
      )
    )
  );
create policy punch_insert on punches
  for insert with check (
    company_id in (select auth_company_ids())
    and membership_id in (
      select id from memberships where user_id = auth.uid()
    )
  );
```

**Regra de ouro:** a verificação de ponto (`verified`, `distance_m`) **nunca** é gravada direto pelo cliente. O insert do cliente cria o registro bruto; uma Edge Function / rota server-side com `service_role` recalcula distância e marca `verified`. Assim o funcionário não consegue forjar "estou no local".

---

## 5. Fluxos críticos

### 5.1 Convite → cadastro do funcionário
1. Dono/gerente cria `invitation` (email, nome, papel) → gera `token`.
2. Supabase envia magic link: `https://app.pontoescala.com/aceitar/{token}`.
3. Funcionário abre, autentica (OTP no e-mail), backend valida token não expirado.
4. Cria `membership` com status `ativo`, marca convite como `aceito`, loga em `audit_log`.

### 5.2 Bater ponto (server-authoritative)
1. PWA lê geolocalização (`navigator.geolocation`) e, se aplicável, tenta identificar rede.
2. Se a unidade exige selfie, captura a foto e sobe para Storage (bucket privado).
3. Cliente chama rota `/api/punch` com coords + tipo + selfie_path.
4. **Servidor** busca a `location`, calcula distância (Haversine), compara com `radius_m`, valida método, marca `verified` e grava.
5. Retorna sucesso/negação. Só o servidor decide.

### 5.3 Agente IA monta escala
1. Dono escreve: *"coloca a Carla na manhã de segunda a sexta"*.
2. Rota server-side chama a API da Anthropic com **tool definitions** (ex.: `assign_shift`, `remove_shift`, `query_schedule`).
3. O modelo retorna uma tool call estruturada → o servidor executa a ação (grava `schedule_entries`), respeitando RLS/papel.
4. Resposta em linguagem natural confirma o que foi feito. Toda ação vai para `audit_log`.

---

## 6. Roadmap de sprints

Cada sprint de ~1–2 semanas segue o mesmo ciclo: **Desenvolver → Testar → Validar → Critério de saída (gate) → Próxima**. Só se avança quando o gate passa. Isso evita construir a sprint 5 sobre uma fundação da sprint 2 que ainda está quebrada.

Legenda de entregável: 🎯 objetivo · 🔨 dev · 🧪 testes · ✅ validação · 🚦 gate para avançar.

---

### Sprint 0 — Fundação & infraestrutura
Antes de qualquer feature, o esqueleto tem que existir e o multi-tenant tem que estar provado.

🎯 **Objetivo:** projeto rodando localmente e em staging, com auth e isolamento de tenant funcionando.

🔨 **Desenvolver**
- Repositório Next.js (App Router) + Tailwind + shadcn/ui.
- Projeto Supabase (staging + prod). Variáveis de ambiente e segredos.
- Rodar o DDL das tabelas `companies`, `memberships`, `invitations`.
- Auth por magic link/OTP. Fluxo de cadastro do dono (cria company + membership 'dono').
- Ativar RLS e as policies base. Funções `auth_company_ids()` / `auth_role()`.
- Layout base com sidebar e troca de perspectiva por papel.

🧪 **Testar**
- Criar 2 empresas distintas (A e B) com usuários diferentes.
- Logado como A, tentar `select` em dados de B → deve retornar vazio.
- Usuário sem membership → não acessa nada.
- Teste automatizado de RLS (script que roda queries com JWT de cada usuário).

✅ **Validação**
- Você cria uma conta do zero, recebe o magic link, entra, e vê um painel vazio "sua empresa".

🚦 **Gate:** isolamento entre A e B provado por teste + login real funcionando. **Sem isso, não avança** — é a fundação de segurança de todo o resto.

---

### Sprint 1 — Equipe & convites
🎯 **Objetivo:** dono/gerente monta a equipe; funcionário se cadastra sozinho pelo convite.

🔨 **Desenvolver**
- Tela "Equipe": listar membros, status (ativo/pendente).
- Formulário de convite (nome, e-mail, papel) → cria `invitation` + dispara e-mail.
- Página `/aceitar/{token}`: valida token, autentica, cria `membership`.
- Papéis aplicados na UI (funcionário não vê botões de gestão).
- Registro em `audit_log`.

🧪 **Testar**
- Convite com token válido → cadastro conclui e vira membership ativo.
- Token expirado (>7 dias) → recusado.
- Token de outra empresa → não cria vínculo cruzado.
- Funcionário tenta acessar tela de convite via URL direta → bloqueado por RLS/rota.

✅ **Validação**
- Convide um e-mail seu de teste, aceite pelo celular, veja o membro aparecer "ativo" no painel do dono.

🚦 **Gate:** ciclo convite→cadastro→ativo funciona ponta a ponta com papéis respeitados.

---

### Sprint 2 — Turnos & escala manual
🎯 **Objetivo:** os 3 modelos de escala funcionando e persistindo.

🔨 **Desenvolver**
- CRUD de `shift_templates` (manhã/tarde/noite + custom, com horários e cor).
- Grid de escala (funcionários × dias), clique aplica turno (modelo "por data").
- Ação "aplicar fixa semanal" (Seg–Sex de um funcionário de uma vez).
- Persistência em `schedule_entries` (avulsa via `work_date`, fixa via `weekday`).
- Navegação entre semanas.

🧪 **Testar**
- Criar/editar/remover turno reflete no grid.
- Escala fixa gera entradas de weekday que aparecem em todas as semanas.
- Escala avulsa sobrepõe a fixa num dia específico (regra de precedência).
- Só dono/gerente consegue escrever (funcionário recebe erro de RLS).

✅ **Validação**
- Você monta a escala de uma semana real da sua operação em poucos minutos e ela persiste após recarregar.

🚦 **Gate:** escala dos 3 modelos grava, lê e respeita precedência avulsa > fixa.

---

### Sprint 3 — Visualização: calendário geral & minha escala
🎯 **Objetivo:** cada papel vê o que precisa.

🔨 **Desenvolver**
- Dono/gerente: calendário com a escala de todos (semana/mês).
- Funcionário: "minha escala" — só os próprios turnos, visão semana.
- Resumo (qtd. de turnos, horas previstas).
- Legenda de turnos, destaque do dia atual.

🧪 **Testar**
- Funcionário só enxerga os próprios turnos (confirmar via RLS, não só via UI).
- Calendário do dono bate exatamente com o que foi montado na Sprint 2.
- Fuso horário da empresa aplicado corretamente.

✅ **Validação**
- Um funcionário de teste abre o app e entende a própria semana sem explicação.

🚦 **Gate:** visões separadas corretas e consistentes com os dados.

---

### Sprint 4 — Ponto eletrônico (GPS)
A sprint mais sensível. Foco em confiabilidade e antifraude.

🎯 **Objetivo:** funcionário bate ponto pelo celular com verificação de raio no servidor.

🔨 **Desenvolver**
- Config da unidade: `locations` (lat/lng, `radius_m`, método, selfie).
- Tela de bater ponto (PWA): lê `navigator.geolocation`, envia para `/api/punch`.
- Validação **server-side**: Haversine, compara com raio, marca `verified`.
- Selfie opcional → Storage privado + URL assinada.
- Estados de UI: localizando, no local, fora do raio, sucesso.

🧪 **Testar**
- Dentro do raio → aceito; fora → recusado (testar com coords mockadas).
- Cliente forjando `verified=true` no payload → servidor ignora e recalcula.
- Selfie exigida → ponto sem selfie é bloqueado.
- Sem permissão de GPS → mensagem clara, sem quebrar.
- Registro correto de entrada/saída/intervalo.

✅ **Validação**
- Você vai fisicamente até um local, bate ponto e é aceito; sai do raio e é recusado.

🚦 **Gate:** verificação é server-authoritative e comprovadamente não-forjável.

> **Nota de plataforma:** ler SSID de Wi-Fi no navegador é bloqueado por iOS/Android. O método Wi-Fi confiável exige **app nativo** (React Native/Capacitor) ou um proxy (QR code no local / beacon). Por isso GPS vem primeiro; Wi-Fi entra na Sprint 8 com a estratégia certa.

---

### Sprint 5 — Relatórios
🎯 **Objetivo:** transformar pontos e escalas em informação de gestão.

🔨 **Desenvolver**
- Relatório por funcionário: horas trabalhadas, atrasos, faltas, aderência à escala.
- Falta = escala sem ponto correspondente (derivado).
- Atraso = diferença entre horário do turno e hora do ponto de entrada.
- Filtros por período e funcionário. Export CSV e PDF.
- Histórico individual na área do funcionário.

🧪 **Testar**
- Cálculo de horas com virada de dia (turno noite 22:00–06:00).
- Atraso e falta batem com casos montados manualmente.
- Export CSV/PDF com os mesmos números da tela.
- Funcionário só vê o próprio relatório.

✅ **Validação**
- Os números de uma semana real conferem com sua conferência manual.

🚦 **Gate:** relatórios corretos em casos de borda (virada de dia, folga, falta).

---

### Sprint 6 — Agente IA
🎯 **Objetivo:** montar escala por linguagem natural e responder sobre o sistema.

🔨 **Desenvolver**
- Rota server-side com a API da Anthropic (key só no servidor).
- Tool definitions: `assign_shift`, `remove_shift`, `query_schedule`, `explain_feature`.
- Executor que aplica as tool calls gravando em `schedule_entries` (respeitando papel/RLS).
- Chat na área do dono/gerente. Toda ação → `audit_log`.
- Confirmação antes de aplicar mudanças em massa.

🧪 **Testar**
- "coloca a Carla na manhã de seg a sex" → cria as 5 entradas certas.
- "dá folga pro Bruno no sábado" → remove a entrada certa.
- "quem trabalha na sexta?" → responde com a lista real.
- Comando ambíguo → agente pede esclarecimento, não inventa.
- Funcionário não tem acesso ao agente de escala.

✅ **Validação**
- Você monta a escala de uma semana inteira só conversando com o agente.

🚦 **Gate:** ações do agente são corretas, confirmadas e auditadas.

---

### Sprint 7 — Billing & planos (virar SaaS vendável)
🎯 **Objetivo:** cobrar por empresa.

🔨 **Desenvolver**
- Integração de pagamento (Stripe ou gateway BR — ex.: Asaas/Pagar.me).
- Planos: trial 14 dias → básico/pro (por nº de funcionários).
- Limites por plano aplicados no backend.
- Tela de assinatura e faturas para o dono.

🧪 **Testar**
- Trial expira → acesso restrito conforme regra.
- Upgrade/downgrade ajusta limites na hora.
- Webhook de pagamento atualiza `companies.plan` de forma idempotente.

✅ **Validação**
- Um cliente-piloto assina e usa em produção pagando.

🚦 **Gate:** ciclo de cobrança confiável e limites aplicados server-side.

---

### Sprint 8 — App nativo & ponto por Wi-Fi/beacon
🎯 **Objetivo:** ponto mais robusto e presença nas lojas.

🔨 **Desenvolver**
- Empacotar como app (Capacitor ou React Native) reaproveitando o front.
- Ponto por Wi-Fi (SSID/BSSID) e/ou beacon/QR no local.
- Push notifications (lembrete de turno, ponto não batido).

🧪 **Testar** conexão à rede certa valida; rede diferente recusa; push chega.

✅ **Validação** funcionário bate ponto por Wi-Fi no estabelecimento real.

🚦 **Gate:** método Wi-Fi confiável e app publicável.

---

### Sprints futuras (backlog)
- Banco de horas e integração com folha.
- Troca de turno entre funcionários (com aprovação).
- Multi-unidade avançado e permissões granulares.
- Dashboard analítico (previsão de demanda por horário).
- Assinatura eletrônica do espelho de ponto (conformidade trabalhista).

---

## 7. Ordem de dependência (por que essa sequência)

```
S0 Fundação ──► S1 Equipe ──► S2 Escala ──► S3 Visões
                                   └────────► S4 Ponto ──► S5 Relatórios
                                                              └─► S6 Agente
S5+S6 ──► S7 Billing ──► S8 Nativo/Wi-Fi
```

- **Nada antes de S0**: sem tenant isolado e auth, todo o resto é retrabalho.
- **Escala antes de ponto**: relatório de falta/atraso precisa comparar ponto *contra* escala.
- **Relatórios antes do agente**: o agente é conforto; o valor operacional está em escala+ponto+relatório.
- **Billing depois do núcleo funcionar**: só se cobra por algo que entrega valor comprovado.

## 8. Conformidade (atenção desde cedo)

Ponto eletrônico no Brasil tem regras (Portaria 671/2021 para REP-P, quando aplicável): registros imutáveis, espelho de ponto, identificação do trabalhador. Não precisa resolver na Sprint 4, mas **modele os `punches` como imutáveis** (sem update/delete; correções viram novos registros) desde já — refazer isso depois é caro. Vale uma consulta a contador/advogado trabalhista antes do S7.
