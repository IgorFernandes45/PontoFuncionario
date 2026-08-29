import Link from "next/link";
import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  diasDaSemana,
  hojeNaEmpresa,
  inicioSemana,
  rotuloPeriodo,
  somarDias,
} from "@/lib/datas";
import GradeSemana, { type Celula, type Turno } from "./grade-semana";
import CopiarSemana from "./copiar-semana";
import ResumoSemana, { type ResumoLinha } from "./resumo-semana";

export const metadata = { title: "Escala · PontoEscala" };

type Membro = { membership_id: string; full_name: string; status: string };

export default async function EscalaPage({
  searchParams,
}: PageProps<"/escala">) {
  const { active } = await requireManager();
  const supabase = await createClient();

  const params = await searchParams;
  const semanaPedida =
    typeof params.semana === "string" ? params.semana : undefined;

  const hoje = hojeNaEmpresa(active.timezone);
  const inicio = inicioSemana(semanaPedida ?? hoje);
  const dias = diasDaSemana(inicio);

  const [{ data: escala }, { data: membros }, { data: turnos }, { data: resumo }] =
    await Promise.all([
      supabase.rpc("resolved_schedule", {
        p_company_id: active.company_id,
        p_from: inicio,
        p_to: dias[6],
      }),
      supabase.rpc("company_members", { p_company_id: active.company_id }),
      supabase
        .from("shift_templates")
        .select("key, label, start_time, end_time, break_minutes, color")
        .eq("company_id", active.company_id)
        .eq("active", true)
        .order("start_time"),
      supabase.rpc("schedule_summary", {
        p_company_id: active.company_id,
        p_from: inicio,
        p_to: dias[6],
      }),
    ]);

  const ativos = ((membros ?? []) as Membro[]).filter(
    (m) => m.status === "ativo",
  );
  const listaTurnos = (turnos ?? []) as Turno[];

  if (listaTurnos.length === 0) {
    return (
      <>
        <Cabecalho inicio={inicio} hoje={hoje} />
        <Aviso
          titulo="Nenhum turno cadastrado"
          texto="A escala é montada com turnos. Crie pelo menos um antes de continuar."
          href="/configuracoes/turnos"
          acao="Cadastrar turnos"
        />
      </>
    );
  }

  if (ativos.length === 0) {
    return (
      <>
        <Cabecalho inicio={inicio} hoje={hoje} />
        <Aviso
          titulo="Nenhuma pessoa ativa na equipe"
          texto="Convide sua equipe para poder montar a escala."
          href="/equipe"
          acao="Ir para Equipe"
        />
      </>
    );
  }

  return (
    <>
      <Cabecalho inicio={inicio} hoje={hoje} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <CopiarSemana inicio={inicio} />
        <Link
          href="/escala/fixa"
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          Escala fixa semanal
        </Link>
        <Link
          href="/escala/mes"
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          Ver o mês
        </Link>
        <Link
          href={`/escala-impressao/${inicio}`}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          Imprimir
        </Link>
      </div>

      <GradeSemana
        dias={dias}
        hoje={hoje}
        membros={ativos.map((m) => ({
          membership_id: m.membership_id,
          full_name: m.full_name,
        }))}
        celulas={(escala ?? []) as Celula[]}
        turnos={listaTurnos}
      />

      <ResumoSemana linhas={(resumo ?? []) as ResumoLinha[]} />

      <p className="mt-4 text-xs text-slate-400">
        Um dia sem exceção segue a escala fixa. Marcar turno ou folga aqui vale
        só para aquela data.
      </p>
    </>
  );
}

function Cabecalho({ inicio, hoje }: { inicio: string; hoje: string }) {
  const semanaAtual = inicioSemana(hoje);
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Escala
        </h1>
        <p className="mt-1 text-sm text-slate-500">{rotuloPeriodo(inicio)}</p>
      </div>
      <nav className="flex items-center gap-1">
        <Link
          href={`/escala?semana=${somarDias(inicio, -7)}`}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          ← Anterior
        </Link>
        {inicio !== semanaAtual && (
          <Link
            href="/escala"
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            Esta semana
          </Link>
        )}
        <Link
          href={`/escala?semana=${somarDias(inicio, 7)}`}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          Próxima →
        </Link>
      </nav>
    </header>
  );
}

function Aviso({
  titulo,
  texto,
  href,
  acao,
}: {
  titulo: string;
  texto: string;
  href: string;
  acao: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
      <p className="text-sm font-medium text-slate-700">{titulo}</p>
      <p className="mt-1 text-sm text-slate-500">{texto}</p>
      <Link
        href={href}
        className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        {acao}
      </Link>
    </div>
  );
}
