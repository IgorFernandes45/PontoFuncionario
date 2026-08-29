"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { salvarTurno, excluirTurno, alternarTurno } from "../actions";
import { ESTADO_VAZIO } from "@/lib/form-state";

export type Turno = {
  id: string;
  key: string;
  label: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  color: string;
  active: boolean;
};

/** Mesma conta do banco: `time` é módulo 24h, então nada de somar 24 horas. */
function duracaoMinutos(inicio: string, fim: string) {
  const [hi, mi] = inicio.split(":").map(Number);
  const [hf, mf] = fim.split(":").map(Number);
  return ((hf * 60 + mf - (hi * 60 + mi) + 1440) % 1440) || 0;
}

function formatarHoras(minutos: number) {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

function hhmm(t: string) {
  return t.slice(0, 5);
}

export default function TurnosLista({ turnos }: { turnos: Turno[] }) {
  const [editando, setEditando] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-slate-900">
            Turnos da empresa
          </h2>
          <p className="text-xs text-slate-500">
            O intervalo é descontado das horas previstas na escala.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setCriando((v) => !v);
            setEditando(null);
          }}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          {criando ? "Cancelar" : "Novo turno"}
        </button>
      </div>

      {criando && (
        <TurnoForm aoTerminar={() => setCriando(false)} />
      )}

      {turnos.length === 0 && !criando && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
          <p className="text-sm font-medium text-slate-700">
            Nenhum turno cadastrado
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Sem turno não há escala. Crie pelo menos um.
          </p>
        </div>
      )}

      <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {turnos.map((t) => {
          const bruto = duracaoMinutos(hhmm(t.start_time), hhmm(t.end_time));
          const liquido = bruto - t.break_minutes;
          const viraODia = hhmm(t.end_time) <= hhmm(t.start_time);

          return (
            <li key={t.id} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="h-8 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: t.color }}
                  />
                  <div className="min-w-0">
                    <p
                      className={`truncate text-sm font-medium ${
                        t.active ? "text-slate-900" : "text-slate-400"
                      }`}
                    >
                      {t.label}
                      {!t.active && (
                        <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-500">
                          inativo
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-slate-500 tabular-nums">
                      {hhmm(t.start_time)}–{hhmm(t.end_time)}
                      {viraODia && (
                        <span className="ml-1 text-slate-400">(vira o dia)</span>
                      )}
                      {" · "}
                      {t.break_minutes > 0
                        ? `${t.break_minutes} min de intervalo · ${formatarHoras(liquido)} líquidas`
                        : `sem intervalo · ${formatarHoras(bruto)}`}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setEditando(editando === t.id ? null : t.id);
                      setCriando(false);
                    }}
                    className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
                  >
                    {editando === t.id ? "Fechar" : "Editar"}
                  </button>
                  <form action={alternarTurno}>
                    <input type="hidden" name="id" value={t.id} />
                    <input type="hidden" name="ativar" value={t.active ? "0" : "1"} />
                    <button className="rounded-lg px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-50">
                      {t.active ? "Desativar" : "Reativar"}
                    </button>
                  </form>
                </div>
              </div>

              {editando === t.id && (
                <div className="mt-3">
                  <TurnoForm turno={t} aoTerminar={() => setEditando(null)} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TurnoForm({
  turno,
  aoTerminar,
}: {
  turno?: Turno;
  aoTerminar: () => void;
}) {
  const [state, action] = useActionState(salvarTurno, ESTADO_VAZIO);
  // Formulário aberto depois de salvar convida a criar duplicata: os campos
  // controlados guardam o valor anterior enquanto os não-controlados zeram.
  useEffect(() => {
    if (state.ok) aoTerminar();
  }, [state.ok, aoTerminar]);

  const [exclusao, exclusaoAction] = useActionState(excluirTurno, ESTADO_VAZIO);

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <form action={action} className="grid gap-3 sm:grid-cols-2">
        {turno && <input type="hidden" name="id" value={turno.id} />}

        <Campo label="Nome" className="sm:col-span-2">
          <input
            name="label"
            required
            defaultValue={turno?.label}
            placeholder="Manhã"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </Campo>

        <Campo label="Entrada">
          <input
            type="time"
            name="start_time"
            required
            defaultValue={turno ? hhmm(turno.start_time) : "08:00"}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
          />
        </Campo>

        <Campo label="Saída">
          <input
            type="time"
            name="end_time"
            required
            defaultValue={turno ? hhmm(turno.end_time) : "17:00"}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
          />
        </Campo>

        <Campo label="Intervalo (minutos)">
          <input
            type="number"
            name="break_minutes"
            min={0}
            step={5}
            defaultValue={turno?.break_minutes ?? 60}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
          />
        </Campo>

        <Campo label="Cor">
          <input
            type="color"
            name="color"
            defaultValue={turno?.color ?? "#2f5bff"}
            className="h-10 w-full rounded-lg border border-slate-300 bg-white px-1"
          />
        </Campo>

        {state.erro && (
          <p className="sm:col-span-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {state.erro}
          </p>
        )}
        {exclusao.erro && (
          <p className="sm:col-span-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {exclusao.erro}
          </p>
        )}

        <div className="flex items-center gap-2 sm:col-span-2">
          <Salvar />
          <button
            type="button"
            onClick={aoTerminar}
            className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:text-slate-800"
          >
            Fechar
          </button>
        </div>
      </form>

      {turno && (
        <form action={exclusaoAction} className="mt-2 border-t border-slate-200 pt-2">
          <input type="hidden" name="id" value={turno.id} />
          <button className="text-xs text-red-600 hover:underline">
            Excluir este turno
          </button>
        </form>
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
      {pending ? "Salvando…" : "Salvar"}
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
