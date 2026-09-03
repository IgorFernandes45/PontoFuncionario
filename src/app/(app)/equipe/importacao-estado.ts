/**
 * Mora fora de `importar-actions.ts` porque aquele arquivo é `"use server"`,
 * e um módulo de server actions só pode exportar funções async. Exportar a
 * constante de lá compila sem reclamar e quebra no primeiro clique — foi
 * exatamente o que aconteceu, duas vezes.
 */
export type ResultadoImportacao = {
  erro: string | null;
  linhas: { email: string; resultado: string }[];
};

export const IMPORTACAO_VAZIA: ResultadoImportacao = { erro: null, linhas: [] };
