import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import EmpresaForm from "./empresa-form";

export const metadata = { title: "Empresa · PontoEscala" };

export default async function EmpresaPage() {
  const { active } = await requireWorkspace();

  // A aba nem aparece para gerente, mas URL direta é outro caminho.
  if (active.role !== "dono") redirect("/configuracoes/turnos");

  const supabase = await createClient();
  const { data } = await supabase
    .from("companies")
    .select("name, cnpj, timezone, plan, trial_ends_at")
    .eq("id", active.company_id)
    .single();

  if (!data) redirect("/");

  return <EmpresaForm empresa={data} />;
}
