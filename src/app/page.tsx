import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { isManager } from "@/lib/types";

/**
 * Porta de entrada: cada papel cai na tela que faz sentido para ele.
 * Sem empresa, `requireWorkspace` manda para o onboarding.
 */
export default async function Home() {
  const { active } = await requireWorkspace();
  redirect(isManager(active.role) ? "/painel" : "/minha-escala");
}
