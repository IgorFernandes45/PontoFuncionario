"use client";

import { useState, useTransition } from "react";
import { definirDia } from "./actions";
import { diaDoMes, rotuloCurto } from "@/lib/datas";

export type Turno = {
  key: string;
  label: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  color: string;
};

export type Celula = {
  work_date: string;
  membership_id: string;
  shift_key: string | null;
  shift_label: string | null;
  color: string | null;
  start_time: string | null;
  end_time: string | null;
  origem: "avulsa" | "fixa" | "folga";
};

type Membro = { membership_id: string; full_name: string };

const hhmm = (t: string) => t.slice(0, 5);

export default function GradeSemana({
  dias,
  hoje,
  membros,
  celulas,
  turnos,
}: {
  dias: string[];
  hoje: string;
  membros: Membro[];
  celulas: Celula[];
  turnos: Turno[];
}) {
  const [aberta, setAberta] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  // Índice por "membro|dia" para não varrer o array em cada célula.
  const porChave = new Map<string, Celula>();
  for (const c of celulas) {
    porChave.set(`${c.membership_id}|${c.work_date}`, c);
  }

  function aplicar(membershipId: string, dia: string, valor: string) {
    setErro(null);
    setAberta(null);
    const fd = new FormData();
    fd.set("membership_id", membershipId);
    fd.set("work_date", dia);
    fd.set("valor", valor);
    startTransition(async () => {
      const r = await definirDia({ erro: null, ok: null }, fd);
      if (r.erro) setErro(r.erro);
    });
  }

  return (
    <div className="space-y-3">
      {erro && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {erro}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[52rem] border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 border-b border-slate-200 bg-white px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
                Pessoa
              </th>
              {dias.map((d) => (
                <th
                  key={d}
                  className={`border-b border-l border-slate-200 px-2 py-2 text-center text-xs font-medium ${
                    d === hoje ? "bg-blue-50 text-blue-700" : "text-slate-500"
                  }`}
                >
                  <span className="block uppercase tracking-wide">
                    {rotuloCurto(d)}
                  </span>
                  <span className="block text-sm tabular-nums text-slate-700">
                    {diaDoMes(d)}
                  </span>
                </th>
              ))}
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
                {dias.map((d) => {
                  const chave = `${m.membership_id}|${d}`;
                  const celula = porChave.get(chave);
                  return (
                    <td
                      key={d}
                      className={`relative border-b border-l border-slate-200 p-1 align-top ${
                        d === hoje ? "bg-blue-50/40" : ""
                      }`}
                    >
                      <button
                        type="button"
                        disabled={pendente}
                        onClick={() =>
                          setAberta(aberta === chave ? null : chave)
                        }
                        aria-expanded={aberta === chave}
                        className="w-full rounded-md px-1 py-1.5 text-left transition hover:bg-slate-100 disabled:opacity-50"
                      >
                        <Conteudo celula={celula} />
                      </button>

                      {aberta === chave && (
                        <Seletor
                          turnos={turnos}
                          celula={celula}
                          onEscolher={(valor) =>
                            aplicar(m.membership_id, d, valor)
                          }
                          onFechar={() => setAberta(null)}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Legenda turnos={turnos} />
    </div>
  );
}

function Conteudo({ celula }: { celula?: Celula }) {
  if (!celula) {
    return <span className="block text-xs text-slate-300">—</span>;
  }

  if (celula.origem === "folga") {
    return (
      <span className="block rounded bg-slate-100 px-1.5 py-1 text-center text-xs text-slate-500">
        Folga
      </span>
    );
  }

  return (
    <span
      className="block rounded px-1.5 py-1 text-xs"
      style={{
        backgroundColor: `${celula.color}1a`,
        borderLeft: `3px solid ${celula.color}`,
      }}
    >
      <span className="block truncate font-medium text-slate-800">
        {celula.shift_label}
      </span>
      <span className="block tabular-nums text-slate-500">
        {celula.start_time && hhmm(celula.start_time)}
        {celula.end_time && `–${hhmm(celula.end_time)}`}
      </span>
      {celula.origem === "fixa" && (
        <span className="block text-[10px] uppercase tracking-wide text-slate-400">
          fixa
        </span>
      )}
    </span>
  );
}

function Seletor({
  turnos,
  celula,
  onEscolher,
  onFechar,
}: {
  turnos: Turno[];
  celula?: Celula;
  onEscolher: (valor: string) => void;
  onFechar: () => void;
}) {
  return (
    <>
      {/* Clique fora fecha. Sem isso o painel fica preso na tela. */}
      <button
        type="button"
        aria-label="Fechar"
        onClick={onFechar}
        className="fixed inset-0 z-20 cursor-default"
      />
      <div className="absolute left-0 top-full z-30 mt-1 w-44 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
        {turnos.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => onEscolher(t.key)}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-slate-100"
          >
            <span
              aria-hidden="true"
              className="h-3 w-1 shrink-0 rounded-full"
              style={{ backgroundColor: t.color }}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-slate-800">
                {t.label}
              </span>
              <span className="block tabular-nums text-slate-500">
                {hhmm(t.start_time)}–{hhmm(t.end_time)}
              </span>
            </span>
          </button>
        ))}

        <div className="my-1 border-t border-slate-200" />

        <button
          type="button"
          onClick={() => onEscolher("folga")}
          className="w-full rounded px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100"
        >
          Folga neste dia
        </button>

        {/* Só faz sentido quando existe uma exceção para desfazer. */}
        {celula && celula.origem !== "fixa" && (
          <button
            type="button"
            onClick={() => onEscolher("fixa")}
            className="w-full rounded px-2 py-1.5 text-left text-xs text-slate-500 hover:bg-slate-100"
          >
            Voltar à escala fixa
          </button>
        )}
      </div>
    </>
  );
}

function Legenda({ turnos }: { turnos: Turno[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
      {turnos.map((t) => (
        <span key={t.key} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: t.color }}
          />
          {t.label} · {hhmm(t.start_time)}–{hhmm(t.end_time)}
          {t.break_minutes > 0 && ` (${t.break_minutes} min)`}
        </span>
      ))}
    </div>
  );
}
