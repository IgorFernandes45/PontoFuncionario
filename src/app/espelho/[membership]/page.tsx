import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hojeNaEmpresa, rotuloCurto } from "@/lib/datas";
import { horas, SITUACAO, AUSENCIA } from "@/lib/horas";
import { isManager } from "@/lib/types";
import BotaoImprimir from "@/app/escala-impressao/[semana]/botao-imprimir";

export const metadata = { title: "Espelho de ponto · PontoEscala" };

type Dia = {
  dia: string;
  membership_id: string;
  full_name: string;
  situacao: string;
  shift_label: string | null;
  previsto_min: number;
  trabalhado_min: number;
  intervalo_min: number;
  intervalo_presumido: boolean;
  entrada_real: string | null;
  saida_real: string | null;
  atraso_min: number | null;
  ausencia_tipo: string | null;
  tem_ajuste: boolean;
};

const hhmm = (iso: string | null, tz: string) =>
  iso
    ? new Intl.DateTimeFormat("pt-BR", {
        timeZone: tz,
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(iso))
    : "—";

/**
 * Espelho de ponto: o documento que o funcionário confere e assina.
 * Fora do layout do app — no papel, navegação vira lixo.
 */
export default async function EspelhoPage({
  params,
  searchParams,
}: PageProps<"/espelho/[membership]">) {
  const { active } = await requireWorkspace();
  const { membership } = await params;
  const q = await searchParams;

  const supabase = await createClient();
  const hoje = hojeNaEmpresa(active.timezone);
  const [ano, mes] = hoje.split("-").map(Number);
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();

  const de = typeof q.de === "string" ? q.de : `${hoje.slice(0, 7)}-01`;
  const ate =
    typeof q.ate === "string" ? q.ate : `${hoje.slice(0, 7)}-${ultimo}`;

  const [{ data: dias }, { data: resumo }] = await Promise.all([
    supabase.rpc("daily_report", {
      p_company_id: active.company_id,
      p_from: de,
      p_to: ate,
    }),
    supabase.rpc("period_report", {
      p_company_id: active.company_id,
      p_from: de,
      p_to: ate,
    }),
  ]);

  const linhas = ((dias ?? []) as Dia[]).filter(
    (d) => d.membership_id === membership,
  );

  // Funcionário só chega ao próprio espelho — o RLS já filtra, isto evita a
  // página vazia sem explicação.
  if (linhas.length === 0) {
    if (!isManager(active.role)) redirect("/relatorios");
    return (
      <main className="mx-auto max-w-3xl p-8">
        <p className="text-sm text-slate-600">
          Nada registrado para esta pessoa no período.
        </p>
      </main>
    );
  }

  const r = ((resumo ?? []) as { membership_id: string; [k: string]: unknown }[]).find(
    (x) => x.membership_id === membership,
  ) as
    | {
        full_name: string;
        previsto_min: number;
        trabalhado_min: number;
        saldo_min: number;
        faltas: number;
        ausencias: number;
        atrasos: number;
        atraso_total_min: number;
      }
    | undefined;

  const fmtData = (iso: string) =>
    new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
      new Date(`${iso}T12:00:00Z`),
    );

  return (
    <main className="mx-auto max-w-4xl bg-white p-8 text-slate-900 print:p-0">
      <BotaoImprimir />

      <header className="mb-4 border-b border-slate-300 pb-3">
        <h1 className="text-xl font-bold">Espelho de ponto</h1>
        <p className="text-sm text-slate-700">
          {linhas[0].full_name} · {active.company_name}
        </p>
        <p className="text-sm text-slate-600">
          Período de {fmtData(de)} a {fmtData(ate)} · fuso {active.timezone}
        </p>
      </header>

      {r && (
        <dl className="mb-4 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
          <Item rotulo="Previsto" valor={horas(r.previsto_min)} />
          <Item rotulo="Trabalhado" valor={horas(r.trabalhado_min)} />
          <Item rotulo="Saldo" valor={horas(r.saldo_min)} />
          <Item
            rotulo="Faltas / ausências"
            valor={`${r.faltas} / ${r.ausencias}`}
          />
        </dl>
      )}

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <Th>Dia</Th>
            <Th>Turno</Th>
            <Th>Entrada</Th>
            <Th>Saída</Th>
            <Th>Interv.</Th>
            <Th>Trabalhado</Th>
            <Th>Situação</Th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((d) => (
            <tr key={d.dia}>
              <Td>
                {rotuloCurto(d.dia)} {d.dia.slice(8, 10)}
              </Td>
              <Td>{d.shift_label ?? "—"}</Td>
              <Td numerico>
                {hhmm(d.entrada_real, active.timezone)}
                {d.atraso_min != null && d.atraso_min > 0 && (
                  <span className="ml-1 text-red-700">
                    +{d.atraso_min}min
                  </span>
                )}
              </Td>
              <Td numerico>{hhmm(d.saida_real, active.timezone)}</Td>
              <Td numerico>
                {d.intervalo_min > 0
                  ? `${d.intervalo_min}min`
                  : d.intervalo_presumido
                    ? "presumido"
                    : "—"}
              </Td>
              <Td numerico>
                {d.trabalhado_min > 0 ? horas(d.trabalhado_min) : "—"}
              </Td>
              <Td>
                {d.situacao === "ausencia" && d.ausencia_tipo
                  ? AUSENCIA[d.ausencia_tipo]
                  : (SITUACAO[d.situacao]?.rotulo ?? d.situacao)}
                {d.tem_ajuste && (
                  <span className="ml-1 text-xs text-amber-700">*</span>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 space-y-1 text-xs text-slate-600">
        <p>
          * Dia com batida ajustada manualmente. O registro original permanece
          no histórico do sistema.
        </p>
        <p>
          &ldquo;Presumido&rdquo; no intervalo significa que o intervalo previsto do
          turno foi descontado, porque não houve batida de intervalo.
        </p>
        <p>
          Horas trabalhadas são líquidas, já sem o intervalo. Dias de ausência
          justificada não geram hora devida.
        </p>
      </div>

      <div className="mt-10 grid grid-cols-2 gap-8 text-sm">
        <Assinatura rotulo="Assinatura do funcionário" />
        <Assinatura rotulo="Assinatura do responsável" />
      </div>

      <p className="mt-6 text-xs text-slate-500">
        Documento gerado em{" "}
        {new Intl.DateTimeFormat("pt-BR", {
          dateStyle: "short",
          timeStyle: "short",
          timeZone: active.timezone,
        }).format(new Date())}
        .
      </p>
    </main>
  );
}

function Item({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500">
        {rotulo}
      </dt>
      <dd className="font-semibold tabular-nums">{valor}</dd>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="border border-slate-400 bg-slate-100 px-2 py-1 text-left text-xs font-semibold">
      {children}
    </th>
  );
}

function Td({
  children,
  numerico,
}: {
  children: React.ReactNode;
  numerico?: boolean;
}) {
  return (
    <td
      className={`border border-slate-400 px-2 py-1 ${
        numerico ? "tabular-nums" : ""
      }`}
    >
      {children}
    </td>
  );
}

function Assinatura({ rotulo }: { rotulo: string }) {
  return (
    <div>
      <div className="h-10 border-b border-slate-500" />
      <p className="mt-1 text-xs text-slate-600">{rotulo}</p>
    </div>
  );
}
