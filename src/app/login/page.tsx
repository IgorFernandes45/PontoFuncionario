import { Suspense } from "react";
import LoginForm from "./login-form";

export const metadata = { title: "Entrar · PontoEscala" };

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            PontoEscala
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Escala e ponto eletrônico da sua equipe
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          Sem senha. Enviamos um link de acesso para o seu e-mail.
        </p>
      </div>
    </main>
  );
}
