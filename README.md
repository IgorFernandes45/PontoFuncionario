# PontoEscala

SaaS multi-tenant de gestão de escala e ponto eletrônico.
Plano completo e roadmap: [`PontoEscala-Plano-Tecnico.md`](./PontoEscala-Plano-Tecnico.md).

**Sprint atual: 4 — Escala: visões por papel.** (Sprints 0 a 3 concluídas.)

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
- [`cadastros.test.sql`](./supabase/tests/database/cadastros.test.sql)
  (Sprint 2) cobre gestão de membros, turnos e unidades: quem promove quem,
  intervalo que não cabe na jornada, raio de GPS fora do razoável, e o turno
  que vira o dia.
- [`escala.test.sql`](./supabase/tests/database/escala.test.sql)
  (Sprint 3) cobre os dois modelos de escala e a precedência: a avulsa
  sobrepõe a fixa no dia, removê-la faz a fixa voltar, folga marcada tira o
  dia da conta, e repetir a semana não congela o que vinha do padrão.
- [`visoes.test.sql`](./supabase/tests/database/visoes.test.sql)
  (Sprint 4) cobre o resumo e a cobertura: horas previstas são líquidas,
  turno noturno conta 7h e não valor negativo, folga não soma minuto, e cada
  mudança de escala deixa rastro com o turno de antes e o de depois.

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

Duas armadilhas do ambiente, aprendidas na marra:

- **Não rode `next build` com o `next dev` de pé.** Os dois disputam o
  `.next` e o dev fica inacessível.
- **Não canalize a saída do `next dev` por um pipe que possa fechar.** O Next
  escreve no stdout a cada request; se o leitor sumir, ele morre com
  `EPIPE: broken pipe` numa exceção não tratada. Redirecione para arquivo:
  `npm run dev > .next-dev.log 2>&1 &`.

## Onde está o quê

| Caminho | O que é |
| --- | --- |
| `supabase/migrations/` | DDL e políticas de RLS, em ordem cronológica |
| `supabase/tests/database/` | testes pgTAP — o gate de segurança |
| `src/proxy.ts` | renova a sessão e barra rota privada |
| `src/lib/supabase/` | clients do browser, do servidor e o admin |
| `src/lib/auth.ts` | `requireUser` · `requireWorkspace` · `requireManager` |
| `src/app/(app)/` | área logada, com navegação por papel |
