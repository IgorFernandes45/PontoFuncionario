"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { ESTADO_VAZIO } from "@/lib/form-state";
import { pedirCorrecao } from "../ponto/actions";

const TIPOS: [string, string][] = [
  ["entrada", "Entrada"],
  ["saida", "Saída"],
  ["intervalo_inicio", "Início do intervalo"],
  ["intervalo_fim", "Volta do intervalo"],
];

export default function PedirCorrecao({ hoje }: { hoje: string }) {
  const [aberto, setAberto] = useState(false);
  const [state, action] = useActionState(pedirCorrecao, ESTADO_VAZIO);

  return (
    <section className="mt-6">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="text-sm text-blue-600 underline-offset-2 hover:underline"
      >
        {aberto ? "Fechar" : "Esqueci de bater uma batida"}
      </button>

      {aberto && (
        <form
          action={action}
          className="mt-3 grid gap-3 rounded-xl border border-slate-200 bg-white p-4"
        >
          <p className="text-xs text-slate-500">
            Você não registra ponto para trás por conta própria. O pedido vai
            para quem administra decidir.
          </p>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">
              Qual batida
            </span>
            <select
              name="type"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              {TIPOS.map(([v, r]) => (
                <option key={v} value={v}>{r}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">
              Quando foi
            </span>
            <input
              type="datetime-local"
              name="punched_at"
              required
              defaultValue={`${hoje}T08:00`}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">
              O que aconteceu
            </span>
            <input
              name="reason"
              required
              minLength={3}
              placeholder="Celular sem bateria na hora da entrada"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

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

          <Enviar />
        </form>
      )}
    </section>
  );
}

function Enviar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="justify-self-start rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
    >
      {pending ? "Enviando…" : "Enviar pedido"}
    </button>
  );
}
