import { requireManager } from "@/lib/auth";
import Abas from "./abas";

export default async function ConfiguracoesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { active } = await requireManager();

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Configurações
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          O que a escala e o ponto precisam para funcionar.
        </p>
      </header>

      <Abas souDono={active.role === "dono"} />

      <div className="mt-6">{children}</div>
    </>
  );
}
