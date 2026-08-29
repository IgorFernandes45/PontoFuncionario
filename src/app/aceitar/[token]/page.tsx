import { createClient } from "@/lib/supabase/server";
import { ROLE_LABEL, type AppRole } from "@/lib/types";
import BotaoAceitar from "@/app/convites/botao-aceitar";
import LoginConvite from "./login-convite";

export const metadata = { title: "Convite · PontoEscala" };

type Previa = {
  company_name: string;
  full_name: string;
  email: string;
  role: AppRole;
  status: string;
  expirado: boolean;
};

export default async function AceitarPage({
  params,
}: PageProps<"/aceitar/[token]">) {
  const { token } = await params;
  const supabase = await createClient();

  // invitation_preview e security definer e liberada para anon: quem abre o
  // link ainda nao e membro de nada e nenhuma policy o deixaria ler isto.
  const { data } = await supabase.rpc("invitation_preview", {
    p_token: token,
  });
  const previa = (data?.[0] ?? null) as Previa | null;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md">
        <Conteudo previa={previa} token={token} emailLogado={user?.email} />
      </div>
    </main>
  );
}

function Conteudo({
  previa,
  token,
  emailLogado,
}: {
  previa: Previa | null;
  token: string;
  emailLogado?: string;
}) {
  if (!previa) return <Aviso titulo="Convite não encontrado" texto="O link pode estar incompleto. Peça um novo para quem administra a empresa." />;

  if (previa.expirado)
    return <Aviso titulo="Convite expirado" texto={`O convite para a ${previa.company_name} venceu. Peça um novo.`} />;

  if (previa.status !== "pendente")
    return <Aviso titulo="Convite já utilizado" texto="Se você já entrou, faça login normalmente." />;

  const cartao = (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        {previa.company_name} convidou você
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Como {ROLE_LABEL[previa.role].toLowerCase()}, no e-mail {previa.email}.
      </p>
    </>
  );

  // Já logado com o e-mail certo: só falta um clique.
  if (emailLogado?.toLowerCase() === previa.email.toLowerCase()) {
    return (
      <>
        {cartao}
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
          <BotaoAceitar token={token} empresa={previa.company_name} />
        </div>
      </>
    );
  }

  // Logado com OUTRO e-mail: a RPC recusaria. Melhor dizer antes.
  if (emailLogado) {
    return (
      <>
        {cartao}
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-sm text-amber-900">
            Você está na conta {emailLogado}, e este convite é para{" "}
            {previa.email}. Saia e entre com o e-mail convidado.
          </p>
          <form action="/auth/sair" method="post" className="mt-3">
            <button className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm text-amber-900 hover:bg-amber-100">
              Sair desta conta
            </button>
          </form>
        </div>
      </>
    );
  }

  return (
    <>
      {cartao}
      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <LoginConvite email={previa.email} token={token} />
      </div>
    </>
  );
}

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
      <h1 className="text-lg font-semibold text-slate-900">{titulo}</h1>
      <p className="mt-2 text-sm text-slate-500">{texto}</p>
      <a
        href="/login"
        className="mt-4 inline-block text-sm text-blue-600 underline-offset-2 hover:underline"
      >
        Ir para o login
      </a>
    </div>
  );
}
