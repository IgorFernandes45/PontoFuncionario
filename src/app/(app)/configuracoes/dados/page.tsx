import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { envioConfigurado } from "@/lib/email";
import PainelDados from "./painel-dados";

export const metadata = { title: "Dados da empresa · PontoEscala" };

export default async function DadosPage() {
  const { active } = await requireWorkspace();
  if (active.role !== "dono") redirect("/configuracoes/turnos");

  const supabase = await createClient();
  const { count } = await supabase
    .from("outbox")
    .select("*", { count: "exact", head: true })
    .eq("status", "pendente");

  return (
    <PainelDados
      nomeEmpresa={active.company_name}
      avisosPendentes={count ?? 0}
      emailConfigurado={envioConfigurado()}
    />
  );
}
