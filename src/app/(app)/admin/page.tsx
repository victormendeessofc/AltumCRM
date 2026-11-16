import type { Metadata } from "next";
import { headers } from "next/headers";
import { AdminPanel, type InviteRow, type MemberRow } from "@/components/admin/admin-panel";
import { roleLabel } from "@/lib/roles";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Administração" };

export default async function AdminPage() {
  const session = await requireSession();
  const supabase = await createClient();
  const isAdmin = session.org.role === "admin";

  const { data: ms } = await supabase
    .from("memberships")
    .select("user_id, role, created_at")
    .eq("org_id", session.org.id)
    .order("created_at");
  const ids = (ms ?? []).map((m) => m.user_id);
  const { data: profiles } = ids.length
    ? await supabase.from("profiles").select("id, full_name, email").in("id", ids)
    : { data: [] };
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
  const members: MemberRow[] = (ms ?? []).map((m) => ({
    userId: m.user_id,
    name: byId.get(m.user_id)?.full_name ?? "",
    email: byId.get(m.user_id)?.email ?? "",
    role: m.role,
    isMe: m.user_id === session.userId,
  }));

  let invites: InviteRow[] = [];
  if (isAdmin) {
    const { data } = await supabase
      .from("invitations")
      .select("id, email, role, token, expires_at")
      .eq("org_id", session.org.id)
      .is("accepted_at", null)
      .order("created_at", { ascending: false });
    invites = (data ?? []).map((i) => ({ id: i.id, email: i.email, role: i.role, token: i.token, expiresAt: i.expires_at }));
  }

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const origin = `${h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https")}://${host}`;

  return (
    <div className="animate-in-up flex flex-col gap-4">
      <div>
        <h1 className="text-[28px] font-medium leading-tight">Administração</h1>
        <p className="text-[13px] text-fg-2">
          {session.org.name} · seu papel: {roleLabel(session.org.role)}
        </p>
      </div>
      <AdminPanel members={members} invites={invites} canEdit={isAdmin} origin={origin} />
    </div>
  );
}
