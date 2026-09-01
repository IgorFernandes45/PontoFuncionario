"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ABAS = [
  { href: "/configuracoes/turnos", label: "Turnos", donoApenas: false },
  { href: "/configuracoes/unidades", label: "Unidades", donoApenas: false },
  { href: "/configuracoes/empresa", label: "Empresa", donoApenas: true },
  { href: "/configuracoes/dados", label: "Dados", donoApenas: true },
];

export default function Abas({ souDono }: { souDono: boolean }) {
  const pathname = usePathname();
  const visiveis = ABAS.filter((a) => souDono || !a.donoApenas);

  return (
    <nav className="flex gap-1 border-b border-slate-200">
      {visiveis.map((aba) => {
        const ativa = pathname === aba.href;
        return (
          <Link
            key={aba.href}
            href={aba.href}
            aria-current={ativa ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm transition ${
              ativa
                ? "border-blue-600 font-medium text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {aba.label}
          </Link>
        );
      })}
    </nav>
  );
}
