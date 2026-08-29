#!/usr/bin/env node
/**
 * Escreve .env.local a partir do `supabase status`, para nao depender de
 * copiar e colar chave na mao. Preserva variaveis que ja existem no arquivo
 * (ex.: ANTHROPIC_API_KEY) e so sobrescreve as tres do Supabase.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const ARQUIVO = ".env.local";

function statusDoSupabase() {
  // shell:true porque no Windows o alvo e um .cmd, que o Node 20+ recusa
  // executar diretamente (EINVAL).
  const r = spawnSync("npx supabase status -o json", {
    shell: true,
    encoding: "utf8",
  });
  // A CLI sai com codigo != 0 quando algum servico opcional (imgproxy,
  // pooler) esta parado, mas o JSON sai correto mesmo assim. O que decide
  // se deu certo e ter JSON, nao o exit code.
  const bruto = r.stdout ?? "";
  const inicio = bruto.indexOf("{");
  if (inicio === -1) throw new Error(r.stderr || "sem JSON na saida");
  return JSON.parse(bruto.slice(inicio));
}

let status;
try {
  status = statusDoSupabase();
} catch {
  console.error("Supabase local não está rodando. Rode `npm run db:start`.");
  process.exit(1);
}

const novos = {
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
};

const existentes = new Map();
if (existsSync(ARQUIVO)) {
  for (const linha of readFileSync(ARQUIVO, "utf8").split(/\r?\n/)) {
    const m = linha.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !(m[1] in novos)) existentes.set(m[1], m[2]);
  }
}

const linhas = [
  "# Gerado por `npm run env:local` — nao commitar.",
  ...Object.entries(novos).map(([k, v]) => `${k}=${v}`),
  "",
  ...(existentes.size
    ? [...existentes].map(([k, v]) => `${k}=${v}`)
    : ["ANTHROPIC_API_KEY="]),
  "",
];

writeFileSync(ARQUIVO, linhas.join("\n"));
console.log(`${ARQUIVO} atualizado (${status.API_URL}).`);
