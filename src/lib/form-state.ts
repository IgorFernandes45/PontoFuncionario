/**
 * Estado compartilhado dos formulários com `useActionState`.
 *
 * Mora aqui, e não junto das actions, porque um arquivo `"use server"` só
 * pode exportar funções async — exportar a constante de lá quebra em tempo
 * de execução, e o build não avisa.
 */
export type FormState = { erro: string | null; ok: string | null };

export const ESTADO_VAZIO: FormState = { erro: null, ok: null };
