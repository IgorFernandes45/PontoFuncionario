"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { ESTADO_VAZIO } from "@/lib/form-state";
import { enviarAvisos, excluirEmpresa } from "./actions";

export default function PainelDados({
  nomeEmpresa,
  avisosPendentes,
  emailConfigurado,
}: {
  nomeEmpresa: string;
  avisosPendentes: number;
  emailConfigurado: boolean;
}) {
  const [avisos, acaoAvisos] = useActionState(enviarAvisos, ESTADO_VAZIO);
  const [exclusao, acaoExcluir] = useActionState(excluirEmpresa, ESTADO_VAZIO);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);

  return (
    <div className="max-w-2xl space-y-5">
      {/* ---------- avisos ---------- */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-medium text-slate-900">
          Avisar quem teve a escala mudada
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Um aviso por pessoa, não um por turno alterado.
        </p>

        {!emailConfigurado && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            O envio de e-mail ainda não está configurado. Os avisos ficam
            guardados na fila e saem assim que{" "}
            <code className="rounded bg-white px-1 text-xs">RESEND_API_KEY</code>{" "}
            e{" "}
            <code className="rounded bg-white px-1 text-xs">EMAIL_REMETENTE</code>{" "}
            forem definidos.
          </p>
        )}

        <p className="mt-3 text-sm text-slate-700">
          {avisosPendentes === 0
            ? "Nenhum aviso na fila."
            : `${avisosPendentes} aviso(s) esperando envio.`}
        </p>

        <form action={acaoAvisos} className="mt-3">
          <Botao rotulo="Gerar e enviar avisos" pendenteRotulo="Enviando…" />
        </form>

        {avisos.ok && (
          <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {avisos.ok}
          </p>
        )}
        {avisos.erro && (
          <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {avisos.erro}
          </p>
        )}
      </section>

      {/* ---------- exportação ---------- */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-medium text-slate-900">
          Exportar tudo o que a empresa gerou
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Equipe, turnos, unidades, escala, ponto, ausências e auditoria, num
          arquivo JSON. É seu direito levar os dados embora.
        </p>
        <a
          href="/api/exportar"
          className="mt-3 inline-block rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          Baixar exportação
        </a>
      </section>

      {/* ---------- exclusão ---------- */}
      <section className="rounded-xl border border-red-200 bg-white p-5">
        <h2 className="text-sm font-medium text-red-900">Apagar a empresa</h2>
        <p className="mt-1 text-sm text-slate-600">
          Remove a empresa, a equipe, a escala, todo o histórico de ponto e os
          arquivos enviados. <strong>Não há como desfazer.</strong> Exporte
          antes se for precisar dos dados.
        </p>

        {!confirmandoExclusao ? (
          <button
            type="button"
            onClick={() => setConfirmandoExclusao(true)}
            className="mt-3 rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
          >
            Quero apagar
          </button>
        ) : (
          <form action={acaoExcluir} className="mt-3 space-y-2">
            <label htmlFor="confirmacao" className="block text-sm text-slate-700">
              Digite <strong>{nomeEmpresa}</strong> para confirmar:
            </label>
            <input
              id="confirmacao"
              name="confirmacao"
              required
              autoComplete="off"
              className="w-full rounded-lg border border-red-300 px-3 py-2 text-sm"
            />
            <div className="flex items-center gap-2">
              <Botao
                rotulo="Apagar definitivamente"
                pendenteRotulo="Apagando…"
                perigo
              />
              <button
                type="button"
                onClick={() => setConfirmandoExclusao(false)}
                className="rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:text-slate-800"
              >
                Cancelar
              </button>
            </div>
            {exclusao.erro && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {exclusao.erro}
              </p>
            )}
          </form>
        )}
      </section>
    </div>
  );
}

function Botao({
  rotulo,
  pendenteRotulo,
  perigo,
}: {
  rotulo: string;
  pendenteRotulo: string;
  perigo?: boolean;
}) {
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
      {pending ? pendenteRotulo : rotulo}
    </button>
  );
}
