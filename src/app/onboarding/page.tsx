import { redirect } from "next/navigation";
import { listWorkspaces, requireUser } from "@/lib/auth";
import OnboardingForm from "./onboarding-form";

export const metadata = { title: "Criar empresa · PontoEscala" };

export default async function OnboardingPage() {
  const user = await requireUser();

  // Quem ja tem empresa nao passa por aqui.
  const workspaces = await listWorkspaces();
  if (workspaces.length > 0) redirect("/");

  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Vamos criar sua empresa
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Você entrou como {user.email}. Só falta dar um nome ao negócio.
        </p>

        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <OnboardingForm />
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          Recebeu um convite de outra empresa? Abra o link do convite no e-mail.
        </p>
      </div>
    </main>
  );
}
