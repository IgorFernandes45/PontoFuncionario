import { NextResponse, type NextRequest } from "next/server";
import { requireWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type Linha = {
  full_name: string;
  dias_previstos: number;
  dias_trabalhados: number;
  faltas: number;
  ausencias: number;
  previsto_min: number;
  trabalhado_min: number;
  saldo_min: number;
  atrasos: number;
  atraso_total_min: number;
  dias_em_aberto: number;
  dias_com_ajuste: number;
};

/** Minutos em "8:30" — formato que o Excel entende como duração. */
function hhmm(min: number) {
  const sinal = min < 0 ? "-" : "";
  const abs = Math.abs(min);
  return `${sinal}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, "0")}`;
}

function campo(v: unknown) {
  const s = String(v ?? "");
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Mesma RPC da tela. Se o CSV tivesse consulta própria, os dois números
 * divergiriam no dia em que a regra mudasse — e ninguém saberia qual crer.
 */
export async function GET(request: NextRequest) {
  const { active } = await requireWorkspace();

  const { searchParams } = request.nextUrl;
  const de = searchParams.get("de");
  const ate = searchParams.get("ate");

  if (!de || !ate || !/^\d{4}-\d{2}-\d{2}$/.test(de) || !/^\d{4}-\d{2}-\d{2}$/.test(ate)) {
    return NextResponse.json({ erro: "Período inválido" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("period_report", {
    p_company_id: active.company_id,
    p_from: de,
    p_to: ate,
  });

  if (error) {
    return NextResponse.json({ erro: error.message }, { status: 400 });
  }

  const linhas = (data ?? []) as Linha[];

  const cabecalho = [
    "Pessoa",
    "Dias previstos",
    "Dias trabalhados",
    "Faltas",
    "Ausências justificadas",
    "Previsto (h:mm)",
    "Trabalhado (h:mm)",
    "Saldo (h:mm)",
    "Dias com atraso",
    "Atraso total (h:mm)",
    "Dias em aberto",
    "Dias com ajuste manual",
  ];

  const corpo = linhas.map((l) =>
    [
      l.full_name,
      l.dias_previstos,
      l.dias_trabalhados,
      l.faltas,
      l.ausencias,
      hhmm(l.previsto_min),
      hhmm(l.trabalhado_min),
      hhmm(l.saldo_min),
      l.atrasos,
      hhmm(l.atraso_total_min),
      l.dias_em_aberto,
      l.dias_com_ajuste,
    ].map(campo).join(";"),
  );

  // Ponto e vírgula e BOM: é o que o Excel em português abre sem perguntar
  // nada e sem estragar os acentos.
  const csv = "﻿" + [cabecalho.map(campo).join(";"), ...corpo].join("\r\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ponto-${de}-a-${ate}.csv"`,
    },
  });
}
