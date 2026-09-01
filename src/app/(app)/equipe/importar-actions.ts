"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireManager } from "@/lib/auth";

export type ResultadoImportacao = {
  erro: string | null;
  linhas: { email: string; resultado: string }[];
};

export const IMPORTACAO_VAZIA: ResultadoImportacao = { erro: null, linhas: [] };

type Pessoa = { nome: string; email: string; papel?: string };

/**
 * Aceita CSV ou texto colado. Digitar trinta convites um a um é onde o
 * cliente desiste antes de começar.
 *
 * Formatos aceitos por linha:
 *   Nome;email@x.com;funcionario
 *   Nome,email@x.com
 *   email@x.com
 */
function analisar(texto: string): Pessoa[] {
  const pessoas: Pessoa[] = [];

  for (const bruta of texto.split(/\r?\n/)) {
    const linha = bruta.trim();
    if (!linha) continue;

    const partes = linha.split(/[;,\t]/).map((p) => p.trim());

    // Cabeçalho de planilha: ignorar em vez de tentar convidar "Nome".
    if (/^(nome|name)$/i.test(partes[0] ?? "")) continue;

    const email = partes.find((p) => p.includes("@")) ?? "";
    const nome =
      partes.find((p) => p && !p.includes("@") && !/^(dono|gerente|funcionario)$/i.test(p)) ??
      "";
    const papel = partes.find((p) => /^(gerente|funcionario)$/i.test(p));

    pessoas.push({
      // Sem nome na linha, usa a parte antes do arroba: melhor um nome
      // aproximado que uma linha recusada.
      nome: nome || email.split("@")[0] || "",
      email,
      papel: papel?.toLowerCase(),
    });
  }

  return pessoas;
}

export async function importarEquipe(
  _prev: ResultadoImportacao,
  formData: FormData,
): Promise<ResultadoImportacao> {
  const { active } = await requireManager();

  const texto = String(formData.get("lista") ?? "");
  const pessoas = analisar(texto);

  if (pessoas.length === 0) {
    return { erro: "Cole ao menos uma linha com nome e e-mail.", linhas: [] };
  }
  if (pessoas.length > 200) {
    return {
      erro: "São muitas linhas de uma vez. Divida em blocos de até 200.",
      linhas: [],
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("bulk_invite", {
    p_company_id: active.company_id,
    p_pessoas: pessoas,
  });

  if (error) return { erro: error.message, linhas: [] };

  revalidatePath("/equipe");
  return {
    erro: null,
    linhas: (data ?? []) as { email: string; resultado: string }[],
  };
}
