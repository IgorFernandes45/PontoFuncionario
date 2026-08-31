"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { ESTADO_VAZIO } from "@/lib/form-state";
import { decidirSolicitacao } from "./actions";

export type Solicitacao = {
  id: string;
  membership_id: string;
  kind: string;
  requested_type: string | null;
  requested_at: string | null;
  reason: string;
  created_at: string;
  nome?: string;
};

const ROTULO: Record<string, string> = {
  entrada: "Entrada",
  saida: "Saída",
  intervalo_inicio: "Início do intervalo",
  intervalo_fim: "Volta do intervalo",
};

export default function Solicitacoes({
  pedidos,
  timezone,
}: {
  pedidos: Solicitacao[];
  timezone: string;
}) {
  return (
    <section className="mb-5 rounded-xl border border-amber-200 bg-amber-50">
      <h2 className="border-b border-amber-200 px-4 py-3 text-sm font-medium text-amber-900">
        {pedidos.length} pedido(s) de correção esperando decisão
      </h2>
      <ul className="divide-y divide-amber-200">
        {pedidos.map((p) => (
          <Pedido key={p.id} pedido={p} timezone={timezone} />
        ))}
      </ul>
    </section>
  );
}

function Pedido({
  pedido,
  timezone,
}: {
  pedido: Solicitacao;
  timezone: string;
}) {
  const [state, action] = useActionState(decidirSolicitacao, ESTADO_VAZIO);

  const quando = pedido.requested_at
    ? new Intl.DateTimeFormat("pt-BR", {
        timeZone: timezone,
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(pedido.requested_at))
    : "—";

  return (
    <li className="px-4 py-3">
      <p className="text-sm text-amber-900">
        <span className="font-medium">{pedido.nome}</span> pede a inclusão de{" "}
        <span className="font-medium">
          {ROTULO[pedido.requested_type ?? ""] ?? pedido.requested_type}
        </span>{" "}
        em <span className="tabular-nums">{quando}</span>
      </p>
      <p className="mt-1 text-sm text-amber-800">&ldquo;{pedido.reason}&rdquo;</p>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <form action={action} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="request_id" value={pedido.id} />
          <input
            name="nota"
            placeholder="Observação (opcional)"
            className="rounded-lg border border-amber-300 bg-white px-2 py-1.5 text-xs"
          />
          <Botao valor="1" rotulo="Aprovar e registrar" />
          <Botao valor="0" rotulo="Recusar" recusa />
        </form>
      </div>

      {state.erro && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          {state.erro}
        </p>
      )}
      {state.ok && (
        <p className="mt-2 text-xs text-emerald-800">{state.ok}</p>
      )}
    </li>
  );
}

function Botao({
  valor,
  rotulo,
  recusa,
}: {
  valor: string;
  rotulo: string;
  recusa?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name="aprovar"
      value={valor}
      disabled={pending}
      className={`rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-60 ${
        recusa
          ? "border border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
          : "bg-emerald-600 text-white hover:bg-emerald-700"
      }`}
    >
      {pending ? "…" : rotulo}
    </button>
  );
}
