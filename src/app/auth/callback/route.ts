import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Destino do magic link. Aceita as duas formas que o Supabase pode entregar:
 *  - `code`       (PKCE, padrao do browser client)
 *  - `token_hash` (template de e-mail server-side)
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  // Destino interno apenas — barra URL absoluta para nao virar open redirect.
  const bruto = searchParams.get("proximo") ?? "/";
  const proximo = bruto.startsWith("/") && !bruto.startsWith("//") ? bruto : "/";

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${proximo}`);
    return falhou(origin, error.message);
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) return NextResponse.redirect(`${origin}${proximo}`);
    return falhou(origin, error.message);
  }

  return falhou(origin, "Link inválido ou incompleto.");
}

function falhou(origin: string, mensagem: string) {
  const url = new URL("/login", origin);
  url.searchParams.set("erro", mensagem);
  return NextResponse.redirect(url);
}
