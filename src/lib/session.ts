import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export interface Session {
  userId: string;
  email: string;
  fullName: string;
  org: { id: string; name: string; plan: string; role: "admin" | "manager" | "seller" };
}

/** Usuário logado + organização ativa (a primeira do usuário por ora). Sem login vai para /entrar; sem organização, para /onboarding. */
export const requireSession = cache(async (): Promise<Session> => {
  await connection(); // dados por usuário: sempre em tempo de requisição, nunca no pré-render
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/entrar");

  const { data: memberships } = await supabase
    .from("memberships")
    .select("role, organizations(id, name, plan)")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: true })
    .limit(1);
  const m = memberships?.[0];
  const org = (Array.isArray(m?.organizations) ? m?.organizations[0] : m?.organizations) as { id: string; name: string; plan: string } | undefined;
  if (!m || !org) redirect("/onboarding");

  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", auth.user.id).maybeSingle();
  return {
    userId: auth.user.id,
    email: auth.user.email ?? "",
    fullName: profile?.full_name || (auth.user.email ?? "").split("@")[0],
    org: { ...org, role: m.role },
  };
});
