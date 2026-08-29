"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { copiarSemana } from "./actions";
import { ESTADO_VAZIO } from "@/lib/form-state";
import { somarDias } from "@/lib/datas";

export default function CopiarSemana({ inicio }: { inicio: string }) {
  const [state, action] = useActionState(copiarSemana, ESTADO_VAZIO);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form action={action}>
        <input type="hidden" name="destino" value={inicio} />
        <input type="hidden" name="origem" value={somarDias(inicio, -7)} />
        <Botao />
      </form>
      {state.ok && <span className="text-xs text-emerald-700">{state.ok}</span>}
      {state.erro && <span className="text-xs text-red-700">{state.erro}</span>}
    </div>
  );
}

function Botao() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
    >
      {pending ? "Repetindo…" : "Repetir ajustes da semana anterior"}
    </button>
  );
}
