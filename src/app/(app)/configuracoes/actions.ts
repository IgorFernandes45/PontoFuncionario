"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireManager, requireWorkspace } from "@/lib/auth";
import type { FormState } from "@/lib/form-state";

// ============================================================
// TURNOS
// ============================================================

export async function salvarTurno(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { active } = await requireManager();

  const id = String(formData.get("id") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  const start = String(formData.get("start_time") ?? "");
  const end = String(formData.get("end_time") ?? "");
  const breakMinutes = Number(formData.get("break_minutes") ?? 0);
  const color = String(formData.get("color") ?? "#2f5bff");

  if (!label) return { erro: "Dê um nome ao turno.", ok: null };
  if (!start || !end) return { erro: "Informe entrada e saída.", ok: null };
  if (start === end) {
    return { erro: "Entrada e saída não podem ser iguais.", ok: null };
  }
  if (!Number.isInteger(breakMinutes) || breakMinutes < 0) {
    return { erro: "Intervalo inválido.", ok: null };
  }

  const supabase = await createClient();

  if (id) {
    const { error } = await supabase
      .from("shift_templates")
      .update({
        label,
        start_time: start,
        end_time: end,
        break_minutes: breakMinutes,
        color,
      })
      .eq("id", id);
    if (error) return { erro: traduzir(error), ok: null };
  } else {
    const key = chaveA_partirDe(label);
    const { error } = await supabase.from("shift_templates").insert({
      company_id: active.company_id,
      key,
      label,
      start_time: start,
      end_time: end,
      break_minutes: breakMinutes,
      color,
    });
    if (error) return { erro: traduzir(error), ok: null };
  }

  revalidatePath("/configuracoes");
  return { erro: null, ok: id ? "Turno atualizado." : "Turno criado." };
}

export async function alternarTurno(formData: FormData) {
  await requireManager();
  const id = String(formData.get("id") ?? "");
  const ativar = String(formData.get("ativar") ?? "") === "1";

  const supabase = await createClient();
  await supabase.from("shift_templates").update({ active: ativar }).eq("id", id);
  revalidatePath("/configuracoes");
}

export async function excluirTurno(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireManager();
  const id = String(formData.get("id") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.from("shift_templates").delete().eq("id", id);

  // A partir da Sprint 3 a escala referencia o turno: apagar um que está em
  // uso é recusado pela FK, e desativar passa a ser o caminho.
  if (error) {
    if (error.code === "23503") {
      return {
        erro: "Este turno está em uso na escala. Desative em vez de excluir.",
        ok: null,
      };
    }
    return { erro: traduzir(error), ok: null };
  }

  revalidatePath("/configuracoes");
  return { erro: null, ok: "Turno excluído." };
}

// ============================================================
// UNIDADES
// ============================================================

export async function salvarUnidade(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { active } = await requireManager();

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const lat = Number(formData.get("lat"));
  const lng = Number(formData.get("lng"));
  const radius = Number(formData.get("radius_m") ?? 120);
  const requireSelfie = formData.get("require_selfie") === "on";

  if (!name) return { erro: "Dê um nome à unidade.", ok: null };
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return {
      erro: "Informe latitude e longitude — sem elas o ponto por GPS não valida nada.",
      ok: null,
    };
  }
  if (lat < -90 || lat > 90) return { erro: "Latitude fora de -90 a 90.", ok: null };
  if (lng < -180 || lng > 180) return { erro: "Longitude fora de -180 a 180.", ok: null };
  if (radius < 20 || radius > 2000) {
    return { erro: "O raio precisa ficar entre 20 e 2000 metros.", ok: null };
  }

  const dados = {
    name,
    address: address || null,
    lat,
    lng,
    radius_m: radius,
    require_selfie: requireSelfie,
  };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("locations").update(dados).eq("id", id)
    : await supabase
        .from("locations")
        .insert({ ...dados, company_id: active.company_id });

  if (error) return { erro: traduzir(error), ok: null };

  revalidatePath("/configuracoes");
  return { erro: null, ok: id ? "Unidade atualizada." : "Unidade criada." };
}

export async function excluirUnidade(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireManager();
  const id = String(formData.get("id") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.from("locations").delete().eq("id", id);

  if (error) {
    if (error.code === "23503") {
      return {
        erro: "Esta unidade está em uso. Desative em vez de excluir.",
        ok: null,
      };
    }
    return { erro: traduzir(error), ok: null };
  }

  revalidatePath("/configuracoes");
  return { erro: null, ok: "Unidade excluída." };
}

// ============================================================
// EMPRESA
// ============================================================

export async function salvarEmpresa(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { active } = await requireWorkspace();

  if (active.role !== "dono") {
    return { erro: "Só o dono altera a configuração da empresa.", ok: null };
  }

  const name = String(formData.get("name") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "");
  const cnpj = String(formData.get("cnpj") ?? "").trim();

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_company", {
    p_company_id: active.company_id,
    p_name: name,
    p_timezone: timezone,
    p_cnpj: cnpj || undefined,
  });

  if (error) return { erro: error.message, ok: null };

  revalidatePath("/configuracoes");
  revalidatePath("/painel");
  return { erro: null, ok: "Empresa atualizada." };
}

// ============================================================

/** Chave estável a partir do nome: `Meio Período` → `meio_periodo`. */
function chaveA_partirDe(label: string) {
  const base = label
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 20);

  // A chave precisa casar com ^[a-z0-9_]{2,24}$ e ser única por empresa.
  const prefixo = base.length >= 2 ? base : "turno";
  return `${prefixo}_${Math.random().toString(36).slice(2, 5)}`;
}

function traduzir(error: { code?: string; message: string }) {
  if (error.code === "23514") {
    return "Valores inválidos: confira horários, intervalo e raio.";
  }
  if (error.code === "23505") return "Já existe um cadastro com esse nome.";
  if (error.code === "42501") return "Você não tem permissão para isso.";
  return error.message;
}
