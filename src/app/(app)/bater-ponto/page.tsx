import EmBreve from "@/components/em-breve";
import { requireWorkspace } from "@/lib/auth";

export const metadata = { title: "Bater ponto · PontoEscala" };

export default async function Page() {
  await requireWorkspace();
  return <EmBreve titulo="Bater ponto" sprint="Sprint 4" descricao="Registro de ponto com verificação de local." />;
}
