import EmBreve from "@/components/em-breve";
import { requireWorkspace } from "@/lib/auth";

export const metadata = { title: "Minha escala · PontoEscala" };

export default async function Page() {
  await requireWorkspace();
  return <EmBreve titulo="Minha escala" sprint="Sprint 3" descricao="Seus turnos da semana." />;
}
