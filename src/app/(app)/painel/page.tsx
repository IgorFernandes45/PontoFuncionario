import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABEL } from "@/lib/types";

export const metadata = { title: "Painel · PontoEscala" };

export default async function PainelPage() {
  const { active } = await requireManager();
  const supabase = await createClient();

  // Esta contagem passa por RLS. Se o isolamento estivesse quebrado, o numero
  // aqui incluiria gente de outra empresa.
  const { count: membros } = await supabase
    .from("memberships")
    .select("*", { count: "exact", head: true })
    .eq("status", "ativo");

  const { count: convitesPendentes } = await supabase
    .from("invitations")
    .select("*", { count: "exact", head: true })
    .eq("status", "pendente");

  const diasDeTrial = Math.max(
    0,
    Math.ceil(
      (new Date(active.trial_ends_at).getTime() - Date.now()) / 86_400_000,
    ),
  );

  return (
    <>
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          {active.company_name}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Você é {ROLE_LABEL[active.role].toLowerCase()} · fuso {active.timezone}
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Cartao titulo="Membros ativos" valor={membros ?? 0} />
        <Cartao titulo="Convites pendentes" valor={convitesPendentes ?? 0} />
        <Cartao
          titulo="Plano"
          valor={active.plan}
          nota={
            active.plan === "trial" ? `${diasDeTrial} dias restantes` : undefined
          }
        />
      </div>

      <section className="mt-8 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-medium text-slate-900">Próximos passos</h2>
        <ol className="mt-3 space-y-2 text-sm text-slate-600">
          <li>1. Convidar sua equipe por e-mail — Sprint 1.</li>
          <li>2. Definir os turnos e montar a escala — Sprint 2.</li>
          <li>3. Cadastrar o local e liberar o ponto por GPS — Sprint 4.</li>
        </ol>
      </section>
    </>
  );
}

function Cartao({
  titulo,
  valor,
  nota,
}: {
  titulo: string;
  valor: string | number;
  nota?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {titulo}
      </p>
      <p className="mt-2 text-2xl font-semibold capitalize text-slate-900">
        {valor}
      </p>
      {nota && <p className="mt-1 text-xs text-slate-500">{nota}</p>}
    </div>
  );
}
