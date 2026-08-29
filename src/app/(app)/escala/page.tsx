import EmBreve from "@/components/em-breve";
import { requireManager } from "@/lib/auth";

export const metadata = { title: "Escala · PontoEscala" };

export default async function Page() {
  await requireManager();
  return <EmBreve titulo="Escala" sprint="Sprint 2" descricao="Turnos, escala fixa semanal e por data." />;
}
