"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireManager, requireWorkspace } from "@/lib/auth";
import type { FormState } from "@/lib/form-state";

/**
 * Toda correção passa por RPC. O banco é quem exige justificativa, valida a
 * sequência do dia e grava o registro novo — a tela não tem como pular etapa.
 */

export async function corrigirBatida(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireManager();

  const punchId = String(formData.get("punch_id") ?? "");
  const horario = String(formData.get("punched_at") ?? "");
  const motivo = String(formData.get("justification") ?? "").trim();

  if (!horario) return { erro: "Informe o horário correto.", ok: null };
  if (motivo.length < 3) {
    return { erro: "Escreva o motivo da correção.", ok: null };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("adjust_punch", {
    p_punch_id: punchId,
    p_punched_at: new Date(horario).toISOString(),
    p_justification: motivo,
  });

  if (error) return { erro: error.message, ok: null };

  revalidatePath("/ponto");
  return { erro: null, ok: "Horário corrigido." };
}

export async function anularBatida(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireManager();

  const punchId = String(formData.get("punch_id") ?? "");
  const motivo = String(formData.get("justification") ?? "").trim();

  if (motivo.length < 3) {
    return { erro: "Escreva o motivo da anulação.", ok: null };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("void_punch", {
    p_punch_id: punchId,
    p_justification: motivo,
  });

  if (error) return { erro: error.message, ok: null };

  revalidatePath("/ponto");
  return { erro: null, ok: "Batida anulada." };
}

export async function incluirBatida(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireManager();

  const membershipId = String(formData.get("membership_id") ?? "");
  const tipo = String(formData.get("type") ?? "");
  const horario = String(formData.get("punched_at") ?? "");
  const motivo = String(formData.get("justification") ?? "").trim();

  if (!horario) return { erro: "Informe o horário da batida.", ok: null };
  if (motivo.length < 3) {
    return { erro: "Escreva o motivo da inclusão.", ok: null };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("add_missing_punch", {
    p_membership_id: membershipId,
    p_type: tipo as "entrada" | "saida" | "intervalo_inicio" | "intervalo_fim",
    p_punched_at: new Date(horario).toISOString(),
    p_justification: motivo,
  });

  if (error) return { erro: error.message, ok: null };

  revalidatePath("/ponto");
  return { erro: null, ok: "Batida incluída." };
}

export async function decidirSolicitacao(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireManager();

  const id = String(formData.get("request_id") ?? "");
  const aprovar = String(formData.get("aprovar") ?? "") === "1";
  const nota = String(formData.get("nota") ?? "").trim();

  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_punch_request", {
    p_request_id: id,
    p_aprovar: aprovar,
    p_nota: nota || undefined,
  });

  if (error) return { erro: error.message, ok: null };

  revalidatePath("/ponto");
  revalidatePath("/bater-ponto");
  return {
    erro: null,
    ok: aprovar ? "Aprovada e já registrada." : "Solicitação recusada.",
  };
}

/** O funcionário não corrige: pede. Quem decide é a gestão. */
export async function pedirCorrecao(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { active } = await requireWorkspace();

  const tipo = String(formData.get("type") ?? "");
  const horario = String(formData.get("punched_at") ?? "");
  const motivo = String(formData.get("reason") ?? "").trim();

  if (!horario) return { erro: "Informe o horário da batida.", ok: null };
  if (motivo.length < 3) {
    return { erro: "Explique o que aconteceu.", ok: null };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: membership } = await supabase
    .from("memberships")
    .select("id")
    .eq("user_id", user!.id)
    .eq("company_id", active.company_id)
    .eq("status", "ativo")
    .maybeSingle();

  if (!membership) return { erro: "Vínculo não encontrado.", ok: null };

  const { error } = await supabase.from("punch_requests").insert({
    company_id: active.company_id,
    membership_id: membership.id,
    kind: "inclusao",
    requested_type: tipo as
      | "entrada"
      | "saida"
      | "intervalo_inicio"
      | "intervalo_fim",
    requested_at: new Date(horario).toISOString(),
    reason: motivo,
  });

  if (error) return { erro: error.message, ok: null };

  revalidatePath("/bater-ponto");
  return {
    erro: null,
    ok: "Pedido enviado. Quem administra vai avaliar.",
  };
}
