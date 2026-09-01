/** Minutos em "8h30". O relatório inteiro fala nesse formato. */
export function horas(minutos: number): string {
  const sinal = minutos < 0 ? "−" : "";
  const abs = Math.abs(minutos);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return m === 0 ? `${sinal}${h}h` : `${sinal}${h}h${String(m).padStart(2, "0")}`;
}

export const SITUACAO: Record<string, { rotulo: string; classe: string }> = {
  trabalhado: { rotulo: "Trabalhado", classe: "bg-emerald-50 text-emerald-700" },
  em_aberto: { rotulo: "Em aberto", classe: "bg-amber-50 text-amber-700" },
  falta: { rotulo: "Falta", classe: "bg-red-50 text-red-700" },
  ausencia: { rotulo: "Ausência", classe: "bg-blue-50 text-blue-700" },
  folga: { rotulo: "Folga", classe: "bg-slate-100 text-slate-500" },
  sem_escala: { rotulo: "Sem escala", classe: "bg-slate-50 text-slate-400" },
};

export const AUSENCIA: Record<string, string> = {
  atestado: "Atestado",
  ferias: "Férias",
  folga: "Folga",
  feriado: "Feriado",
  falta_justificada: "Falta justificada",
  outro: "Outro",
};
