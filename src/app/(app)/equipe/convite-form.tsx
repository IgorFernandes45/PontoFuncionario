"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { convidar, type ConviteState } from "./actions";

const inicial: ConviteState = { erro: null, ok: null, link: null };

function Botao() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
    >
      {pending ? "Enviando…" : "Convidar"}
    </button>
  );
}

export default function ConviteForm({
  podeConvidarGerente,
}: {
  podeConvidarGerente: boolean;
}) {
  const [state, action] = useActionState(convidar, inicial);
  const [copiado, setCopiado] = useState(false);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-medium text-slate-900">
        Convidar para a equipe
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        A pessoa recebe um e-mail e entra sem senha, com o próprio acesso.
      </p>

      <form action={action} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto]">
        <input
          name="full_name"
          required
          placeholder="Nome"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
        <input
          name="email"
          type="email"
          required
          placeholder="email@exemplo.com"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
        <select
          name="role"
          defaultValue="funcionario"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
        >
          <option value="funcionario">Funcionário</option>
          {podeConvidarGerente && <option value="gerente">Gerente</option>}
        </select>
        <Botao />
      </form>

      {state.erro && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.erro}
        </p>
      )}

      {state.ok && (
        <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <p>{state.ok}</p>
          {state.link && (
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-white px-2 py-1 text-xs text-slate-700">
                {state.link}
              </code>
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(state.link!);
                  setCopiado(true);
                  setTimeout(() => setCopiado(false), 2000);
                }}
                className="shrink-0 rounded-lg border border-emerald-300 px-2 py-1 text-xs text-emerald-800 hover:bg-emerald-100"
              >
                {copiado ? "Copiado" : "Copiar"}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
