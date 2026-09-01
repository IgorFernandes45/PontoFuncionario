import { createAdminClient } from "@/lib/supabase/server";

/**
 * Envio das mensagens da fila.
 *
 * O Supabase Auth só manda e-mail de autenticação — não dá para pendurar
 * notificação de produto nele. Então a mensagem é gravada em `outbox` e o
 * envio vira configuração: com `RESEND_API_KEY` presente, sai; sem ela, a
 * fila acumula e o piloto roda sem perder nada.
 *
 * Isso não é um envio de mentira: a mensagem existe, tem destinatário e
 * conteúdo, e a tela mostra quantas estão esperando.
 */
export function envioConfigurado(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_REMETENTE);
}

type Mensagem = {
  id: string;
  para_email: string;
  assunto: string;
  corpo: string;
};

async function enviarUma(m: Mensagem): Promise<{ ok: boolean; erro?: string }> {
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_REMETENTE,
        to: m.para_email,
        subject: m.assunto,
        text: m.corpo,
      }),
    });

    if (!r.ok) {
      const detalhe = await r.text().catch(() => "");
      return { ok: false, erro: `${r.status}: ${detalhe.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "falha de rede" };
  }
}

/**
 * Escoa a fila de uma empresa. Devolve o que aconteceu para a tela poder
 * dizer a verdade em vez de "enviado" genérico.
 */
export async function escoarFilaDeEmail(companyId: string): Promise<{
  enviados: number;
  falhas: number;
  pendentes: number;
  configurado: boolean;
}> {
  const admin = createAdminClient();

  const { data: fila } = await admin
    .from("outbox")
    .select("id, para_email, assunto, corpo")
    .eq("company_id", companyId)
    .eq("status", "pendente")
    .order("created_at")
    .limit(50);

  const pendentes = fila?.length ?? 0;

  if (!envioConfigurado()) {
    return { enviados: 0, falhas: 0, pendentes, configurado: false };
  }

  let enviados = 0;
  let falhas = 0;

  for (const m of (fila ?? []) as Mensagem[]) {
    const r = await enviarUma(m);
    if (r.ok) {
      await admin
        .from("outbox")
        .update({ status: "enviado", enviado_em: new Date().toISOString() })
        .eq("id", m.id);
      enviados += 1;
    } else {
      // Falha não some da fila: fica marcada com o motivo, para alguém poder
      // olhar em vez de descobrir pela reclamação do funcionário.
      await admin
        .from("outbox")
        .update({ status: "falhou", erro: r.erro })
        .eq("id", m.id);
      falhas += 1;
    }
  }

  return { enviados, falhas, pendentes: pendentes - enviados - falhas, configurado: true };
}
