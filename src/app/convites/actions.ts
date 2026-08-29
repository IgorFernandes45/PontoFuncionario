"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_COMPANY_COOKIE } from "@/lib/auth";

export type AceiteState = { erro: string | null };

/**
 * Aceita o convite e ja deixa a empresa recem-entrada como a ativa.
 * Toda a validacao (e-mail bate, prazo, status) vive na RPC — aqui só
 * traduzimos o erro para a tela.
 */
export async function aceitar(
  _prev: AceiteState,
  formData: FormData,
): Promise<AceiteState> {
  const token = String(formData.get("token") ?? "");
  if (!token) return { erro: "Convite inválido." };

  const supabase = await createClient();
  const { data: companyId, error } = await supabase.rpc("accept_invitation", {
    p_token: token,
  });

  if (error) return { erro: error.message };

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_COMPANY_COOKIE, companyId as string, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  redirect("/");
}
