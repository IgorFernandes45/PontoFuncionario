"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { requireManager } from "@/lib/auth";
import type { AppRole } from "@/lib/types";

export type ConviteState = {
  erro: string | null;
  ok: string | null;
  /** Preenchido quando o e-mail nao pôde ser enviado: o gestor compartilha. */
  link: string | null;
};

const PAPEIS_VALIDOS: AppRole[] = ["gerente", "funcionario"];

export async function convidar(
  _prev: ConviteState,
  formData: FormData,
): Promise<ConviteState> {
  const { active } = await requireManager();

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const role = String(formData.get("role") ?? "funcionario") as AppRole;

  if (!fullName) return vazio({ erro: "Informe o nome de quem você convida." });
  if (!email.includes("@")) return vazio({ erro: "E-mail inválido." });
  if (!PAPEIS_VALIDOS.includes(role)) {
    return vazio({ erro: "Papel inválido." });
  }

  const supabase = await createClient();

  // Um convite vencido continua 'pendente' e travaria o indice unico. Limpa
  // antes de tentar criar o novo.
  await supabase.rpc("expire_stale_invitations", {
    p_company_id: active.company_id,
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: convite, error } = await supabase
    .from("invitations")
    .insert({
      company_id: active.company_id,
      email,
      full_name: fullName,
      role,
      created_by: user!.id,
    })
    .select("token")
    .single();

  if (error) {
    // 23505 = ja existe convite pendente para este e-mail nesta empresa.
    if (error.code === "23505") {
      return vazio({
        erro: `Já existe um convite pendente para ${email}. Cancele ou reenvie o que está na lista.`,
      });
    }
    // 42501 = RLS. Gerente tentando convidar gerente/dono cai aqui.
    if (error.code === "42501") {
      return vazio({
        erro: "Você não pode convidar alguém com esse papel.",
      });
    }
    return vazio({ erro: error.message });
  }

  const envio = await enviarConvite(email);

  revalidatePath("/equipe");

  return {
    erro: null,
    ok: envio.enviado
      ? `Convite enviado para ${email}.`
      : `Convite criado, mas o e-mail não saiu. Compartilhe o link com ${email}.`,
    link: envio.enviado ? null : await linkDoConvite(convite.token),
  };
}

export async function cancelarConvite(formData: FormData) {
  await requireManager();
  const id = String(formData.get("id") ?? "");

  const supabase = await createClient();
  await supabase
    .from("invitations")
    .update({ status: "cancelado" })
    .eq("id", id);

  revalidatePath("/equipe");
}

export async function reenviarConvite(formData: FormData) {
  await requireManager();
  const email = String(formData.get("email") ?? "");
  const id = String(formData.get("id") ?? "");

  const supabase = await createClient();
  // Reenviar renova o prazo: o convite volta a valer por 7 dias.
  await supabase
    .from("invitations")
    .update({
      expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      status: "pendente",
    })
    .eq("id", id);

  await enviarConvite(email);
  revalidatePath("/equipe");
}

/**
 * Dispara o e-mail pelo Supabase Auth. Quem ja tem conta nao pode ser
 * "convidado" de novo — nesse caso a pessoa entra pelo login normal e o
 * convite aparece pelo e-mail dela (my_pending_invitations).
 */
async function enviarConvite(email: string): Promise<{ enviado: boolean }> {
  try {
    const admin = createAdminClient();
    const origem = await origin();

    const { error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${origem}/convites`,
    });

    return { enviado: !error };
  } catch {
    return { enviado: false };
  }
}

async function linkDoConvite(token: string) {
  return `${await origin()}/aceitar/${token}`;
}

async function origin() {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

function vazio(p: Partial<ConviteState>): ConviteState {
  return { erro: null, ok: null, link: null, ...p };
}
