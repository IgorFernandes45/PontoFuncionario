# PontoEscala

SaaS multi-tenant de gestão de escala e ponto eletrônico.
Plano completo e roadmap: [`PontoEscala-Plano-Tecnico.md`](./PontoEscala-Plano-Tecnico.md).

**Sprint atual: 8 — Piloto: endurecer para uso real.** (Sprints 0 a 7 concluídas.)

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
- [`ponto.test.sql`](./supabase/tests/database/ponto.test.sql)
  (Sprint 5) responde a uma pergunta: um funcionário com acesso total ao
  próprio navegador consegue registrar um ponto que não deveria valer? Cobre
  raio, precisão de GPS, sequência, horário informado pelo cliente, e a
  ausência de qualquer caminho de escrita pelo cliente.
- [`correcoes.test.sql`](./supabase/tests/database/correcoes.test.sql)
  (Sprint 6) responde a outras duas: a correção altera o registro original?
  (não pode) E a falta continua se confundindo com atestado? (não pode).
- [`piloto.test.sql`](./supabase/tests/database/piloto.test.sql)
  (Sprint 8) cobre limite de requisição, importação em lote, fila de avisos e
  as duas obrigações da LGPD — exportar tudo e apagar de verdade.
- [`relatorios.test.sql`](./supabase/tests/database/relatorios.test.sql)
  (Sprint 7) monta os casos que a conta ingênua erra: turno que vira o dia,
  intervalo não batido, atraso dentro da tolerância, e a diferença entre
  falta, atestado e folga.
- [`arquivos.test.sql`](./supabase/tests/database/arquivos.test.sql)
  cobre selfie e anexo. O caminho do arquivo é quem carrega a autorização, e
  nome de objeto no Storage é texto livre — então testa o caminho forjado, o
  caminho torto e o acesso cruzado entre empresas.

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

## Testar com dados de verdade

Os testes pgTAP provam as regras no banco. Para ver o sistema funcionando com
uma operação inteira — seis pessoas, dois turnos, duas unidades, 30 dias de
ponto com faltas, atrasos, turnos esquecidos e atestados:

```bash
npm run seed:demo
```

Depois, com o `npm run dev` de pé noutro terminal, a bateria de ponta a ponta
— sessão, guardas por papel, telas, números do relatório, recusas do ponto,
isolamento entre empresas e LGPD:

```bash
npm run verificar
```

Ela sobe sessão pelo mesmo caminho do magic link e conversa por HTTP com o
app: é o que os testes de banco não alcançam.

## Backup e restauração

O Supabase hospedado faz backup diário automático, mas backup que nunca foi
restaurado não é backup. O procedimento, para testar antes de colocar cliente:

```bash
npx supabase db dump --db-url "$DATABASE_URL" -f backup.sql
```

Restaurar num banco limpo e conferir que os testes passam contra ele:

```bash
psql "$DATABASE_URL_DESTINO" -f backup.sql
npm run db:test
```

Os arquivos do Storage (selfies e anexos) **não** entram no dump do banco —
precisam de cópia própria pela API de Storage.

## Envio de e-mail

Os avisos de mudança de escala ficam na tabela `outbox`. Sem
`RESEND_API_KEY` e `EMAIL_REMETENTE` definidos, eles se acumulam e a tela em
Configurações → Dados mostra quantos estão esperando — nada se perde, e o
piloto roda sem e-mail. Com as duas variáveis, o botão passa a enviar.

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
