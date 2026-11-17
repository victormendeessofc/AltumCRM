import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import type { OrgRole } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export type { OrgRole };

export interface OrgSummary {
  id: string;
  name: string;
  role: OrgRole;
}

export interface Session {
  userId: string;
  email: string;
  fullName: string;
  org: { id: string; name: string; plan: string; role: OrgRole };
  /** Todas as organizações de que a pessoa participa (para o seletor). */
  orgs: OrgSummary[];
}

/** Cookie com a organização escolhida no seletor. Só vale se a pessoa ainda for membro dela. */
export const ORG_COOKIE = "altum_org";

type OrgRow = { id: string; name: string; plan: string };

/**
 * Usuário logado + organização ativa. A ativa é a escolhida no seletor (cookie), desde que a pessoa
 * ainda seja membro; senão, a mais antiga. Sem login vai para /entrar; sem organização, para /onboarding.
 */
export const requireSession = cache(async (): Promise<Session> => {
  await connection(); // dados por usuário: sempre em tempo de requisição, nunca no pré-render
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/entrar");

  const { data: memberships } = await supabase
    .from("memberships")
    .select("role, organizations(id, name, plan)")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: true });

  const list = (memberships ?? [])
    .map((m) => {
      const org = (Array.isArray(m.organizations) ? m.organizations[0] : m.organizations) as OrgRow | undefined;
      return org ? { org, role: m.role as OrgRole } : null;
    })
    .filter((x): x is { org: OrgRow; role: OrgRole } => x !== null);
  if (list.length === 0) redirect("/onboarding");

  const chosen = (await cookies()).get(ORG_COOKIE)?.value;
  const active = list.find((x) => x.org.id === chosen) ?? list[0];

  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", auth.user.id).maybeSingle();
  return {
    userId: auth.user.id,
    email: auth.user.email ?? "",
    fullName: profile?.full_name || (auth.user.email ?? "").split("@")[0],
    org: { ...active.org, role: active.role },
    orgs: list.map((x) => ({ id: x.org.id, name: x.org.name, role: x.role })),
  };
});
