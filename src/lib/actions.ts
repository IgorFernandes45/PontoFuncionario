"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACTIVE_COMPANY_COOKIE } from "@/lib/auth";
import { listWorkspaces } from "@/lib/auth";

/**
 * Troca a empresa ativa. Valida contra `my_workspaces()` — o cookie sozinho
 * nao autoriza nada, mas nao custa recusar um id que nao e do usuario.
 */
export async function trocarEmpresa(formData: FormData) {
  const companyId = String(formData.get("company_id") ?? "");

  const workspaces = await listWorkspaces();
  if (!workspaces.some((w) => w.company_id === companyId)) {
    redirect("/");
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_COMPANY_COOKIE, companyId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  redirect("/");
}
