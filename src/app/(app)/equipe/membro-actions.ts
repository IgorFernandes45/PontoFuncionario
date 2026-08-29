"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireManager } from "@/lib/auth";
import type { AppRole, MemberStatus } from "@/lib/types";
import type { FormState } from "@/lib/form-state";

/**
 * As três ações abaixo passam por RPC, não por UPDATE direto: `authenticated`
 * não escreve em `audit_log`, e mudança de papel sem rastro é exatamente o
 * que não pode acontecer. A RPC também é quem aplica o teto de privilégio.
 */

export async function alterarPapel(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireManager();

  const id = String(formData.get("membership_id") ?? "");
  const role = String(formData.get("role") ?? "") as AppRole;

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_member_role", {
    p_membership_id: id,
    p_role: role,
  });

  if (error) return { erro: traduzir(error.message), ok: null };

  revalidatePath("/equipe");
  return { erro: null, ok: "Papel atualizado." };
}

export async function alterarStatus(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireManager();

  const id = String(formData.get("membership_id") ?? "");
  const status = String(formData.get("status") ?? "") as MemberStatus;

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_member_status", {
    p_membership_id: id,
    p_status: status,
  });

  if (error) return { erro: traduzir(error.message), ok: null };

  revalidatePath("/equipe");
  return {
    erro: null,
    ok: status === "inativo" ? "Membro desativado." : "Membro reativado.",
  };
}

export async function removerMembro(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireManager();

  const id = String(formData.get("membership_id") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_member", {
    p_membership_id: id,
  });

  if (error) return { erro: traduzir(error.message), ok: null };

  revalidatePath("/equipe");
  return { erro: null, ok: "Membro removido." };
}

/** O banco fala em português nessas exceções; o resto vira algo legível. */
function traduzir(mensagem: string) {
  if (mensagem.includes("pelo menos um dono")) {
    return "A empresa precisa de pelo menos um dono ativo.";
  }
  return mensagem;
}
