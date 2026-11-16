export type OrgRole = "admin" | "manager" | "seller";

export const ROLES: { value: OrgRole; label: string; hint: string }[] = [
  { value: "admin", label: "Administrador", hint: "Gerencia usuários, convites e configurações." },
  { value: "manager", label: "Gerente", hint: "Acompanha o time e os resultados." },
  { value: "seller", label: "Vendedor", hint: "Trabalha seus contatos, negócios e tarefas." },
];

export function roleLabel(role: string): string {
  return ROLES.find((r) => r.value === role)?.label ?? role;
}

export function isOrgRole(v: unknown): v is OrgRole {
  return v === "admin" || v === "manager" || v === "seller";
}

/** Só aceita caminhos internos de convite como destino pós-login (evita open redirect). */
export function safeNext(v: unknown): string | null {
  return typeof v === "string" && /^\/convite\/[0-9a-f-]{36}$/i.test(v) ? v : null;
}
