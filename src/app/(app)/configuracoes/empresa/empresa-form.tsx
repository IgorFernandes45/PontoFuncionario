"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { salvarEmpresa } from "../actions";
import { ESTADO_VAZIO } from "@/lib/form-state";

const FUSOS = [
  ["America/Recife", "Recife / Fortaleza / Salvador (UTC−3)"],
  ["America/Sao_Paulo", "São Paulo / Brasília (UTC−3)"],
  ["America/Manaus", "Manaus / Cuiabá (UTC−4)"],
  ["America/Rio_Branco", "Rio Branco (UTC−5)"],
  ["America/Noronha", "Fernando de Noronha (UTC−2)"],
] as const;

export default function EmpresaForm({
  empresa,
}: {
  empresa: {
    name: string;
    cnpj: string | null;
    timezone: string;
    plan: string;
    trial_ends_at: string;
  };
}) {
  const [state, action] = useActionState(salvarEmpresa, ESTADO_VAZIO);

  return (
    <div className="max-w-lg space-y-4">
      <form
        action={action}
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-5"
      >
        <div>
          <h2 className="text-sm font-medium text-slate-900">Dados da empresa</h2>
          <p className="text-xs text-slate-500">
            O fuso horário define como os horários de turno e ponto são
            calculados. Mudá-lo altera relatórios já existentes.
          </p>
        </div>

        <Campo label="Nome">
          <input
            name="name"
            required
            defaultValue={empresa.name}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </Campo>

        <Campo label="CNPJ (opcional)">
          <input
            name="cnpj"
            defaultValue={empresa.cnpj ?? ""}
            placeholder="00.000.000/0001-00"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
          />
        </Campo>

        <Campo label="Fuso horário">
          <select
            name="timezone"
            defaultValue={empresa.timezone}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            {FUSOS.map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
            {!FUSOS.some(([v]) => v === empresa.timezone) && (
              <option value={empresa.timezone}>{empresa.timezone}</option>
            )}
          </select>
        </Campo>

        {state.erro && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {state.erro}
          </p>
        )}
        {state.ok && (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {state.ok}
          </p>
        )}

        <Salvar />
      </form>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-medium text-slate-900">Plano</h2>
        <p className="mt-1 text-sm capitalize text-slate-700">{empresa.plan}</p>
        {empresa.plan === "trial" && (
          <p className="mt-1 text-xs text-slate-500">
            Até {new Date(empresa.trial_ends_at).toLocaleDateString("pt-BR")}.
            A cobrança entra na Sprint 10.
          </p>
        )}
      </div>
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
      {pending ? "Salvando…" : "Salvar"}
    </button>
  );
}

function Campo({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">
        {label}
      </span>
      {children}
    </label>
  );
}
