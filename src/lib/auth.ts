import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Workspace } from "@/lib/types";

export const ACTIVE_COMPANY_COOKIE = "empresa_ativa";

/** Usuario autenticado, ou redireciona para o login. */
export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  return user;
}

/** Todas as empresas do usuario logado, com o papel dele em cada uma. */
export async function listWorkspaces(): Promise<Workspace[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_workspaces");
  if (error) throw error;
  return (data ?? []) as Workspace[];
}

/**
 * Empresa ativa da sessao. Sem nenhuma, manda para o onboarding — e o caso
 * do usuario que acabou de se cadastrar e ainda nao criou nem aceitou nada.
 */
export async function requireWorkspace(): Promise<{
  workspaces: Workspace[];
  active: Workspace;
}> {
  await requireUser();

  const workspaces = await listWorkspaces();
  if (workspaces.length === 0) redirect("/onboarding");

  const cookieStore = await cookies();
  const preferred = cookieStore.get(ACTIVE_COMPANY_COOKIE)?.value;

  const active =
    workspaces.find((w) => w.company_id === preferred) ?? workspaces[0];

  return { workspaces, active };
}

/**
 * Igual a requireWorkspace, mas exige papel de gestao. A UI ja esconde os
 * links; isso aqui fecha o acesso por URL direta. A ultima palavra continua
 * sendo do RLS no banco.
 */
export async function requireManager() {
  const ctx = await requireWorkspace();
  if (ctx.active.role === "funcionario") redirect("/minha-escala");
  return ctx;
}
