import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import UnidadesLista, { type Unidade } from "./unidades-lista";

export const metadata = { title: "Unidades · PontoEscala" };

export default async function UnidadesPage() {
  const { active } = await requireManager();
  const supabase = await createClient();

  const { data } = await supabase
    .from("locations")
    .select("id, name, address, lat, lng, radius_m, method, require_selfie, active")
    .eq("company_id", active.company_id)
    .order("name");

  return <UnidadesLista unidades={(data ?? []) as Unidade[]} />;
}
