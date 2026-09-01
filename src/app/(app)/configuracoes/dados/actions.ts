"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { requireWorkspace, ACTIVE_COMPANY_COOKIE } from "@/lib/auth";
import { escoarFilaDeEmail } from "@/lib/email";
import { log, seguro } from "@/lib/log";
import type { FormState } from "@/lib/form-state";

export async function enviarAvisos(
  _prev: FormState,
  _formData: FormData,
): Promise<FormState> {
  const { active } = await requireWorkspace();
  if (active.role !== "dono") {
    return { erro: "Só o dono envia os avisos.", ok: null };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("queue_schedule_notices", {
    p_company_id: active.company_id,
  });
  if (error) return { erro: error.message, ok: null };

  const r = await escoarFilaDeEmail(active.company_id);

  revalidatePath("/configuracoes/dados");

  if (!r.configurado) {
    return {
      erro: null,
      ok: `${r.pendentes} aviso(s) na fila. O envio ainda não está configurado — defina RESEND_API_KEY e EMAIL_REMETENTE para que saiam.`,
    };
  }

  return {
    erro: null,
    ok: `${r.enviados} enviado(s)${r.falhas > 0 ? `, ${r.falhas} falharam` : ""}.`,
  };
}

/**
 * Exclusão de conta (LGPD, art. 18). O banco apaga em cascata, mas os
 * arquivos do Storage não têm cascata — precisam ser removidos aqui, antes.
 */
export async function excluirEmpresa(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { active } = await requireWorkspace();
  if (active.role !== "dono") {
    return { erro: "Só o dono apaga a empresa.", ok: null };
  }

  const confirmacao = String(formData.get("confirmacao") ?? "").trim();
  if (confirmacao !== active.company_name) {
    return {
      erro: "Digite o nome exato da empresa para confirmar.",
      ok: null,
    };
  }

  const admin = createAdminClient();

  for (const bucket of ["selfies", "anexos"] as const) {
    try {
      const { data: arquivos } = await admin.storage
        .from(bucket)
        .list(active.company_id, { limit: 1000 });

      // As selfies ficam em company/membership/arquivo: uma pasta a mais.
      const caminhos: string[] = [];
      for (const item of arquivos ?? []) {
        if (item.id === null) {
          const { data: dentro } = await admin.storage
            .from(bucket)
            .list(`${active.company_id}/${item.name}`, { limit: 1000 });
          for (const f of dentro ?? []) {
            caminhos.push(`${active.company_id}/${item.name}/${f.name}`);
          }
        } else {
          caminhos.push(`${active.company_id}/${item.name}`);
        }
      }

      if (caminhos.length > 0) {
        await admin.storage.from(bucket).remove(caminhos);
      }
    } catch (e) {
      // Falhar aqui deixaria arquivo órfão, mas travar a exclusão seria pior:
      // o direito de eliminação não pode depender do Storage responder.
      log.erro("exclusao.storage", { bucket, detalhe: seguro(e) });
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_company", {
    p_company_id: active.company_id,
    p_confirmacao: confirmacao,
  });

  if (error) return { erro: error.message, ok: null };

  log.info("empresa.excluida", { company: active.company_id });

  const cookieStore = await cookies();
  cookieStore.delete(ACTIVE_COMPANY_COOKIE);
  redirect("/");
}
