<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# PontoEscala

SaaS multi-tenant de escala e ponto eletrônico. O plano completo, com o
roadmap de sprints e os gates de cada uma, está em
`PontoEscala-Plano-Tecnico.md` — leia antes de mudar qualquer coisa
estrutural.

## Stack

Next.js 16 (App Router, `src/`) · React 19 · Tailwind 4 · Supabase
(Postgres + Auth + RLS + Storage).

## Convenções

- **UI e schema em português; código em inglês.** Tabelas, colunas e enums
  seguem o plano (`memberships`, `role = 'dono'`). Nomes de função e variável
  em inglês. Textos de tela em pt-BR.
- Next 16 chama de **`proxy`** o antigo `middleware` — o arquivo é
  `src/proxy.ts`.

## Regras que não se negociam

1. **Todo dado carrega `company_id` e toda tabela tem RLS.** O isolamento
   entre empresas vive no banco, não na aplicação. Ao criar tabela nova:
   `enable row level security` **e** `force row level security`, mais as
   policies, na mesma migration.
2. **`security definer` sempre com `set search_path = public, pg_temp`.**
   Sem isso a função vira vetor de escalada de privilégio.
3. **A anon key nunca decide nada sensível.** `SUPABASE_SERVICE_ROLE_KEY`
   ignora RLS e só existe no servidor — em rotas que precisam decidir o que o
   usuário não pode decidir por si (validar distância de um ponto, por
   exemplo). Ao usá-la, filtrar `company_id` na mão: a rede de proteção do
   RLS está desligada.
4. **Registros de ponto e auditoria são append-only.** Correção vira registro
   novo, nunca `update`. Isso é exigência de conformidade (Portaria
   671/2021), não preferência de modelagem. O trigger `deny_mutation()` já
   existe para reusar.
5. **Criação de empresa passa pela RPC `create_company_with_owner`.** Não
   existe policy de INSERT em `companies` de propósito: um usuário recém
   autenticado não pertence a empresa nenhuma, e abrir INSERT ali abriria um
   buraco.
6. **Guarda em três camadas.** A UI esconde, o `requireManager()` bloqueia a
   URL direta, e o RLS dá a palavra final. As três, sempre.

## Comandos

```bash
npm run dev        # app em http://localhost:3000
npm run db:start   # sobe Supabase local (Docker)
npm run db:reset   # recria o banco aplicando todas as migrations
npm run db:test    # roda os testes pgTAP — é o gate da Sprint 0
npm run db:types   # regenera src/lib/supabase/database.types.ts
npm run typecheck
```

Depois de mexer em migration: `npm run db:reset && npm run db:test`.

## Estrutura

```
supabase/migrations/          DDL + RLS, em ordem cronológica
supabase/tests/database/      pgTAP — prova de isolamento entre tenants
src/proxy.ts                  renova sessão e barra rota privada
src/lib/supabase/             clients (browser, server, admin) e sessão
src/lib/auth.ts               requireUser / requireWorkspace / requireManager
src/app/(app)/                área logada, com sidebar por papel
```
