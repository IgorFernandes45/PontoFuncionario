import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Client server-side com a sessao do usuario. Continua sujeito a RLS —
 * e essa a intencao: o servidor enxerga exatamente o que o usuario enxerga.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Component nao pode escrever cookie. O middleware ja
            // renova a sessao, entao ignorar aqui e seguro.
          }
        },
      },
    },
  );
}

/**
 * Client administrativo (service_role): IGNORA RLS.
 *
 * Usar apenas em rotas server-side que precisam decidir algo que o usuario
 * nao pode decidir por si — ex.: validar a distancia de um ponto e gravar
 * `verified` (Sprint 4). Toda chamada aqui deve filtrar company_id na mao,
 * porque a rede de seguranca do RLS nao esta mais ligada.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY nao configurada");
  }

  return createServerClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    cookies: { getAll: () => [], setAll: () => {} },
  });
}
