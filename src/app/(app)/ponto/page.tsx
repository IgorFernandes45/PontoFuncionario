import Link from "next/link";
import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hojeNaEmpresa, rotuloCurto, somarDias } from "@/lib/datas";
import DiaDePonto, { type Batida, type Membro } from "./dia-de-ponto";
import Solicitacoes, { type Solicitacao } from "./solicitacoes";

export const metadata = { title: "Ponto · PontoEscala" };

export default async function PontoPage({
  searchParams,
}: PageProps<"/ponto">) {
  const { active } = await requireManager();
  const supabase = await createClient();

  const params = await searchParams;
  const hoje = hojeNaEmpresa(active.timezone);
  const dia = typeof params.dia === "string" ? params.dia : hoje;

  const [{ data: batidas }, { data: membros }, { data: pedidos }] =
    await Promise.all([
      supabase.rpc("effective_punches", {
        p_company_id: active.company_id,
        p_from: dia,
        p_to: dia,
      }),
      supabase.rpc("company_members", { p_company_id: active.company_id }),
      supabase
        .from("punch_requests")
        .select(
          "id, membership_id, kind, requested_type, requested_at, reason, status, created_at",
        )
        .eq("company_id", active.company_id)
        .eq("status", "pendente")
        .order("created_at"),
    ]);

  const ativos = ((membros ?? []) as (Membro & { status: string })[]).filter(
    (m) => m.status === "ativo",
  );

  const nomePorId = new Map(ativos.map((m) => [m.membership_id, m.full_name]));

  return (
    <>
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Ponto
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {rotuloCurto(dia)},{" "}
            {new Intl.DateTimeFormat("pt-BR", {
              day: "2-digit",
              month: "long",
              timeZone: "UTC",
            }).format(new Date(`${dia}T12:00:00Z`))}
          </p>
        </div>
        <nav className="flex items-center gap-1">
          <Link
            href={`/ponto?dia=${somarDias(dia, -1)}`}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            ← Ontem
          </Link>
          {dia !== hoje && (
            <Link
              href="/ponto"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              Hoje
            </Link>
          )}
          <Link
            href={`/ponto?dia=${somarDias(dia, 1)}`}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            Amanhã →
          </Link>
        </nav>
      </header>

      {pedidos && pedidos.length > 0 && (
        <Solicitacoes
          pedidos={(pedidos as Solicitacao[]).map((p) => ({
            ...p,
            nome: nomePorId.get(p.membership_id) ?? "—",
          }))}
          timezone={active.timezone}
        />
      )}

      <DiaDePonto
        dia={dia}
        timezone={active.timezone}
        membros={ativos}
        batidas={(batidas ?? []) as Batida[]}
      />
    </>
  );
}
