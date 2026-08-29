import Link from "next/link";
import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hojeNaEmpresa, inicioSemana, rotuloCurto } from "@/lib/datas";

export const metadata = { title: "Escala do mês · PontoEscala" };

type Cobertura = {
  work_date: string;
  shift_key: string;
  shift_label: string;
  color: string;
  pessoas: number;
};

/** Primeiro e último dia do mês de uma data `YYYY-MM-DD`. */
function limitesDoMes(iso: string) {
  const [ano, mes] = iso.split("-").map(Number);
  const primeiro = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const ultimo = `${ano}-${String(mes).padStart(2, "0")}-${ultimoDia}`;
  return { primeiro, ultimo };
}

function mesVizinho(iso: string, delta: number) {
  const [ano, mes] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(ano, mes - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function nomeDoMes(iso: string) {
  const [ano, mes] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(ano, mes - 1, 1)));
}

export default async function EscalaMesPage({
  searchParams,
}: PageProps<"/escala/mes">) {
  const { active } = await requireManager();
  const supabase = await createClient();

  const params = await searchParams;
  const hoje = hojeNaEmpresa(active.timezone);
  const referencia = typeof params.mes === "string" ? params.mes : hoje;
  const { primeiro, ultimo } = limitesDoMes(referencia);

  const { data } = await supabase.rpc("schedule_coverage", {
    p_company_id: active.company_id,
    p_from: primeiro,
    p_to: ultimo,
  });

  const porDia = new Map<string, Cobertura[]>();
  for (const c of (data ?? []) as Cobertura[]) {
    const lista = porDia.get(c.work_date) ?? [];
    lista.push(c);
    porDia.set(c.work_date, lista);
  }

  // O grid começa na segunda da semana do dia 1 e vai até fechar a última.
  const inicioGrade = inicioSemana(primeiro);
  const celulas: string[] = [];
  let cursor = inicioGrade;
  while (cursor <= ultimo || celulas.length % 7 !== 0) {
    celulas.push(cursor);
    const [a, m, d] = cursor.split("-").map(Number);
    const prox = new Date(Date.UTC(a, m - 1, d + 1));
    cursor = prox.toISOString().slice(0, 10);
    if (celulas.length > 42) break;
  }

  return (
    <>
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 first-letter:uppercase">
            {nomeDoMes(primeiro)}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Quantas pessoas por turno em cada dia.
          </p>
        </div>
        <nav className="flex items-center gap-1">
          <Link
            href={`/escala/mes?mes=${mesVizinho(primeiro, -1)}`}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            ← Anterior
          </Link>
          <Link
            href="/escala"
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            Ver por semana
          </Link>
          <Link
            href={`/escala/mes?mes=${mesVizinho(primeiro, 1)}`}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            Próximo →
          </Link>
        </nav>
      </header>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <div className="grid min-w-[42rem] grid-cols-7">
          {celulas.slice(0, 7).map((d) => (
            <div
              key={`cab-${d}`}
              className="border-b border-slate-200 px-2 py-2 text-center text-xs font-medium uppercase tracking-wide text-slate-400"
            >
              {rotuloCurto(d)}
            </div>
          ))}

          {celulas.map((dia) => {
            const doMes = dia >= primeiro && dia <= ultimo;
            const turnos = porDia.get(dia) ?? [];
            return (
              <div
                key={dia}
                className={`min-h-[5.5rem] border-b border-l border-slate-100 p-1.5 first:border-l-0 ${
                  dia === hoje ? "bg-blue-50/60" : doMes ? "" : "bg-slate-50/60"
                }`}
              >
                <span
                  className={`block text-right text-xs tabular-nums ${
                    dia === hoje
                      ? "font-semibold text-blue-700"
                      : doMes
                        ? "text-slate-500"
                        : "text-slate-300"
                  }`}
                >
                  {dia.slice(8, 10)}
                </span>

                <div className="mt-1 space-y-0.5">
                  {turnos.map((t) => (
                    <div
                      key={t.shift_key}
                      className="flex items-center gap-1 rounded px-1 py-0.5 text-[11px]"
                      style={{ backgroundColor: `${t.color}1a` }}
                    >
                      <span
                        aria-hidden="true"
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: t.color }}
                      />
                      <span className="min-w-0 flex-1 truncate text-slate-700">
                        {t.shift_label}
                      </span>
                      <span className="shrink-0 font-medium tabular-nums text-slate-800">
                        {t.pessoas}
                      </span>
                    </div>
                  ))}
                  {doMes && turnos.length === 0 && (
                    <p className="px-1 text-[11px] text-slate-300">ninguém</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="mt-3 text-xs text-slate-400">
        O número à direita é quanta gente trabalha naquele turno. Dias sem
        ninguém escalado aparecem vazios — é onde olhar primeiro.
      </p>
    </>
  );
}
