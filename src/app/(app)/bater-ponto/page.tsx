import { requireWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hojeNaEmpresa } from "@/lib/datas";
import Relogio, { type EstadoPonto } from "./relogio";
import PedirCorrecao from "./pedir-correcao";

export const metadata = { title: "Bater ponto · PontoEscala" };

type Batida = {
  id: string;
  type: string;
  punched_at: string;
  distance_m: number | null;
  atrasado: boolean;
};

export default async function BaterPontoPage() {
  const { active } = await requireWorkspace();
  const supabase = await createClient();

  const hoje = hojeNaEmpresa(active.timezone);

  const [{ data: estado }, { data: batidas }] = await Promise.all([
    supabase.rpc("my_punch_state", { p_company_id: active.company_id }),
    supabase.rpc("effective_punches", {
      p_company_id: active.company_id,
      p_from: hoje,
      p_to: hoje,
    }),
  ]);

  const st = (Array.isArray(estado) ? estado[0] : estado) as
    | EstadoPonto
    | undefined;

  if (!st) {
    return (
      <Aviso
        titulo="Sem vínculo ativo"
        texto="Fale com quem administra a empresa."
      />
    );
  }

  if (!st.location_name) {
    return (
      <Aviso
        titulo="Nenhuma unidade cadastrada"
        texto="O ponto só é validado contra um local de trabalho. Peça a quem administra para cadastrar a unidade."
      />
    );
  }

  return (
    <>
      <Relogio
        estado={st}
        timezone={active.timezone}
        companyId={active.company_id}
        batidasDeHoje={(batidas ?? []) as Batida[]}
      />
      <PedirCorrecao hoje={hoje} />
    </>
  );
}

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        Bater ponto
      </h1>
      <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
        <p className="text-sm font-medium text-slate-700">{titulo}</p>
        <p className="mt-1 text-sm text-slate-500">{texto}</p>
      </div>
    </>
  );
}
