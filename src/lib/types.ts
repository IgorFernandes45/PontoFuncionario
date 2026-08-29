export type AppRole = "dono" | "gerente" | "funcionario";
export type MemberStatus = "ativo" | "pendente" | "inativo";

/** Uma linha de `my_workspaces()`: empresa + papel do usuario nela. */
export type Workspace = {
  company_id: string;
  company_name: string;
  timezone: string;
  plan: string;
  trial_ends_at: string;
  role: AppRole;
  membership_id: string;
  full_name: string;
};

export const ROLE_LABEL: Record<AppRole, string> = {
  dono: "Dono",
  gerente: "Gerente",
  funcionario: "Funcionário",
};

/** Quem pode gerir equipe, escala e configuracao. */
export function isManager(role: AppRole) {
  return role === "dono" || role === "gerente";
}
