import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { ACTIVE_COMPANY_COOKIE } from "@/lib/auth";
import { log, seguro } from "@/lib/log";

const TIPOS = ["entrada", "saida", "intervalo_inicio", "intervalo_fim"] as const;
type Tipo = (typeof TIPOS)[number];

// Quinze tentativas por minuto por pessoa. Uma batida legítima leva duas ou
// três; quinze é folga larga para quem está com o GPS ruim e insistindo, e
// aperto para um script varrendo o mapa atrás do raio da unidade.
const MAX_TENTATIVAS = 15;
const JANELA_S = 60;

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

  const admin = createAdminClient();

  // O limite é por pessoa, não por IP: numa loja todo mundo sai pelo mesmo
  // IP, e limitar por ele puniria a equipe inteira por causa de um.
  const { data: permitido } = await admin.rpc("check_rate_limit", {
    p_chave: `punch:${membership.id}`,
    p_max: MAX_TENTATIVAS,
    p_janela_s: JANELA_S,
  });

  if (permitido === false) {
    log.aviso("punch.rate_limit", { membership: membership.id });
    return NextResponse.json(
      { erro: "Muitas tentativas seguidas. Espere um minuto e tente de novo." },
      { status: 429 },
    );
  }

  const numero = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) ? v : null;

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
    // 23514 = check_violation: recusa de negócio (fora do raio, GPS impreciso,
    // sequência). Esperado, e a mensagem do banco já é escrita para a pessoa.
    if (error.code === "23514") {
      return NextResponse.json({ erro: error.message }, { status: 422 });
    }

    // Qualquer outra coisa é defeito, e defeito no registro de ponto precisa
    // aparecer. Sem isto, a primeira notícia vem do funcionário que não
    // conseguiu bater.
    log.erro("punch.falhou", {
      membership: membership.id,
      codigo: error.code,
      detalhe: seguro(error.message),
    });
    return NextResponse.json(
      { erro: "Não foi possível registrar agora. Tente de novo em instantes." },
      { status: 500 },
    );
  }

  const resultado = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({ ok: true, ...resultado });
}
