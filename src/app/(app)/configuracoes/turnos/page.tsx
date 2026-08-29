import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import TurnosLista, { type Turno } from "./turnos-lista";

export const metadata = { title: "Turnos · PontoEscala" };

export default async function TurnosPage() {
  const { active } = await requireManager();
  const supabase = await createClient();

  const { data } = await supabase
    .from("shift_templates")
    .select("id, key, label, start_time, end_time, break_minutes, color, active")
    .eq("company_id", active.company_id)
    .order("start_time");

  return (
    <TurnosLista turnos={(data ?? []) as Turno[]} />
  );
}
