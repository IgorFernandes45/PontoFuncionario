"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Períodos que se pede na prática, sem obrigar a digitar duas datas. */
function mesRelativo(delta: number) {
  const agora = new Date();
  const d = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() + delta, 1));
  const ano = d.getUTCFullYear();
  const mes = String(d.getUTCMonth() + 1).padStart(2, "0");
  const ultimo = new Date(Date.UTC(ano, d.getUTCMonth() + 1, 0)).getUTCDate();
  return { de: `${ano}-${mes}-01`, ate: `${ano}-${mes}-${ultimo}` };
}

export default function Filtros({ de, ate }: { de: string; ate: string }) {
  const router = useRouter();
  const [inicio, setInicio] = useState(de);
  const [fim, setFim] = useState(ate);

  function aplicar(novoDe: string, novoAte: string) {
    setInicio(novoDe);
    setFim(novoAte);
    router.push(`/relatorios?de=${novoDe}&ate=${novoAte}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">De</span>
        <input
          type="date"
          value={inicio}
          onChange={(e) => setInicio(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm tabular-nums"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">Até</span>
        <input
          type="date"
          value={fim}
          onChange={(e) => setFim(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm tabular-nums"
        />
      </label>
      <button
        type="button"
        onClick={() => aplicar(inicio, fim)}
        className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
      >
        Aplicar
      </button>

      <div className="ml-auto flex gap-1">
        <Atalho rotulo="Este mês" onClick={() => { const m = mesRelativo(0); aplicar(m.de, m.ate); }} />
        <Atalho rotulo="Mês passado" onClick={() => { const m = mesRelativo(-1); aplicar(m.de, m.ate); }} />
      </div>
    </div>
  );
}

function Atalho({ rotulo, onClick }: { rotulo: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
    >
      {rotulo}
    </button>
  );
}
