# PontoEscala

SaaS multi-tenant de gestão de escala e ponto eletrônico.
Plano completo e roadmap: [`PontoEscala-Plano-Tecnico.md`](./PontoEscala-Plano-Tecnico.md).

**Sprint atual: 1 — Equipe & convites.** (Sprint 0 concluída.)

## Rodar localmente

Requisitos: Node 20+, Docker Desktop rodando.

```bash
npm install
npm run db:start
```

O `db:start` imprime `anon key` e `service_role key`. Copie o exemplo e cole
as chaves:

```bash
cp .env.example .env.local
```

Depois:

```bash
npm run dev
```

App em <http://localhost:3000>. Os e-mails de magic link **não** saem de
verdade em ambiente local: eles ficam no Inbucket, em
<http://localhost:54324>.

## Gates

O critério de saída de cada sprint é provado por teste, não por inspeção
visual:

```bash
npm run db:test
```

- [`rls_isolation.test.sql`](./supabase/tests/database/rls_isolation.test.sql)
  (Sprint 0) monta duas empresas com usuários distintos e verifica que o dono
  da empresa A não enxerga nem altera nada da empresa B, que gerente e
  funcionário não se promovem a dono, e que um usuário sem vínculo não
  alcança dado nenhum.
- [`invitations.test.sql`](./supabase/tests/database/invitations.test.sql)
  (Sprint 1) cobre o ciclo convite → cadastro → membro ativo: quem pode
  convidar quem, convite vencido, convite reaproveitado, e o caso que mais
  importa — o token vazado não serve para quem não é o destinatário.

## E-mails de convite

O template padrão do Supabase entrega a sessão no **fragmento** da URL
(`#access_token=...`), que nunca chega ao servidor. Uma página renderizada no
servidor não veria sessão nenhuma. Por isso
[`supabase/templates/invite.html`](./supabase/templates/invite.html) usa
`{{ .TokenHash }}` e aponta para `/auth/callback`, que troca o token por
sessão no servidor.

**Em produção esse template precisa ser configurado no dashboard do
Supabase** — o `config.toml` só vale para o ambiente local.

## Portas

O stack local **não** usa as portas padrão do Supabase (543xx). No Windows, as
faixas 53903–54302 e 54317–54516 costumam estar reservadas pelo Hyper-V/WinNAT,
e o `supabase start` falha com `bind: An attempt was made to access a socket in
a way forbidden by its access permissions`. O `config.toml` foi movido para
553xx:

| Serviço | Porta |
| --- | --- |
| API / Auth / REST | 55321 |
| Postgres | 55322 |
| Studio | 55323 |
| Mailpit (e-mails de teste) | 55324 |

Para conferir as faixas reservadas da sua máquina:

```bash
netsh interface ipv4 show excludedportrange protocol=tcp
```

## Fluxo de trabalho

Mexeu em migration:

```bash
npm run db:reset && npm run db:test
```

## Onde está o quê

| Caminho | O que é |
| --- | --- |
| `supabase/migrations/` | DDL e políticas de RLS, em ordem cronológica |
| `supabase/tests/database/` | testes pgTAP — o gate de segurança |
| `src/proxy.ts` | renova a sessão e barra rota privada |
| `src/lib/supabase/` | clients do browser, do servidor e o admin |
| `src/lib/auth.ts` | `requireUser` · `requireWorkspace` · `requireManager` |
| `src/app/(app)/` | área logada, com navegação por papel |
