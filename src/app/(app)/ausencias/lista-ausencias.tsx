"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { ESTADO_VAZIO } from "@/lib/form-state";
import { salvarAusencia, excluirAusencia } from "./actions";
import { createClient } from "@/lib/supabase/client";

export type MembroSimples = { membership_id: string; full_name: string };

export type Ausencia = {
  id: string;
  membership_id: string | null;
  kind: string;
  starts_on: string;
  ends_on: string;
  note: string | null;
  attachment_path: string | null;
};

const TIPOS: [string, string][] = [
  ["atestado", "Atestado médico"],
  ["ferias", "Férias"],
  ["folga", "Folga combinada"],
  ["feriado", "Feriado (empresa toda)"],
  ["falta_justificada", "Falta justificada"],
  ["outro", "Outro"],
];

const ROTULO = Object.fromEntries(TIPOS);

function dataBR(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  }).format(new Date(`${iso}T12:00:00Z`));
}

export default function ListaAusencias({
  ausencias,
  membros,
  hoje,
  companyId,
}: {
  ausencias: Ausencia[];
  membros: MembroSimples[];
  hoje: string;
  companyId: string;
}) {
  const [state, action] = useActionState(salvarAusencia, ESTADO_VAZIO);
  const [tipo, setTipo] = useState("atestado");
  const [anexo, setAnexo] = useState<string>("");
  const [enviandoAnexo, setEnviandoAnexo] = useState(false);
  const [erroAnexo, setErroAnexo] = useState<string | null>(null);

  /** O arquivo sobe direto para o bucket; o formulário só carrega o caminho. */
  async function enviarAnexo(arquivo: File) {
    setErroAnexo(null);
    setEnviandoAnexo(true);
    const extensao = arquivo.name.split(".").pop()?.toLowerCase() ?? "bin";
    const caminho = `${companyId}/${crypto.randomUUID()}.${extensao}`;
    const supabase = createClient();
    const { error } = await supabase.storage
      .from("anexos")
      .upload(caminho, arquivo, { contentType: arquivo.type });
    setEnviandoAnexo(false);
    if (error) {
      setErroAnexo(error.message);
      return;
    }
    setAnexo(caminho);
  }
  const nomePorId = new Map(membros.map((m) => [m.membership_id, m.full_name]));

  return (
    <div className="space-y-5">
      <form
        action={action}
        className="grid gap-3 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-2"
      >
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">
            Tipo
          </span>
          <select
            name="kind"
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            {TIPOS.map(([v, r]) => (
              <option key={v} value={v}>
                {r}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">
            Quem
          </span>
          <select
            name="membership_id"
            disabled={tipo === "feriado"}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-400"
          >
            {tipo === "feriado" ? (
              <option value="">Empresa toda</option>
            ) : (
              membros.map((m) => (
                <option key={m.membership_id} value={m.membership_id}>
                  {m.full_name}
                </option>
              ))
            )}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">
            De
          </span>
          <input
            type="date"
            name="starts_on"
            required
            defaultValue={hoje}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">
            Até
          </span>
          <input
            type="date"
            name="ends_on"
            required
            defaultValue={hoje}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
          />
        </label>

        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs font-medium text-slate-600">
            Observação (opcional)
          </span>
          <input
            name="note"
            placeholder="Atestado de 3 dias"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <div className="sm:col-span-2">
          <span className="mb-1 block text-xs font-medium text-slate-600">
            Anexo (opcional)
          </span>
          <input type="hidden" name="attachment_path" value={anexo} />
          <label className="flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-50">
            <input
              type="file"
              accept="image/*,application/pdf"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void enviarAnexo(f);
              }}
            />
            {enviandoAnexo
              ? "Enviando…"
              : anexo
                ? "Arquivo anexado"
                : "Anexar atestado (foto ou PDF)"}
          </label>
          {erroAnexo && (
            <p className="mt-1 text-xs text-red-700">{erroAnexo}</p>
          )}
          <p className="mt-1 text-xs text-slate-400">
            Fica num bucket privado, visível só para quem administra.
          </p>
        </div>

        {state.erro && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">
            {state.erro}
          </p>
        )}
        {state.ok && (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 sm:col-span-2">
            {state.ok}
          </p>
        )}

        <div className="sm:col-span-2">
          <Salvar />
        </div>
      </form>

      {ausencias.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-8 text-center text-sm text-slate-500">
          Nenhuma ausência registrada este ano.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {ausencias.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm text-slate-900">
                  {a.membership_id
                    ? (nomePorId.get(a.membership_id) ?? "—")
                    : "Empresa toda"}
                  <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                    {ROTULO[a.kind] ?? a.kind}
                  </span>
                </p>
                <p className="text-xs tabular-nums text-slate-500">
                  {dataBR(a.starts_on)}
                  {a.ends_on !== a.starts_on && ` até ${dataBR(a.ends_on)}`}
                  {a.note && ` · ${a.note}`}
                </p>
                {a.attachment_path && <VerAnexo caminho={a.attachment_path} />}
              </div>
              <form action={excluirAusencia}>
                <input type="hidden" name="id" value={a.id} />
                <button className="rounded-lg px-2.5 py-1 text-xs text-red-600 hover:bg-red-50">
                  Remover
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function VerAnexo({ caminho }: { caminho: string }) {
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Bucket privado: o link é assinado na hora e vale poucos minutos.
  async function abrir() {
    setCarregando(true);
    setErro(null);
    const supabase = createClient();
    const { data, error } = await supabase.storage
      .from("anexos")
      .createSignedUrl(caminho, 120);
    setCarregando(false);
    if (error || !data) {
      setErro("Não foi possível abrir o anexo.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        disabled={carregando}
        className="mt-0.5 text-xs text-blue-600 underline-offset-2 hover:underline disabled:opacity-60"
      >
        {carregando ? "Abrindo…" : "Ver anexo"}
      </button>
      {erro && <span className="ml-2 text-xs text-red-700">{erro}</span>}
    </>
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
      {pending ? "Salvando…" : "Registrar ausência"}
    </button>
  );
}
