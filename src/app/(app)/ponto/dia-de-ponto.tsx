"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { ESTADO_VAZIO } from "@/lib/form-state";
import { anularBatida, corrigirBatida, incluirBatida } from "./actions";

export type Batida = {
  id: string;
  membership_id: string;
  full_name: string;
  type: string;
  punched_at: string;
  origin: string;
  distance_m: number | null;
  atrasado: boolean;
};

export type Membro = { membership_id: string; full_name: string };

const ROTULO: Record<string, string> = {
  entrada: "Entrada",
  saida: "Saída",
  intervalo_inicio: "Início do intervalo",
  intervalo_fim: "Volta do intervalo",
};

/** `datetime-local` fala no fuso da empresa, não no do navegador do gestor. */
function paraCampoLocal(iso: string, timezone: string) {
  const partes = new Intl.DateTimeFormat("sv-SE", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
  return partes.replace(" ", "T");
}

function hora(iso: string, timezone: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export default function DiaDePonto({
  dia,
  timezone,
  membros,
  batidas,
}: {
  dia: string;
  timezone: string;
  membros: Membro[];
  batidas: Batida[];
}) {
  const porMembro = new Map<string, Batida[]>();
  for (const b of batidas) {
    porMembro.set(b.membership_id, [...(porMembro.get(b.membership_id) ?? []), b]);
  }

  return (
    <div className="space-y-3">
      {membros.map((m) => (
        <LinhaMembro
          key={m.membership_id}
          membro={m}
          batidas={porMembro.get(m.membership_id) ?? []}
          dia={dia}
          timezone={timezone}
        />
      ))}
      {membros.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-8 text-center text-sm text-slate-500">
          Nenhuma pessoa ativa na equipe.
        </p>
      )}
    </div>
  );
}

function LinhaMembro({
  membro,
  batidas,
  dia,
  timezone,
}: {
  membro: Membro;
  batidas: Batida[];
  dia: string;
  timezone: string;
}) {
  const [incluindo, setIncluindo] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-slate-900">{membro.full_name}</p>
          <p className="text-xs text-slate-500">
            {batidas.length === 0
              ? "Nenhuma batida neste dia"
              : `${batidas.length} batida(s)`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIncluindo((v) => !v)}
          className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
        >
          {incluindo ? "Cancelar" : "Incluir batida"}
        </button>
      </div>

      {incluindo && (
        <FormIncluir
          membershipId={membro.membership_id}
          dia={dia}
          aoTerminar={() => setIncluindo(false)}
        />
      )}

      {batidas.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {batidas.map((b) => (
            <li key={b.id} className="px-4 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm text-slate-800">
                    {ROTULO[b.type]}{" "}
                    <span className="tabular-nums text-slate-500">
                      às {hora(b.punched_at, timezone)}
                    </span>
                  </p>
                  <p className="text-xs text-slate-500">
                    {b.origin === "ajuste_manual" ? (
                      <span className="text-amber-700">
                        ajuste manual · sem verificação de local
                      </span>
                    ) : b.distance_m != null ? (
                      `${b.distance_m} m da unidade`
                    ) : (
                      "sem distância registrada"
                    )}
                    {b.atrasado && " · sincronizada em atraso"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditando(editando === b.id ? null : b.id)}
                  className="shrink-0 rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
                >
                  {editando === b.id ? "Fechar" : "Corrigir"}
                </button>
              </div>

              {editando === b.id && (
                <FormCorrigir
                  batida={b}
                  timezone={timezone}
                  aoTerminar={() => setEditando(null)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FormIncluir({
  membershipId,
  dia,
  aoTerminar,
}: {
  membershipId: string;
  dia: string;
  aoTerminar: () => void;
}) {
  const [state, action] = useActionState(incluirBatida, ESTADO_VAZIO);
  if (state.ok) aoTerminar();

  return (
    <form action={action} className="grid gap-3 bg-slate-50 p-4 sm:grid-cols-2">
      <input type="hidden" name="membership_id" value={membershipId} />
      <Campo label="Tipo">
        <select
          name="type"
          defaultValue="entrada"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          {Object.entries(ROTULO).map(([v, r]) => (
            <option key={v} value={v}>
              {r}
            </option>
          ))}
        </select>
      </Campo>
      <Campo label="Horário">
        <input
          type="datetime-local"
          name="punched_at"
          required
          defaultValue={`${dia}T08:00`}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
        />
      </Campo>
      <Campo label="Motivo" className="sm:col-span-2">
        <input
          name="justification"
          required
          minLength={3}
          placeholder="Esqueceu de bater na chegada"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </Campo>
      {state.erro && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">
          {state.erro}
        </p>
      )}
      <div className="sm:col-span-2">
        <Enviar rotulo="Incluir" />
      </div>
    </form>
  );
}

function FormCorrigir({
  batida,
  timezone,
  aoTerminar,
}: {
  batida: Batida;
  timezone: string;
  aoTerminar: () => void;
}) {
  const [correcao, acaoCorrigir] = useActionState(corrigirBatida, ESTADO_VAZIO);
  const [anulacao, acaoAnular] = useActionState(anularBatida, ESTADO_VAZIO);
  const erro = correcao.erro ?? anulacao.erro;
  if (correcao.ok || anulacao.ok) aoTerminar();

  return (
    <div className="mt-3 space-y-3 rounded-lg bg-slate-50 p-3">
      <form action={acaoCorrigir} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
        <input type="hidden" name="punch_id" value={batida.id} />
        <input
          type="datetime-local"
          name="punched_at"
          required
          defaultValue={paraCampoLocal(batida.punched_at, timezone)}
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm tabular-nums"
        />
        <input
          name="justification"
          required
          minLength={3}
          placeholder="Motivo da correção"
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
        />
        <Enviar rotulo="Corrigir horário" />
      </form>

      <form action={acaoAnular} className="grid gap-2 sm:grid-cols-[2fr_auto]">
        <input type="hidden" name="punch_id" value={batida.id} />
        <input
          name="justification"
          required
          minLength={3}
          placeholder="Motivo da anulação"
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
        />
        <Enviar rotulo="Anular batida" perigo />
      </form>

      {erro && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {erro}
        </p>
      )}
      <p className="text-xs text-slate-400">
        Corrigir e anular não apagam nada: criam um registro novo apontando
        para este. O original continua no histórico.
      </p>
    </div>
  );
}

function Enviar({ rotulo, perigo }: { rotulo: string; perigo?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-60 ${
        perigo
          ? "bg-red-600 text-white hover:bg-red-700"
          : "bg-blue-600 text-white hover:bg-blue-700"
      }`}
    >
      {pending ? "…" : rotulo}
    </button>
  );
}

function Campo({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-slate-600">
        {label}
      </span>
      {children}
    </label>
  );
}
