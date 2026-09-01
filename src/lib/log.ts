/**
 * Log estruturado do servidor.
 *
 * Em produção (Vercel) uma linha por evento em JSON é o que a plataforma
 * indexa e o que dá para filtrar depois. Em desenvolvimento, texto legível.
 *
 * A regra que importa: erro em rota crítica nunca some em silêncio. Sem isso,
 * a primeira notícia de que o ponto parou de funcionar vem do funcionário
 * que não conseguiu bater.
 */
type Nivel = "info" | "aviso" | "erro";

type Campos = Record<string, unknown>;

function escrever(nivel: Nivel, evento: string, campos: Campos = {}) {
  const linha = {
    nivel,
    evento,
    em: new Date().toISOString(),
    ...campos,
  };

  if (process.env.NODE_ENV === "production") {
    const saida = nivel === "erro" ? console.error : console.log;
    saida(JSON.stringify(linha));
    return;
  }

  const saida = nivel === "erro" ? console.error : console.log;
  saida(`[${nivel}] ${evento}`, campos);
}

export const log = {
  info: (evento: string, campos?: Campos) => escrever("info", evento, campos),
  aviso: (evento: string, campos?: Campos) => escrever("aviso", evento, campos),
  erro: (evento: string, campos?: Campos) => escrever("erro", evento, campos),
};

/** Nunca registrar coordenada nem e-mail: log não é lugar de dado pessoal. */
export function seguro(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
