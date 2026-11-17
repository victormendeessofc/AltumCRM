"use server";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { isOrgRole } from "@/lib/roles";
import { ORG_COOKIE, requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export interface InviteState {
  ok?: boolean;
  error?: string;
  link?: string;
  email?: string;
}
export interface ActionResult {
  error?: string;
}

const NOT_ADMIN = "Apenas administradores podem fazer isso.";

function friendly(message: string): string {
  if (message.includes("pelo menos um administrador")) return "A organização precisa ter pelo menos um administrador.";
  if (message.includes("invitations_pending_uniq") || message.includes("duplicate key")) return "Já existe um convite pendente para esse e-mail.";
  if (message.includes("row-level security")) return NOT_ADMIN;
  return "Não foi possível concluir. Tente de novo.";
}

export async function inviteMember(_: InviteState | undefined, fd: FormData): Promise<InviteState> {
  const session = await requireSession();
  if (session.org.role !== "admin") return { error: NOT_ADMIN };
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const role = fd.get("role");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Informe um e-mail válido." };
  if (!isOrgRole(role)) return { error: "Escolha o papel do convidado." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invitations")
    .insert({ org_id: session.org.id, email, role, invited_by: session.userId })
    .select("token")
    .single();
  if (error || !data) return { error: friendly(error?.message ?? "") };

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  revalidatePath("/admin");
  return { ok: true, link: `${proto}://${host}/convite/${data.token}`, email };
}

export async function revokeInvite(id: string): Promise<ActionResult> {
  const session = await requireSession();
  if (session.org.role !== "admin") return { error: NOT_ADMIN };
  const supabase = await createClient();
  const { error } = await supabase.from("invitations").delete().eq("id", id).eq("org_id", session.org.id);
  if (error) return { error: friendly(error.message) };
  revalidatePath("/admin");
  return {};
}

export async function changeRole(userId: string, role: string): Promise<ActionResult> {
  const session = await requireSession();
  if (session.org.role !== "admin") return { error: NOT_ADMIN };
  if (!isOrgRole(role)) return { error: "Papel inválido." };
  const supabase = await createClient();
  const { error } = await supabase.from("memberships").update({ role }).eq("org_id", session.org.id).eq("user_id", userId);
  if (error) return { error: friendly(error.message) };
  revalidatePath("/admin");
  return {};
}

export async function removeMember(userId: string): Promise<ActionResult> {
  const session = await requireSession();
  if (session.org.role !== "admin") return { error: NOT_ADMIN };
  const supabase = await createClient();
  const { error } = await supabase.from("memberships").delete().eq("org_id", session.org.id).eq("user_id", userId);
  if (error) return { error: friendly(error.message) };
  revalidatePath("/admin");
  if (userId === session.userId) redirect("/onboarding");
  return {};
}

export async function acceptInvite(token: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: orgId, error } = await supabase.rpc("accept_invitation", { p_token: token });
  if (error) return { error: "Este convite é inválido, expirou ou foi enviado para outro e-mail." };
  // A organização do convite vira a ativa: quem já tinha outra conta passa a ver a que o convidou.
  if (typeof orgId === "string") {
    (await cookies()).set(ORG_COOKIE, orgId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  }
  redirect("/painel");
}
