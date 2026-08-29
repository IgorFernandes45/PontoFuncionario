"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireManager } from "@/lib/auth";
import type { FormState } from "@/lib/form-state";

/**
 * Um caminho para os três casos de um dia: pôr turno, marcar folga, ou
 * limpar a exceção e voltar a seguir a escala fixa.
 */
export async function definirDia(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireManager();

  const membershipId = String(formData.get("membership_id") ?? "");
  const data = String(formData.get("work_date") ?? "");
  const valor = String(formData.get("valor") ?? ""); // turno | "folga" | "fixa"
  const locationId = String(formData.get("location_id") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_day_shift", {
    p_membership_id: membershipId,
    p_date: data,
    p_shift_key: valor === "folga" || valor === "fixa" ? undefined : valor,
    p_location_id: locationId || undefined,
    p_limpar: valor === "fixa",
  });

  if (error) return { erro: traduzir(error), ok: null };

  revalidatePath("/escala");
  revalidatePath("/minha-escala");
  return { erro: null, ok: "Escala atualizada." };
}

/** Define o padrão semanal de uma pessoa num dia-da-semana. */
export async function definirDiaFixo(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireManager();

  const membershipId = String(formData.get("membership_id") ?? "");
  const weekday = Number(formData.get("weekday"));
  const valor = String(formData.get("valor") ?? ""); // turno | "nenhum"

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_weekday_shift", {
    p_membership_id: membershipId,
    p_weekday: weekday,
    p_shift_key: valor === "nenhum" ? undefined : valor,
  });

  if (error) return { erro: traduzir(error), ok: null };

  revalidatePath("/escala");
  revalidatePath("/escala/fixa");
  revalidatePath("/minha-escala");
  return { erro: null, ok: "Padrão semanal atualizado." };
}

/** Aplica o mesmo turno de segunda a sexta de uma vez. */
export async function aplicarSegASex(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireManager();

  const membershipId = String(formData.get("membership_id") ?? "");
  const valor = String(formData.get("valor") ?? "");

  const supabase = await createClient();
  for (const weekday of [1, 2, 3, 4, 5]) {
    const { error } = await supabase.rpc("set_weekday_shift", {
      p_membership_id: membershipId,
      p_weekday: weekday,
      p_shift_key: valor === "nenhum" ? undefined : valor,
    });
    if (error) return { erro: traduzir(error), ok: null };
  }

  revalidatePath("/escala");
  revalidatePath("/escala/fixa");
  return { erro: null, ok: "Segunda a sexta aplicadas." };
}

export async function copiarSemana(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { active } = await requireManager();

  const destino = String(formData.get("destino") ?? "");
  const origem = String(formData.get("origem") ?? "");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("copy_week", {
    p_company_id: active.company_id,
    p_origem: origem,
    p_destino: destino,
  });

  if (error) return { erro: traduzir(error), ok: null };

  revalidatePath("/escala");
  return {
    erro: null,
    ok:
      data === 0
        ? "A semana anterior não tinha nenhum ajuste para repetir."
        : `${data} ajuste(s) repetidos da semana anterior.`,
  };
}

function traduzir(error: { code?: string; message: string }) {
  if (error.code === "23503") {
    return "Turno ou unidade não pertence a esta empresa.";
  }
  if (error.code === "42501") return "Você não pode alterar a escala.";
  return error.message;
}
