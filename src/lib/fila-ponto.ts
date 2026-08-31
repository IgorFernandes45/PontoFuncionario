/**
 * Fila local de batidas que não conseguiram subir.
 *
 * Estabelecimento com sinal ruim é a regra, não a exceção — sem fila, o
 * funcionário simplesmente não bate. A batida guarda o momento REAL em que
 * aconteceu; o servidor preserva esse horário e marca como sincronizada em
 * atraso.
 *
 * Limite conhecido: só sobe com o app aberto. Sincronizar com o app fechado
 * exige Service Worker com Background Sync, que o iOS não suporta — fica
 * para o app nativo da Sprint 11.
 */
const CHAVE = "pontoescala:fila";

export type BatidaPendente = {
  id_local: string;
  tipo: string;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  punched_at: string;
};

function ler(): BatidaPendente[] {
  try {
    const bruto = localStorage.getItem(CHAVE);
    return bruto ? (JSON.parse(bruto) as BatidaPendente[]) : [];
  } catch {
    // Navegador anônimo, cota estourada, storage bloqueado: seguir sem fila
    // é melhor que quebrar a tela de ponto.
    return [];
  }
}

function gravar(fila: BatidaPendente[]) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(fila));
  } catch {
    /* idem */
  }
}

export function enfileirar(b: BatidaPendente) {
  gravar([...ler(), b]);
}

export function pendentes(): BatidaPendente[] {
  return ler();
}

export function remover(idLocal: string) {
  gravar(ler().filter((b) => b.id_local !== idLocal));
}

export type ResultadoEnvio = {
  enviadas: number;
  descartadas: { batida: BatidaPendente; motivo: string }[];
};

/**
 * Tenta subir a fila inteira. Recusa de negócio (422) descarta a batida —
 * insistir numa batida que o servidor nunca vai aceitar deixaria a fila presa
 * para sempre. Falha de rede mantém na fila para a próxima tentativa.
 */
export async function sincronizar(): Promise<ResultadoEnvio> {
  const fila = ler();
  const resultado: ResultadoEnvio = { enviadas: 0, descartadas: [] };

  for (const b of fila) {
    try {
      const r = await fetch("/api/punch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: b.tipo,
          lat: b.lat,
          lng: b.lng,
          accuracy: b.accuracy,
          punched_at: b.punched_at,
        }),
      });

      if (r.ok) {
        remover(b.id_local);
        resultado.enviadas += 1;
        continue;
      }

      if (r.status === 422 || r.status === 400 || r.status === 403) {
        const corpo = await r.json().catch(() => ({ erro: "Recusada" }));
        remover(b.id_local);
        resultado.descartadas.push({ batida: b, motivo: corpo.erro });
        continue;
      }

      // 5xx ou qualquer outra coisa: pode ser passageiro, fica na fila.
      break;
    } catch {
      // Sem rede. Para de tentar as próximas.
      break;
    }
  }

  return resultado;
}
