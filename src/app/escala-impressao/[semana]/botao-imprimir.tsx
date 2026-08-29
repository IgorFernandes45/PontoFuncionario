"use client";

export default function BotaoImprimir() {
  return (
    <div className="mb-6 flex items-center gap-3 print:hidden">
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        Imprimir ou salvar em PDF
      </button>
      <a
        href="/escala"
        className="text-sm text-blue-600 underline-offset-2 hover:underline"
      >
        Voltar
      </a>
    </div>
  );
}
