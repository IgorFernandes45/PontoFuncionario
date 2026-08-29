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
      <div className="flex-1 min-w-0">
        <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
