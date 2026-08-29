import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  diasDaSemana,
  inicioSemana,
  rotuloCurto,
  rotuloPeriodo,
} from "@/lib/datas";
import BotaoImprimir from "./botao-imprimir";

export const metadata = { title: "Escala para imprimir · PontoEscala" };

type Celula = {
  work_date: string;
  membership_id: string;
  full_name: string;
  shift_label: string | null;
  start_time: string | null;
  end_time: string | null;
  origem: "avulsa" | "fixa" | "folga";
};

const hhmm = (t: string) => t.slice(0, 5);

/**
 * Fora do layout do app de propósito: no papel, sidebar e botões viram lixo.
 * Sai por window.print(), que o navegador salva como PDF — sem precisar de
 * gerador de PDF no servidor.
 */
export default async function EscalaImpressaoPage({
  params,
}: PageProps<"/escala-impressao/[semana]">) {
  const { active } = await requireManager();
  const { semana } = await params;

  const inicio = inicioSemana(semana);
  const dias = diasDaSemana(inicio);

  const supabase = await createClient();
  const [{ data: escala }, { data: membros }] = await Promise.all([
    supabase.rpc("resolved_schedule", {
      p_company_id: active.company_id,
      p_from: inicio,
      p_to: dias[6],
    }),
    supabase.rpc("company_members", { p_company_id: active.company_id }),
  ]);

  const celulas = (escala ?? []) as Celula[];
  const porChave = new Map(
    celulas.map((c) => [`${c.membership_id}|${c.work_date}`, c]),
  );

  const pessoas = (
    (membros ?? []) as { membership_id: string; full_name: string; status: string }[]
  ).filter((m) => m.status === "ativo");

  return (
    <main className="mx-auto max-w-4xl bg-white p-8 text-slate-900 print:p-0">
      <BotaoImprimir />

      <header className="mb-4">
        <h1 className="text-xl font-bold">{active.company_name}</h1>
        <p className="text-sm text-slate-600">
          Escala de {rotuloPeriodo(inicio)}
        </p>
      </header>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="border border-slate-400 px-2 py-1 text-left">
              Pessoa
            </th>
            {dias.map((d) => (
              <th
                key={d}
                className="border border-slate-400 px-2 py-1 text-center"
              >
                {rotuloCurto(d)} {d.slice(8, 10)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pessoas.map((p) => (
            <tr key={p.membership_id}>
              <th
                scope="row"
                className="border border-slate-400 px-2 py-1 text-left font-medium"
              >
                {p.full_name}
              </th>
              {dias.map((d) => {
                const c = porChave.get(`${p.membership_id}|${d}`);
                return (
                  <td
                    key={d}
                    className="border border-slate-400 px-1 py-1 text-center align-middle"
                  >
                    {!c ? (
                      <span className="text-slate-400">—</span>
                    ) : c.origem === "folga" ? (
                      <span className="text-slate-500">Folga</span>
                    ) : (
                      <>
                        <span className="block font-medium">
                          {c.shift_label}
                        </span>
                        <span className="block whitespace-nowrap text-xs tabular-nums text-slate-600">
                          {c.start_time && hhmm(c.start_time)}
                          {c.end_time && `–${hhmm(c.end_time)}`}
                        </span>
                      </>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mt-4 text-xs text-slate-500">
        Gerado em{" "}
        {new Intl.DateTimeFormat("pt-BR", {
          dateStyle: "short",
          timeStyle: "short",
          timeZone: active.timezone,
        }).format(new Date())}
        . Confira a versão no aplicativo antes do turno — a escala pode mudar.
      </p>
    </main>
  );
}
