"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * O OTP e disparado DO BROWSER de proposito: o code verifier do PKCE precisa
 * nascer aqui para o /auth/callback conseguir trocá-lo por sessão. Gerado no
 * servidor, o link chegaria sem par e a troca falharia.
 */
export default function LoginConvite({
  email,
  token,
}: {
  email: string;
  token: string;
}) {
  const [status, setStatus] = useState<"idle" | "enviando" | "enviado">("idle");
  const [erro, setErro] = useState<string | null>(null);

  async function entrar() {
    setErro(null);
    setStatus("enviando");

    const supabase = createClient();
    const proximo = `/aceitar/${token}`;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?proximo=${encodeURIComponent(proximo)}`,
      },
    });

    if (error) {
      setErro(error.message);
      setStatus("idle");
      return;
    }
    setStatus("enviado");
  }

  if (status === "enviado") {
    return (
      <div className="text-center">
        <p className="text-sm font-medium text-slate-900">
          Link enviado para {email}
        </p>
        <p className="mt-2 text-sm text-slate-500">
          Abra o e-mail e clique no link. Você volta para cá já autenticado.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm text-slate-600">
        Para aceitar, confirme que este e-mail é seu. Não precisa de senha.
      </p>
      <button
        type="button"
        onClick={entrar}
        disabled={status === "enviando"}
        className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
      >
        {status === "enviando" ? "Enviando…" : `Enviar link para ${email}`}
      </button>
      {erro && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {erro}
        </p>
      )}
    </div>
  );
}
