"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireManager } from "@/lib/auth";
import type { FormState } from "@/lib/form-state";

type Kind =
  | "atestado"
  | "ferias"
  | "folga"
  | "feriado"
  | "falta_justificada"
  | "outro";

export async function salvarAusencia(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { active } = await requireManager();

  const kind = String(formData.get("kind") ?? "") as Kind;
  const membershipId = String(formData.get("membership_id") ?? "");
  const inicio = String(formData.get("starts_on") ?? "");
  const fim = String(formData.get("ends_on") ?? "");
  const nota = String(formData.get("note") ?? "").trim();
  const anexo = String(formData.get("attachment_path") ?? "").trim();

  if (!inicio || !fim) return { erro: "Informe o período.", ok: null };
  if (fim < inicio) {
    return { erro: "A data final não pode ser antes da inicial.", ok: null };
  }

  // Feriado vale para todo mundo; o resto é de alguém. A mesma regra está no
  // banco como CHECK — aqui é só para a mensagem sair legível.
  if (kind !== "feriado" && !membershipId) {
    return { erro: "Escolha de quem é a ausência.", ok: null };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("absences").insert({
    company_id: active.company_id,
    membership_id: kind === "feriado" ? null : membershipId,
    kind,
    starts_on: inicio,
    ends_on: fim,
    note: nota || null,
    attachment_path: anexo || null,
  });

  if (error) return { erro: error.message, ok: null };

  revalidatePath("/ausencias");
  return { erro: null, ok: "Ausência registrada." };
}

export async function excluirAusencia(formData: FormData) {
  await requireManager();
  const id = String(formData.get("id") ?? "");

  const supabase = await createClient();
  await supabase.from("absences").delete().eq("id", id);

  revalidatePath("/ausencias");
}
