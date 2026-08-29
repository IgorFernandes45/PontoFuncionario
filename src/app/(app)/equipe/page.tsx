import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABEL, type AppRole, type MemberStatus } from "@/lib/types";
import ConviteForm from "./convite-form";
import { cancelarConvite, reenviarConvite } from "./actions";

export const metadata = { title: "Equipe · PontoEscala" };

type Membro = {
  membership_id: string;
  full_name: string;
  email: string;
  role: AppRole;
  status: MemberStatus;
  sou_eu: boolean;
};

export default async function EquipePage() {
  const { active } = await requireManager();
  const supabase = await createClient();

  const [{ data: membros }, { data: convites }] = await Promise.all([
    supabase.rpc("company_members", { p_company_id: active.company_id }),
    supabase
      .from("invitations")
      .select("id, email, full_name, role, status, expires_at")
      .eq("status", "pendente")
      .order("created_at", { ascending: false }),
  ]);

  const lista = (membros ?? []) as Membro[];
  const pendentes = convites ?? [];

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Equipe
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {lista.length} {lista.length === 1 ? "pessoa" : "pessoas"} em{" "}
          {active.company_name}
        </p>
      </header>

      {/* Só o dono concede papel de gerente — a policy do banco recusaria
          um gerente tentando, e a UI não deve oferecer o que será negado. */}
      <ConviteForm podeConvidarGerente={active.role === "dono"} />

      {pendentes.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-medium text-slate-900">
            Convites pendentes
          </h2>
          <ul className="mt-3 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {pendentes.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {c.full_name}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {c.email} · {ROLE_LABEL[c.role as AppRole]} · vence{" "}
                    {new Date(c.expires_at).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <div className="flex gap-2">
                  <form action={reenviarConvite}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="email" value={c.email} />
                    <button className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
                      Reenviar
                    </button>
                  </form>
                  <form action={cancelarConvite}>
                    <input type="hidden" name="id" value={c.id} />
                    <button className="rounded-lg px-3 py-1.5 text-xs text-red-600 hover:bg-red-50">
                      Cancelar
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-medium text-slate-900">Membros</h2>
        <ul className="mt-3 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {lista.map((m) => (
            <li
              key={m.membership_id}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">
                  {m.full_name}
                  {m.sou_eu && (
                    <span className="ml-2 text-xs font-normal text-slate-400">
                      você
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-slate-500">{m.email}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Etiqueta texto={ROLE_LABEL[m.role]} />
                {m.status !== "ativo" && <Etiqueta texto={m.status} alerta />}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function Etiqueta({ texto, alerta }: { texto: string; alerta?: boolean }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs capitalize ${
        alerta
          ? "bg-amber-50 text-amber-700"
          : "bg-slate-100 text-slate-600"
      }`}
    >
      {texto}
    </span>
  );
}
