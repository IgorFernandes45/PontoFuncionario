import Link from "next/link";
import { requireWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hojeNaEmpresa } from "@/lib/datas";
import { horas } from "@/lib/horas";
import { isManager } from "@/lib/types";
import Filtros from "./filtros";

export const metadata = { title: "Relatórios · PontoEscala" };

type Linha = {
  membership_id: string;
  full_name: string;
  dias_previstos: number;
  dias_trabalhados: number;
  faltas: number;
  ausencias: number;
  previsto_min: number;
  trabalhado_min: number;
  saldo_min: number;
  atrasos: number;
  atraso_total_min: number;
  dias_em_aberto: number;
  dias_com_ajuste: number;
};

/** Primeiro e último dia do mês de uma data `YYYY-MM-DD`. */
function mesDe(iso: string) {
  const [ano, mes] = iso.split("-").map(Number);
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const mm = String(mes).padStart(2, "0");
  return { de: `${ano}-${mm}-01`, ate: `${ano}-${mm}-${ultimo}` };
}

export default async function RelatoriosPage({
  searchParams,
}: PageProps<"/relatorios">) {
  const { active } = await requireWorkspace();
  const supabase = await createClient();

  const params = await searchParams;
  const hoje = hojeNaEmpresa(active.timezone);
  const padrao = mesDe(hoje);

  const de = typeof params.de === "string" ? params.de : padrao.de;
  const ate = typeof params.ate === "string" ? params.ate : padrao.ate;

  const { data, error } = await supabase.rpc("period_report", {
    p_company_id: active.company_id,
    p_from: de,
    p_to: ate,
  });

  const linhas = (data ?? []) as Linha[];
  const gestor = isManager(active.role);

  // O saldo do time é a SOMA dos saldos, não `trabalhado - previsto`: o
  // segundo ignoraria a regra de que dia de ausência justificada não vira
  // dívida, e o rodapé contradiria as linhas logo acima dele.
  const total = linhas.reduce(
    (acc, l) => ({
      previsto: acc.previsto + l.previsto_min,
      trabalhado: acc.trabalhado + l.trabalhado_min,
      saldo: acc.saldo + l.saldo_min,
      faltas: acc.faltas + l.faltas,
      ausencias: acc.ausencias + l.ausencias,
      atrasos: acc.atrasos + l.atrasos,
      atrasoMin: acc.atrasoMin + l.atraso_total_min,
      aberto: acc.aberto + l.dias_em_aberto,
    }),
    { previsto: 0, trabalhado: 0, saldo: 0, faltas: 0, ausencias: 0,
      atrasos: 0, atrasoMin: 0, aberto: 0 },
  );

  return (
    <>
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Relatórios
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Horas previstas contra realizadas, com faltas e atrasos.
        </p>
      </header>

      <Filtros de={de} ate={ate} />

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error.message}
        </p>
      )}

      {total.aberto > 0 && (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {total.aberto} dia(s) com entrada e sem saída. Enquanto o turno
          estiver aberto, as horas dele não entram na conta —{" "}
          <Link href="/ponto" className="underline underline-offset-2">
            corrija no ponto
          </Link>
          .
        </p>
      )}

      {linhas.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-slate-500">
          Nada registrado neste período.
        </p>
      ) : (
        <>
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[46rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left">
                  <Th>Pessoa</Th>
                  <Th direita>Previsto</Th>
                  <Th direita>Trabalhado</Th>
                  <Th direita>Saldo</Th>
                  <Th direita>Faltas</Th>
                  <Th direita>Ausências</Th>
                  <Th direita>Atrasos</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.membership_id} className="border-b border-slate-100">
                    <td className="px-4 py-2.5">
                      <span className="font-medium text-slate-900">
                        {l.full_name}
                      </span>
                      {l.dias_com_ajuste > 0 && (
                        <span
                          className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700"
                          title="Dias com batida ajustada à mão"
                        >
                          {l.dias_com_ajuste} ajuste(s)
                        </span>
                      )}
                    </td>
                    <Td>{horas(l.previsto_min)}</Td>
                    <Td forte>{horas(l.trabalhado_min)}</Td>
                    <Td
                      classe={
                        l.saldo_min < 0
                          ? "text-red-700"
                          : l.saldo_min > 0
                            ? "text-emerald-700"
                            : "text-slate-500"
                      }
                    >
                      {horas(l.saldo_min)}
                    </Td>
                    <Td classe={l.faltas > 0 ? "text-red-700" : undefined}>
                      {l.faltas}
                    </Td>
                    <Td>{l.ausencias}</Td>
                    <Td>
                      {l.atrasos > 0
                        ? `${l.atrasos} · ${horas(l.atraso_total_min)}`
                        : "—"}
                    </Td>
                    <td className="px-4 py-2.5 text-right">
                      <Link
                        href={`/espelho/${l.membership_id}?de=${de}&ate=${ate}`}
                        className="text-xs text-blue-600 underline-offset-2 hover:underline"
                      >
                        Espelho
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
              {gestor && linhas.length > 1 && (
                <tfoot>
                  <tr className="bg-slate-50 font-medium">
                    <td className="px-4 py-2.5 text-slate-700">Equipe</td>
                    <Td>{horas(total.previsto)}</Td>
                    <Td forte>{horas(total.trabalhado)}</Td>
                    <Td>{horas(total.saldo)}</Td>
                    <Td>{total.faltas}</Td>
                    <Td>{total.ausencias}</Td>
                    <Td>
                      {total.atrasos > 0
                        ? `${total.atrasos} · ${horas(total.atrasoMin)}`
                        : "—"}
                    </Td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <a
              href={`/api/relatorio.csv?de=${de}&ate=${ate}`}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              Baixar CSV
            </a>
            <p className="text-xs text-slate-400">
              Horas líquidas, já sem o intervalo. Saldo negativo é hora a
              cumprir; dia de ausência justificada não conta como dívida.
            </p>
          </div>
        </>
      )}
    </>
  );
}

function Th({
  children,
  direita,
}: {
  children?: React.ReactNode;
  direita?: boolean;
}) {
  return (
    <th
      className={`px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-500 ${
        direita ? "text-right" : ""
      }`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  forte,
  classe,
}: {
  children: React.ReactNode;
  forte?: boolean;
  classe?: string;
}) {
  return (
    <td
      className={`px-4 py-2.5 text-right tabular-nums ${
        forte ? "font-semibold text-slate-900" : "text-slate-600"
      } ${classe ?? ""}`}
    >
      {children}
    </td>
  );
}
