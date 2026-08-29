import EmBreve from "@/components/em-breve";
import { requireManager } from "@/lib/auth";

export const metadata = { title: "Relatórios · PontoEscala" };

export default async function Page() {
  await requireManager();
  return <EmBreve titulo="Relatórios" sprint="Sprint 5" descricao="Horas, atrasos, faltas e aderência à escala." />;
}
