"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { criarEmpresa, type OnboardingState } from "./actions";

const FUSOS = [
  ["America/Recife", "Recife / Fortaleza / Salvador (UTC−3)"],
  ["America/Sao_Paulo", "São Paulo / Brasília (UTC−3)"],
  ["America/Manaus", "Manaus / Cuiabá (UTC−4)"],
  ["America/Rio_Branco", "Rio Branco (UTC−5)"],
  ["America/Noronha", "Fernando de Noronha (UTC−2)"],
] as const;

const inicial: OnboardingState = { erro: null };

function Botao() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
    >
      {pending ? "Criando…" : "Criar empresa"}
    </button>
  );
}

export default function OnboardingForm() {
  const [state, action] = useActionState(criarEmpresa, inicial);

  return (
    <form action={action} className="space-y-4">
      <Campo
        id="nome_empresa"
        label="Nome da empresa"
        placeholder="Padaria do Zé"
        required
      />
      <Campo
        id="seu_nome"
        label="Seu nome"
        placeholder="Maria Silva"
        required
        autoComplete="name"
      />
      <Campo id="cnpj" label="CNPJ (opcional)" placeholder="00.000.000/0001-00" />

      <div>
        <label
          htmlFor="timezone"
          className="block text-sm font-medium text-slate-700"
        >
          Fuso horário
        </label>
        <select
          id="timezone"
          name="timezone"
          defaultValue="America/Recife"
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        >
          {FUSOS.map(([valor, rotulo]) => (
            <option key={valor} value={valor}>
              {rotulo}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-slate-400">
          Define como horários de turno e ponto são calculados.
        </p>
      </div>

      {state.erro && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.erro}
        </p>
      )}

      <Botao />
    </form>
  );
}

function Campo({
  id,
  label,
  ...props
}: { id: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type="text"
        {...props}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      />
    </div>
  );
}
