import Link from "next/link";
import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABEL } from "@/lib/types";

type Saude = {
  turnos_abertos_ontem: number;
  pedidos_pendentes: number;
  faltas_ontem: number;
  sem_escala_hoje: number;
  avisos_na_fila: number;
};

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

  const { data: saudeData } = await supabase.rpc("operation_health", {
    p_company_id: active.company_id,
  });
  const saude = (Array.isArray(saudeData) ? saudeData[0] : saudeData) as
    | Saude
    | undefined;

  // O que precisa de ação hoje, e onde resolver. Sem isto o gestor descobre
  // pelo funcionário que reclama.
  const pendencias = [
    saude?.turnos_abertos_ontem
      ? {
          texto: `${saude.turnos_abertos_ontem} turno(s) de ontem sem saída registrada`,
          href: "/ponto",
          acao: "Corrigir no ponto",
        }
      : null,
    saude?.pedidos_pendentes
      ? {
          texto: `${saude.pedidos_pendentes} pedido(s) de correção esperando decisão`,
          href: "/ponto",
          acao: "Decidir",
        }
      : null,
    saude?.faltas_ontem
      ? {
          texto: `${saude.faltas_ontem} falta(s) ontem sem ausência justificada`,
          href: "/ausencias",
          acao: "Registrar ausência",
        }
      : null,
    saude?.sem_escala_hoje
      ? {
          texto: `${saude.sem_escala_hoje} pessoa(s) sem escala hoje`,
          href: "/escala",
          acao: "Ver escala",
        }
      : null,
  ].filter((p) => p !== null);

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

      <section className="mt-8">
        <h2 className="text-sm font-medium text-slate-900">
          {pendencias.length === 0 ? "Tudo em dia" : "Precisa da sua atenção"}
        </h2>

        {pendencias.length === 0 ? (
          <p className="mt-2 rounded-xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-500">
            Nenhuma pendência de ontem nem de hoje.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-xl border border-amber-200 bg-white">
            {pendencias.map((p) => (
              <li
                key={p.href + p.texto}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
              >
                <span className="text-sm text-slate-800">{p.texto}</span>
                <Link
                  href={p.href}
                  className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                >
                  {p.acao}
                </Link>
              </li>
            ))}
          </ul>
        )}
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
