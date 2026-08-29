"use client";

import { useState, useTransition } from "react";
import { definirDiaFixo, aplicarSegASex } from "../actions";
import { DOWS_ORDENADOS, rotuloLongoDow } from "@/lib/datas";
import type { Turno } from "../grade-semana";

export type EntradaFixa = {
  id: string;
  membership_id: string;
  weekday: number;
  shift_key: string | null;
};

type Membro = { membership_id: string; full_name: string };

const hhmm = (t: string) => t.slice(0, 5);

export default function GradeFixa({
  membros,
  entradas,
  turnos,
}: {
  membros: Membro[];
  entradas: EntradaFixa[];
  turnos: Turno[];
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  const porChave = new Map<string, EntradaFixa>();
  for (const e of entradas) {
    porChave.set(`${e.membership_id}|${e.weekday}`, e);
  }

  const turnoPorChave = new Map(turnos.map((t) => [t.key, t]));

  function definir(membershipId: string, weekday: number, valor: string) {
    setErro(null);
    const fd = new FormData();
    fd.set("membership_id", membershipId);
    fd.set("weekday", String(weekday));
    fd.set("valor", valor);
    startTransition(async () => {
      const r = await definirDiaFixo({ erro: null, ok: null }, fd);
      if (r.erro) setErro(r.erro);
    });
  }

  function segASex(membershipId: string, valor: string) {
    setErro(null);
    const fd = new FormData();
    fd.set("membership_id", membershipId);
    fd.set("valor", valor);
    startTransition(async () => {
      const r = await aplicarSegASex({ erro: null, ok: null }, fd);
      if (r.erro) setErro(r.erro);
    });
  }

  if (turnos.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-8 text-center text-sm text-slate-500">
        Cadastre um turno antes de montar o padrão semanal.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {erro && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {erro}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[56rem] border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 border-b border-slate-200 bg-white px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
                Pessoa
              </th>
              {DOWS_ORDENADOS.map((dow) => (
                <th
                  key={dow}
                  className="border-b border-l border-slate-200 px-2 py-2 text-center text-xs font-medium text-slate-500"
                >
                  {rotuloLongoDow(dow).slice(0, 3)}
                </th>
              ))}
              <th className="border-b border-l border-slate-200 px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
                Seg a sex
              </th>
            </tr>
          </thead>
          <tbody>
            {membros.map((m) => (
              <tr key={m.membership_id}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 border-b border-slate-200 bg-white px-4 py-2 text-left text-sm font-medium text-slate-800"
                >
                  {m.full_name}
                </th>

                {DOWS_ORDENADOS.map((dow) => {
                  const entrada = porChave.get(`${m.membership_id}|${dow}`);
                  const turno = entrada?.shift_key
                    ? turnoPorChave.get(entrada.shift_key)
                    : undefined;
                  return (
                    <td
                      key={dow}
                      className="border-b border-l border-slate-200 p-1"
                    >
                      <label className="sr-only" htmlFor={`f-${m.membership_id}-${dow}`}>
                        {m.full_name}, {rotuloLongoDow(dow)}
                      </label>
                      <select
                        id={`f-${m.membership_id}-${dow}`}
                        disabled={pendente}
                        value={entrada?.shift_key ?? "nenhum"}
                        onChange={(e) =>
                          definir(m.membership_id, dow, e.target.value)
                        }
                        className="w-full rounded border border-slate-200 bg-white px-1 py-1 text-xs disabled:opacity-50"
                        style={
                          turno
                            ? {
                                backgroundColor: `${turno.color}1a`,
                                borderColor: turno.color,
                              }
                            : undefined
                        }
                      >
                        <option value="nenhum">— folga</option>
                        {turnos.map((t) => (
                          <option key={t.key} value={t.key}>
                            {t.label} {hhmm(t.start_time)}
                          </option>
                        ))}
                      </select>
                    </td>
                  );
                })}

                <td className="border-b border-l border-slate-200 p-1">
                  <label className="sr-only" htmlFor={`ss-${m.membership_id}`}>
                    Aplicar de segunda a sexta para {m.full_name}
                  </label>
                  <select
                    id={`ss-${m.membership_id}`}
                    disabled={pendente}
                    value=""
                    onChange={(e) => {
                      if (e.target.value) segASex(m.membership_id, e.target.value);
                    }}
                    className="w-full rounded border border-slate-300 bg-white px-1 py-1 text-xs disabled:opacity-50"
                  >
                    <option value="">Aplicar…</option>
                    {turnos.map((t) => (
                      <option key={t.key} value={t.key}>
                        {t.label} em seg–sex
                      </option>
                    ))}
                    <option value="nenhum">Limpar seg–sex</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400">
        Aqui não existe &ldquo;folga marcada&rdquo;: no padrão semanal, folga é
        simplesmente não ter turno. Folga como exceção de um dia se marca na
        tela da semana.
      </p>
    </div>
  );
}
