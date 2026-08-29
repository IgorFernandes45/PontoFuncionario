import EmBreve from "@/components/em-breve";
import { requireManager } from "@/lib/auth";

export const metadata = { title: "Equipe · PontoEscala" };

export default async function Page() {
  await requireManager();
  return <EmBreve titulo="Equipe" sprint="Sprint 1" descricao="Convide funcionários e defina papéis." />;
}
