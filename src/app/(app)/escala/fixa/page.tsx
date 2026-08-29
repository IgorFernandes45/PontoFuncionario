import Link from "next/link";
import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import GradeFixa, { type EntradaFixa } from "./grade-fixa";
import type { Turno } from "../grade-semana";

export const metadata = { title: "Escala fixa · PontoEscala" };

type Membro = { membership_id: string; full_name: string; status: string };

export default async function EscalaFixaPage() {
  const { active } = await requireManager();
  const supabase = await createClient();

  const [{ data: entradas }, { data: membros }, { data: turnos }] =
    await Promise.all([
      supabase
        .from("schedule_entries")
        .select("id, membership_id, weekday, shift_key")
        .eq("company_id", active.company_id)
        .not("weekday", "is", null),
      supabase.rpc("company_members", { p_company_id: active.company_id }),
      supabase
        .from("shift_templates")
        .select("key, label, start_time, end_time, break_minutes, color")
        .eq("company_id", active.company_id)
        .eq("active", true)
        .order("start_time"),
    ]);

  const ativos = ((membros ?? []) as Membro[]).filter(
    (m) => m.status === "ativo",
  );

  return (
    <>
      <header className="mb-5">
        <Link
          href="/escala"
          className="text-sm text-blue-600 underline-offset-2 hover:underline"
        >
          ← Voltar para a semana
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
          Escala fixa semanal
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          O padrão que se repete toda semana. Um dia específico pode ser mudado
          na tela da semana, sem mexer aqui.
        </p>
      </header>

      <GradeFixa
        membros={ativos.map((m) => ({
          membership_id: m.membership_id,
          full_name: m.full_name,
        }))}
        entradas={(entradas ?? []) as EntradaFixa[]}
        turnos={(turnos ?? []) as Turno[]}
      />
    </>
  );
}
