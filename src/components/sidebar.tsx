"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { trocarEmpresa } from "@/lib/actions";
import { ROLE_LABEL, isManager, type Workspace } from "@/lib/types";

type Item = { href: string; label: string; gestao: boolean };

const ITENS: Item[] = [
  { href: "/painel", label: "Painel", gestao: true },
  { href: "/equipe", label: "Equipe", gestao: true },
  { href: "/escala", label: "Escala", gestao: true },
  { href: "/relatorios", label: "Relatórios", gestao: true },
  { href: "/minha-escala", label: "Minha escala", gestao: false },
  { href: "/bater-ponto", label: "Bater ponto", gestao: false },
];

export default function Sidebar({
  workspaces,
  active,
}: {
  workspaces: Workspace[];
  active: Workspace;
}) {
  const pathname = usePathname();
  const gestor = isManager(active.role);

  // Gestor ve tudo; funcionario ve apenas o que e dele.
  const visiveis = ITENS.filter((i) => (gestor ? true : !i.gestao));

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-4">
        <p className="text-sm font-semibold text-slate-900">PontoEscala</p>

        {workspaces.length > 1 ? (
          <form action={trocarEmpresa} className="mt-2">
            <select
              name="company_id"
              defaultValue={active.company_id}
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
            >
              {workspaces.map((w) => (
                <option key={w.company_id} value={w.company_id}>
                  {w.company_name}
                </option>
              ))}
            </select>
          </form>
        ) : (
          <p className="mt-1 truncate text-xs text-slate-500">
            {active.company_name}
          </p>
        )}
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {visiveis.map((item) => {
          const ativo = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-lg px-3 py-2 text-sm transition ${
                ativo
                  ? "bg-blue-50 font-medium text-blue-700"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-200 p-3">
        <p className="truncate text-sm text-slate-700">{active.full_name}</p>
        <p className="text-xs text-slate-400">{ROLE_LABEL[active.role]}</p>
        <form action="/auth/sair" method="post" className="mt-2">
          <button
            type="submit"
            className="text-xs text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
          >
            Sair
          </button>
        </form>
      </div>
    </aside>
  );
}
