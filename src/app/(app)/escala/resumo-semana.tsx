export type ResumoLinha = {
  membership_id: string;
  full_name: string;
  dias_com_turno: number;
  dias_de_folga: number;
  minutos_previstos: number;
};

function horas(minutos: number) {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

export default function ResumoSemana({ linhas }: { linhas: ResumoLinha[] }) {
  const comTurno = linhas.filter((l) => l.dias_com_turno > 0);
  if (comTurno.length === 0) return null;

  const totalMinutos = comTurno.reduce((s, l) => s + l.minutos_previstos, 0);

  return (
    <section className="mt-6 rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-medium text-slate-900">
          Horas previstas na semana
        </h2>
        <p className="text-sm text-slate-500">
          Total da equipe:{" "}
          <span className="font-semibold tabular-nums text-slate-800">
            {horas(totalMinutos)}
          </span>
        </p>
      </div>
      <ul className="divide-y divide-slate-100">
        {comTurno.map((l) => (
          <li
            key={l.membership_id}
            className="flex items-center justify-between gap-3 px-4 py-2 text-sm"
          >
            <span className="truncate text-slate-700">{l.full_name}</span>
            <span className="shrink-0 tabular-nums text-slate-500">
              {l.dias_com_turno} {l.dias_com_turno === 1 ? "turno" : "turnos"}
              {l.dias_de_folga > 0 && ` · ${l.dias_de_folga} folga`}
              {" · "}
              <span className="font-medium text-slate-800">
                {horas(l.minutos_previstos)}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">
        Já descontando o intervalo previsto de cada turno.
      </p>
    </section>
  );
}
