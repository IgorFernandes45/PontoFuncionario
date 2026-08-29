import Link from "next/link";
import { requireWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  diasDaSemana,
  hojeNaEmpresa,
  inicioSemana,
  rotuloCurto,
  rotuloPeriodo,
  somarDias,
} from "@/lib/datas";

export const metadata = { title: "Minha escala · PontoEscala" };

type Linha = {
  work_date: string;
  shift_label: string | null;
  start_time: string | null;
  end_time: string | null;
  break_minutes: number | null;
  color: string | null;
  location_name: string | null;
  origem: "avulsa" | "fixa" | "folga";
};

type Resumo = {
  dias_com_turno: number;
  dias_de_folga: number;
  minutos_previstos: number;
};

const hhmm = (t: string) => t.slice(0, 5);

function horas(minutos: number) {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

export default async function MinhaEscalaPage({
  searchParams,
}: PageProps<"/minha-escala">) {
  const { active } = await requireWorkspace();
  const supabase = await createClient();

  const params = await searchParams;
  const semanaPedida =
    typeof params.semana === "string" ? params.semana : undefined;

  const hoje = hojeNaEmpresa(active.timezone);
  const inicio = inicioSemana(semanaPedida ?? hoje);
  const dias = diasDaSemana(inicio);

  const [{ data: escala }, { data: resumo }, { data: atualizada }] =
    await Promise.all([
      supabase.rpc("resolved_schedule", {
        p_company_id: active.company_id,
        p_from: inicio,
        p_to: dias[6],
      }),
      supabase.rpc("schedule_summary", {
        p_company_id: active.company_id,
        p_from: inicio,
        p_to: dias[6],
      }),
      supabase.rpc("my_schedule_updated_at"),
    ]);

  const linhas = (escala ?? []) as Linha[];
  const porDia = new Map(linhas.map((l) => [l.work_date, l]));
  const meu = ((resumo ?? []) as Resumo[])[0];

  const semanaAtual = inicioSemana(hoje);

  return (
    <>
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Minha escala
        </h1>
        <p className="mt-1 text-sm text-slate-500">{rotuloPeriodo(inicio)}</p>
      </header>

      {meu && meu.dias_com_turno > 0 && (
        <div className="mb-5 flex flex-wrap gap-x-6 gap-y-2 rounded-xl border border-slate-200 bg-white px-5 py-4">
          <Numero rotulo="Turnos" valor={String(meu.dias_com_turno)} />
          <Numero
            rotulo="Horas previstas"
            valor={horas(meu.minutos_previstos)}
            nota="já sem o intervalo"
          />
          {meu.dias_de_folga > 0 && (
            <Numero rotulo="Folgas" valor={String(meu.dias_de_folga)} />
          )}
        </div>
      )}

      <ol className="space-y-2">
        {dias.map((dia) => {
          const linha = porDia.get(dia);
          const ehHoje = dia === hoje;
          return (
            <li
              key={dia}
              className={`flex items-stretch gap-3 rounded-xl border bg-white p-3 ${
                ehHoje ? "border-blue-300 ring-1 ring-blue-100" : "border-slate-200"
              }`}
            >
              <div
                className={`w-14 shrink-0 rounded-lg py-2 text-center ${
                  ehHoje ? "bg-blue-50" : "bg-slate-50"
                }`}
              >
                <span className="block text-xs uppercase tracking-wide text-slate-500">
                  {rotuloCurto(dia)}
                </span>
                <span className="block text-lg font-semibold tabular-nums text-slate-800">
                  {dia.slice(8, 10)}
                </span>
              </div>

              <div className="flex min-w-0 flex-1 items-center">
                {!linha ? (
                  <p className="text-sm text-slate-400">Sem escala</p>
                ) : linha.origem === "folga" ? (
                  <p className="text-sm font-medium text-slate-500">Folga</p>
                ) : (
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
                      <span
                        aria-hidden="true"
                        className="h-3 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: linha.color ?? "#94a3b8" }}
                      />
                      {linha.shift_label}
                    </p>
                    <p className="mt-0.5 text-sm tabular-nums text-slate-600">
                      {linha.start_time && hhmm(linha.start_time)}
                      {linha.end_time && ` às ${hhmm(linha.end_time)}`}
                      {linha.break_minutes
                        ? ` · ${linha.break_minutes} min de intervalo`
                        : ""}
                    </p>
                    {linha.location_name && (
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {linha.location_name}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {ehHoje && (
                <span className="self-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                  hoje
                </span>
              )}
            </li>
          );
        })}
      </ol>

      <nav className="mt-5 flex items-center justify-between">
        <Link
          href={`/minha-escala?semana=${somarDias(inicio, -7)}`}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          ← Anterior
        </Link>
        {inicio !== semanaAtual && (
          <Link
            href="/minha-escala"
            className="text-sm text-blue-600 underline-offset-2 hover:underline"
          >
            Esta semana
          </Link>
        )}
        <Link
          href={`/minha-escala?semana=${somarDias(inicio, 7)}`}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          Próxima →
        </Link>
      </nav>

      {atualizada && (
        <p className="mt-4 text-xs text-slate-400">
          Escala atualizada pela última vez em{" "}
          {new Date(atualizada as string).toLocaleString("pt-BR", {
            timeZone: active.timezone,
            dateStyle: "short",
            timeStyle: "short",
          })}
          .
        </p>
      )}
    </>
  );
}

function Numero({
  rotulo,
  valor,
  nota,
}: {
  rotulo: string;
  valor: string;
  nota?: string;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {rotulo}
      </p>
      <p className="text-xl font-semibold text-slate-900">{valor}</p>
      {nota && <p className="text-xs text-slate-400">{nota}</p>}
    </div>
  );
}
