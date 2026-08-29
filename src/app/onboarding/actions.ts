"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_COMPANY_COOKIE } from "@/lib/auth";

export type OnboardingState = { erro: string | null };

export async function criarEmpresa(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const nomeEmpresa = String(formData.get("nome_empresa") ?? "").trim();
  const seuNome = String(formData.get("seu_nome") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "America/Recife");
  const cnpj = String(formData.get("cnpj") ?? "").trim();

  if (!nomeEmpresa) return { erro: "Informe o nome da empresa." };
  if (!seuNome) return { erro: "Informe o seu nome." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // A criacao NAO passa por insert direto: sem membership o usuario nao tem
  // permissao nenhuma em `companies`. A RPC cria empresa + dono na mesma
  // transacao.
  const { data: companyId, error } = await supabase.rpc(
    "create_company_with_owner",
    {
      p_name: nomeEmpresa,
      p_full_name: seuNome,
      p_timezone: timezone,
      p_cnpj: cnpj || undefined,
    },
  );

  if (error) return { erro: error.message };

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_COMPANY_COOKIE, companyId as string, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  redirect("/painel");
}
