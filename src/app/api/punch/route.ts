import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { ACTIVE_COMPANY_COOKIE } from "@/lib/auth";

const TIPOS = ["entrada", "saida", "intervalo_inicio", "intervalo_fim"] as const;
type Tipo = (typeof TIPOS)[number];

/**
 * Único caminho de escrita de ponto.
 *
 * O `membership_id` NÃO vem do corpo da requisição: é derivado da sessão. Se
 * viesse do cliente, um funcionário bateria ponto no lugar de outro — e a
 * validação de raio continuaria passando, porque ele estaria mesmo no local.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
  }

  let corpo: Record<string, unknown>;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ erro: "Corpo inválido" }, { status: 400 });
  }

  const tipo = String(corpo.tipo ?? "");
  if (!TIPOS.includes(tipo as Tipo)) {
    return NextResponse.json({ erro: "Tipo de batida inválido" }, { status: 400 });
  }

  // A empresa ativa vem do cookie, mas quem confirma o vínculo é o banco:
  // a consulta abaixo passa por RLS.
  const cookieStore = await cookies();
  const preferida = cookieStore.get(ACTIVE_COMPANY_COOKIE)?.value;

  let consulta = supabase
    .from("memberships")
    .select("id, company_id")
    .eq("user_id", user.id)
    .eq("status", "ativo");

  if (preferida) consulta = consulta.eq("company_id", preferida);

  const { data: membership } = await consulta.limit(1).maybeSingle();

  if (!membership) {
    return NextResponse.json(
      { erro: "Você não tem vínculo ativo nesta empresa" },
      { status: 403 },
    );
  }

  const numero = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) ? v : null;

  // service_role porque `authenticated` não tem execute em register_punch:
  // o caminho de escrita é um só e passa por aqui.
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("register_punch", {
    p_membership_id: membership.id,
    p_type: tipo as Tipo,
    p_lat: numero(corpo.lat) ?? undefined,
    p_lng: numero(corpo.lng) ?? undefined,
    p_accuracy_m:
      numero(corpo.accuracy) != null
        ? Math.round(numero(corpo.accuracy)!)
        : undefined,
    p_punched_at:
      typeof corpo.punched_at === "string" ? corpo.punched_at : undefined,
    p_selfie_path:
      typeof corpo.selfie_path === "string" ? corpo.selfie_path : undefined,
  });

  if (error) {
    // 23514 = check_violation: são as recusas de negócio (fora do raio, GPS
    // impreciso, sequência). A mensagem do banco já é escrita para a pessoa.
    const status = error.code === "23514" ? 422 : 400;
    return NextResponse.json({ erro: error.message }, { status });
  }

  const resultado = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({ ok: true, ...resultado });
}
