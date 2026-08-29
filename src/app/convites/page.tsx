import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABEL, type AppRole } from "@/lib/types";
import BotaoAceitar from "./botao-aceitar";

export const metadata = { title: "Seus convites · PontoEscala" };

type Convite = {
  token: string;
  company_name: string;
  full_name: string;
  role: AppRole;
  expires_at: string;
};

export default async function ConvitesPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase.rpc("my_pending_invitations");
  const convites = (data ?? []) as Convite[];

  // Sem convite e sem empresa, a pessoa precisa criar a dela.
  if (convites.length === 0) {
    const { data: workspaces } = await supabase.rpc("my_workspaces");
    if (!workspaces || workspaces.length === 0) redirect("/onboarding");
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          {convites.length > 0 ? "Você foi convidado" : "Nenhum convite"}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Convites enviados para {user.email}.
        </p>

        <div className="mt-6 space-y-3">
          {convites.map((c) => (
            <div
              key={c.token}
              className="rounded-xl border border-slate-200 bg-white p-5"
            >
              <p className="text-sm font-medium text-slate-900">
                {c.company_name}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Como {ROLE_LABEL[c.role].toLowerCase()} · vence em{" "}
                {new Date(c.expires_at).toLocaleDateString("pt-BR")}
              </p>
              <BotaoAceitar token={c.token} empresa={c.company_name} />
            </div>
          ))}
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          Não é o que esperava?{" "}
          <Link href="/onboarding" className="underline underline-offset-2">
            criar minha própria empresa
          </Link>
        </p>
      </div>
    </main>
  );
}
