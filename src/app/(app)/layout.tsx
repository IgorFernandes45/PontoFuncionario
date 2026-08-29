import { requireWorkspace } from "@/lib/auth";
import Sidebar from "@/components/sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { workspaces, active } = await requireWorkspace();

  return (
    <div className="flex min-h-dvh bg-slate-50">
      <Sidebar workspaces={workspaces} active={active} />
      <div className="min-w-0 flex-1">
        {/* No celular, o cabeçalho e a barra de navegação são fixos: o
            conteúdo precisa de folga em cima e embaixo para não sumir. */}
        <main className="mx-auto max-w-5xl px-4 pb-24 pt-20 sm:px-6 sm:pb-8 sm:pt-8">
          {children}
        </main>
      </div>
    </div>
  );
}
