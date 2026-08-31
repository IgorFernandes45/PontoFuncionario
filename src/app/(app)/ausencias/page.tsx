import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hojeNaEmpresa } from "@/lib/datas";
import ListaAusencias, {
  type Ausencia,
  type MembroSimples,
} from "./lista-ausencias";

export const metadata = { title: "Ausências · PontoEscala" };

export default async function AusenciasPage() {
  const { active } = await requireManager();
  const supabase = await createClient();

  const hoje = hojeNaEmpresa(active.timezone);

  const [{ data: ausencias }, { data: membros }] = await Promise.all([
    supabase
      .from("absences")
      .select("id, membership_id, kind, starts_on, ends_on, note, attachment_path")
      .eq("company_id", active.company_id)
      .gte("ends_on", hoje.slice(0, 4) + "-01-01")
      .order("starts_on", { ascending: false }),
    supabase.rpc("company_members", { p_company_id: active.company_id }),
  ]);

  const ativos = (
    (membros ?? []) as (MembroSimples & { status: string })[]
  ).filter((m) => m.status === "ativo");

  return (
    <>
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Ausências
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Atestado, férias, folga e feriado. Sem isso, o relatório trata tudo
          como falta.
        </p>
      </header>

      <ListaAusencias
        ausencias={(ausencias ?? []) as Ausencia[]}
        membros={ativos}
        hoje={hoje}
        companyId={active.company_id}
      />
    </>
  );
}
