"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { aceitar, type AceiteState } from "./actions";

const inicial: AceiteState = { erro: null };

function Botao({ empresa }: { empresa: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
    >
      {pending ? "Entrando…" : `Entrar na ${empresa}`}
    </button>
  );
}

export default function BotaoAceitar({
  token,
  empresa,
}: {
  token: string;
  empresa: string;
}) {
  const [state, action] = useActionState(aceitar, inicial);

  return (
    <form action={action}>
      <input type="hidden" name="token" value={token} />
      <Botao empresa={empresa} />
      {state.erro && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.erro}
        </p>
      )}
    </form>
  );
}
