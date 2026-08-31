"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { ESTADO_VAZIO } from "@/lib/form-state";
import { salvarAusencia, excluirAusencia } from "./actions";

export type MembroSimples = { membership_id: string; full_name: string };

export type Ausencia = {
  id: string;
  membership_id: string | null;
  kind: string;
  starts_on: string;
  ends_on: string;
  note: string | null;
};

const TIPOS: [string, string][] = [
  ["atestado", "Atestado médico"],
  ["ferias", "Férias"],
  ["folga", "Folga combinada"],
  ["feriado", "Feriado (empresa toda)"],
  ["falta_justificada", "Falta justificada"],
  ["outro", "Outro"],
];

const ROTULO = Object.fromEntries(TIPOS);

function dataBR(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  }).format(new Date(`${iso}T12:00:00Z`));
}

export default function ListaAusencias({
  ausencias,
  membros,
  hoje,
}: {
  ausencias: Ausencia[];
  membros: MembroSimples[];
  hoje: string;
}) {
  const [state, action] = useActionState(salvarAusencia, ESTADO_VAZIO);
  const [tipo, setTipo] = useState("atestado");
  const nomePorId = new Map(membros.map((m) => [m.membership_id, m.full_name]));

  return (
    <div className="space-y-5">
      <form
        action={action}
        className="grid gap-3 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-2"
      >
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">
            Tipo
          </span>
          <select
            name="kind"
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            {TIPOS.map(([v, r]) => (
              <option key={v} value={v}>
                {r}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">
            Quem
          </span>
          <select
            name="membership_id"
            disabled={tipo === "feriado"}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-400"
          >
            {tipo === "feriado" ? (
              <option value="">Empresa toda</option>
            ) : (
              membros.map((m) => (
                <option key={m.membership_id} value={m.membership_id}>
                  {m.full_name}
                </option>
              ))
            )}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">
            De
          </span>
          <input
            type="date"
            name="starts_on"
            required
            defaultValue={hoje}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">
            Até
          </span>
          <input
            type="date"
            name="ends_on"
            required
            defaultValue={hoje}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
          />
        </label>

        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs font-medium text-slate-600">
            Observação (opcional)
          </span>
          <input
            name="note"
            placeholder="Atestado de 3 dias"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        {state.erro && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">
            {state.erro}
          </p>
        )}
        {state.ok && (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 sm:col-span-2">
            {state.ok}
          </p>
        )}

        <div className="sm:col-span-2">
          <Salvar />
        </div>
      </form>

      {ausencias.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-8 text-center text-sm text-slate-500">
          Nenhuma ausência registrada este ano.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {ausencias.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm text-slate-900">
                  {a.membership_id
                    ? (nomePorId.get(a.membership_id) ?? "—")
                    : "Empresa toda"}
                  <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                    {ROTULO[a.kind] ?? a.kind}
                  </span>
                </p>
                <p className="text-xs tabular-nums text-slate-500">
                  {dataBR(a.starts_on)}
                  {a.ends_on !== a.starts_on && ` até ${dataBR(a.ends_on)}`}
                  {a.note && ` · ${a.note}`}
                </p>
              </div>
              <form action={excluirAusencia}>
                <input type="hidden" name="id" value={a.id} />
                <button className="rounded-lg px-2.5 py-1 text-xs text-red-600 hover:bg-red-50">
                  Remover
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Salvar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
    >
      {pending ? "Salvando…" : "Registrar ausência"}
    </button>
  );
}
