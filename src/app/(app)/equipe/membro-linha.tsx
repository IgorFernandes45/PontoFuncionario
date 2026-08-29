"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { alterarPapel, alterarStatus, removerMembro } from "./membro-actions";
import { ESTADO_VAZIO } from "@/lib/form-state";
import { ROLE_LABEL, type AppRole, type MemberStatus } from "@/lib/types";

export type Membro = {
  membership_id: string;
  full_name: string;
  email: string;
  role: AppRole;
  status: MemberStatus;
  sou_eu: boolean;
};

export default function MembroLinha({
  membro,
  souDono,
}: {
  membro: Membro;
  souDono: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  const [papelState, papelAction] = useActionState(alterarPapel, ESTADO_VAZIO);
  const [statusState, statusAction] = useActionState(alterarStatus, ESTADO_VAZIO);
  const [remocaoState, remocaoAction] = useActionState(removerMembro, ESTADO_VAZIO);

  const erro = papelState.erro ?? statusState.erro ?? remocaoState.erro;
  const inativo = membro.status === "inativo";

  // O gerente só mexe em funcionário — a mesma regra do banco. Oferecer o
  // botão que a policy vai recusar é pior que não oferecer.
  const podeGerir =
    !membro.sou_eu && (souDono || membro.role === "funcionario");

  return (
    <li className="px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p
            className={`truncate text-sm font-medium ${
              inativo ? "text-slate-400" : "text-slate-900"
            }`}
          >
            {membro.full_name}
            {membro.sou_eu && (
              <span className="ml-2 text-xs font-normal text-slate-400">
                você
              </span>
            )}
          </p>
          <p className="truncate text-xs text-slate-500">{membro.email}</p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Etiqueta texto={ROLE_LABEL[membro.role]} />
          {inativo && <Etiqueta texto="Inativo" alerta />}
          {podeGerir && (
            <button
              type="button"
              onClick={() => setAberto((v) => !v)}
              aria-expanded={aberto}
              className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
            >
              {aberto ? "Fechar" : "Gerenciar"}
            </button>
          )}
        </div>
      </div>

      {aberto && podeGerir && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-3">
          {souDono && (
            <form action={papelAction} className="flex items-center gap-2">
              <input
                type="hidden"
                name="membership_id"
                value={membro.membership_id}
              />
              <label htmlFor={`papel-${membro.membership_id}`} className="text-xs text-slate-600">
                Papel
              </label>
              <select
                id={`papel-${membro.membership_id}`}
                name="role"
                defaultValue={membro.role}
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
              >
                <option value="funcionario">Funcionário</option>
                <option value="gerente">Gerente</option>
                <option value="dono">Dono</option>
              </select>
              <Enviar rotulo="Salvar" />
            </form>
          )}

          <form action={statusAction}>
            <input
              type="hidden"
              name="membership_id"
              value={membro.membership_id}
            />
            <input
              type="hidden"
              name="status"
              value={inativo ? "ativo" : "inativo"}
            />
            <Enviar rotulo={inativo ? "Reativar" : "Desativar"} />
          </form>

          {confirmando ? (
            <form action={remocaoAction} className="flex items-center gap-2">
              <input
                type="hidden"
                name="membership_id"
                value={membro.membership_id}
              />
              <span className="text-xs text-slate-600">
                Remover {membro.full_name}?
              </span>
              <Enviar rotulo="Sim, remover" perigo />
              <button
                type="button"
                onClick={() => setConfirmando(false)}
                className="rounded-md px-2 py-1 text-xs text-slate-500 hover:text-slate-800"
              >
                Cancelar
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmando(true)}
              className="rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50"
            >
              Remover
            </button>
          )}

          <p className="basis-full text-xs text-slate-400">
            Desativar tira o acesso e mantém o histórico. Remover apaga o
            vínculo — só use com quem nunca trabalhou.
          </p>
        </div>
      )}

      {erro && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          {erro}
        </p>
      )}
    </li>
  );
}

function Enviar({ rotulo, perigo }: { rotulo: string; perigo?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`rounded-md px-2.5 py-1 text-xs font-medium disabled:opacity-60 ${
        perigo
          ? "bg-red-600 text-white hover:bg-red-700"
          : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
      }`}
    >
      {pending ? "…" : rotulo}
    </button>
  );
}

function Etiqueta({ texto, alerta }: { texto: string; alerta?: boolean }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs ${
        alerta ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"
      }`}
    >
      {texto}
    </span>
  );
}
