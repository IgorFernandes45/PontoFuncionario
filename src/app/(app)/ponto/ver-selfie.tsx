"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * O bucket é privado, então a foto só aparece por URL assinada de vida curta.
 * Gerada sob demanda: assinar tudo na renderização criaria links válidos para
 * fotos que ninguém vai olhar.
 */
export default function VerSelfie({ caminho }: { caminho: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function abrir() {
    if (url) {
      setUrl(null);
      return;
    }
    setCarregando(true);
    setErro(null);
    const supabase = createClient();
    const { data, error } = await supabase.storage
      .from("selfies")
      .createSignedUrl(caminho, 60);
    setCarregando(false);
    if (error) {
      setErro("Não foi possível abrir a foto.");
      return;
    }
    setUrl(data.signedUrl);
  }

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={abrir}
        disabled={carregando}
        className="text-xs text-blue-600 underline-offset-2 hover:underline disabled:opacity-60"
      >
        {carregando ? "Abrindo…" : url ? "Esconder foto" : "Ver foto"}
      </button>
      {erro && <p className="text-xs text-red-700">{erro}</p>}
      {url && (
        <img
          src={url}
          alt="Foto registrada no momento da batida"
          className="mt-2 max-h-56 rounded-lg border border-slate-200"
        />
      )}
    </div>
  );
}
