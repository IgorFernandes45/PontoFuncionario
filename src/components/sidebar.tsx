"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { trocarEmpresa } from "@/lib/actions";
import { ROLE_LABEL, isManager, type Workspace } from "@/lib/types";

type Item = { href: string; label: string; curto: string; gestao: boolean };

const ITENS: Item[] = [
  { href: "/painel", label: "Painel", curto: "Painel", gestao: true },
  { href: "/equipe", label: "Equipe", curto: "Equipe", gestao: true },
  { href: "/escala", label: "Escala", curto: "Escala", gestao: true },
  { href: "/relatorios", label: "Relatórios", curto: "Relat.", gestao: true },
  {
    href: "/configuracoes/turnos",
    label: "Configurações",
    curto: "Config.",
    gestao: true,
  },
  {
    href: "/minha-escala",
    label: "Minha escala",
    curto: "Escala",
    gestao: false,
  },
  { href: "/bater-ponto", label: "Bater ponto", curto: "Ponto", gestao: false },
];

function estaAtivo(href: string, pathname: string) {
  if (href.startsWith("/configuracoes")) {
    return pathname.startsWith("/configuracoes");
  }
  if (href === "/escala") {
    return pathname === "/escala" || pathname.startsWith("/escala/");
  }
  return pathname === href;
}

export default function Sidebar({
  workspaces,
  active,
}: {
  workspaces: Workspace[];
  active: Workspace;
}) {
  const pathname = usePathname();
  const gestor = isManager(active.role);
  const visiveis = ITENS.filter((i) => (gestor ? true : !i.gestao));

  return (
    <>
      {/* ---------- celular: cabeçalho fino + barra inferior ----------
          Sidebar lateral no celular espreme o conteúdo a ponto de cortar
          palavra no meio. E é no celular que o funcionário abre o app. */}
      <header className="fixed inset-x-0 top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2.5 sm:hidden">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">
            {active.company_name}
          </p>
          <p className="truncate text-xs text-slate-500">
            {active.full_name} · {ROLE_LABEL[active.role]}
          </p>
        </div>
        <form action="/auth/sair" method="post">
          <button
            type="submit"
            className="shrink-0 rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-600"
          >
            Sair
          </button>
        </form>
      </header>

      <nav
        aria-label="Navegação principal"
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] sm:hidden"
      >
        {visiveis.map((item) => {
          const ativo = estaAtivo(item.href, pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={ativo ? "page" : undefined}
              className={`flex-1 px-1 py-2.5 text-center text-xs ${
                ativo ? "font-medium text-blue-700" : "text-slate-500"
              }`}
            >
              {item.curto}
            </Link>
          );
        })}
      </nav>

      {/* ---------- telas maiores: a barra lateral ---------- */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white sm:flex">
        <div className="border-b border-slate-200 px-4 py-4">
          <p className="text-sm font-semibold text-slate-900">PontoEscala</p>

          {workspaces.length > 1 ? (
            <form action={trocarEmpresa} className="mt-2">
              <label htmlFor="empresa" className="sr-only">
                Empresa ativa
              </label>
              <select
                id="empresa"
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
            const ativo = estaAtivo(item.href, pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={ativo ? "page" : undefined}
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
    </>
  );
}
