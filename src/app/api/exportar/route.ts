import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** LGPD, art. 18: portabilidade. Tudo o que a empresa gerou, num arquivo. */
export async function GET() {
  const { active } = await requireWorkspace();

  if (active.role !== "dono") {
    return NextResponse.json(
      { erro: "Só o dono exporta os dados da empresa" },
      { status: 403 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("export_company_data", {
    p_company_id: active.company_id,
  });

  if (error) {
    return NextResponse.json({ erro: error.message }, { status: 400 });
  }

  const nome = active.company_name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .toLowerCase();

  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="pontoescala-${nome}-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
