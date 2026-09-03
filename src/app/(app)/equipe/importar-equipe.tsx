"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { importarEquipe } from "./importar-actions";
import { IMPORTACAO_VAZIA } from "./importacao-estado";

const OK = new Set(["convidado"]);

export default function ImportarEquipe() {
  const [aberto, setAberto] = useState(false);
  const [state, action] = useActionState(importarEquipe, IMPORTACAO_VAZIA);

  const convidados = state.linhas.filter((l) => OK.has(l.resultado)).length;
  const recusados = state.linhas.length - convidados;

  return (
    <section className="mt-3">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="text-sm text-blue-600 underline-offset-2 hover:underline"
      >
        {aberto ? "Fechar importação" : "Convidar vários de uma vez"}
      </button>

      {aberto && (
        <form
          action={action}
          className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-white p-4"
        >
          <div>
            <label
              htmlFor="lista"
              className="block text-sm font-medium text-slate-700"
            >
              Cole a lista da equipe
            </label>
            <p className="mt-0.5 text-xs text-slate-500">
              Uma pessoa por linha: nome, e-mail e, se quiser, o papel. Serve
              copiar direto de uma planilha.
            </p>
            <textarea
              id="lista"
              name="lista"
              rows={6}
              required
              placeholder={
                "Carla Souza;carla@padaria.com.br\nBruno Lima;bruno@padaria.com.br;gerente\nrenata@padaria.com.br"
              }
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs"
            />
          </div>

          {state.erro && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {state.erro}
            </p>
          )}

          {state.linhas.length > 0 && (
            <div className="rounded-lg border border-slate-200">
              <p className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {convidados} convidado(s)
                {recusados > 0 && `, ${recusados} não`}
              </p>
              <ul className="max-h-48 divide-y divide-slate-100 overflow-y-auto">
                {state.linhas.map((l, i) => (
                  <li
                    key={`${l.email}-${i}`}
                    className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs"
                  >
                    <span className="truncate text-slate-700">{l.email}</span>
                    <span
                      className={`shrink-0 ${
                        OK.has(l.resultado)
                          ? "text-emerald-700"
                          : "text-amber-700"
                      }`}
                    >
                      {l.resultado}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
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
      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
    >
      {pending ? "Importando…" : "Importar e convidar"}
    </button>
  );
}
