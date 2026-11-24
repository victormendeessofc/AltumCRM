import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { AdminPanel, type InviteRow, type MemberRow } from "@/components/admin/admin-panel";
import { OrgSettings } from "@/components/admin/org-settings";
import { PipelinesEditor, type PipelineFull } from "@/components/admin/pipelines-editor";
import { QuickRepliesEditor } from "@/components/admin/quick-replies-editor";
import { listQuickReplies } from "@/lib/quick-reply-actions";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { describeAudit } from "@/lib/audit-labels";
import { roleLabel } from "@/lib/roles";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Administração" };

const TABS = [
  { key: "usuarios", label: "Usuários" },
  { key: "organizacao", label: "Organização" },
  { key: "funis", label: "Funis" },
  { key: "respostas", label: "Respostas rápidas" },
  { key: "auditoria", label: "Auditoria" },
] as const;

/** Abas que qualquer membro vê (as demais são só do administrador). */
const OPEN_TABS = ["usuarios", "respostas"];

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function Users({ orgId, userId, isAdmin }: { orgId: string; userId: string; isAdmin: boolean }) {
  const supabase = await createClient();
  const { data: ms } = await supabase.from("memberships").select("user_id, role, created_at").eq("org_id", orgId).order("created_at");
  const ids = (ms ?? []).map((m) => m.user_id);
  const { data: profiles } = ids.length ? await supabase.from("profiles").select("id, full_name, email").in("id", ids) : { data: [] };
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
  const members: MemberRow[] = (ms ?? []).map((m) => ({
    userId: m.user_id,
    name: byId.get(m.user_id)?.full_name ?? "",
    email: byId.get(m.user_id)?.email ?? "",
    role: m.role,
    isMe: m.user_id === userId,
  }));

  let invites: InviteRow[] = [];
  if (isAdmin) {
    const { data } = await supabase
      .from("invitations")
      .select("id, email, role, token, expires_at")
      .eq("org_id", orgId)
      .is("accepted_at", null)
      .order("created_at", { ascending: false });
    invites = (data ?? []).map((i) => ({ id: i.id, email: i.email, role: i.role, token: i.token, expiresAt: i.expires_at }));
  }
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const origin = `${h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https")}://${host}`;
  return <AdminPanel members={members} invites={invites} canEdit={isAdmin} origin={origin} />;
}

async function Pipelines({ orgId, supabase }: { orgId: string; supabase: Supabase }) {
  const [{ data: pipes }, { data: stages }] = await Promise.all([
    supabase.from("pipelines").select("id, name").eq("org_id", orgId).order("position").order("created_at"),
    supabase.from("stages").select("id, pipeline_id, name, kind, probability, position").eq("org_id", orgId).order("position"),
  ]);
  const full: PipelineFull[] = (pipes ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    stages: (stages ?? []).filter((s) => s.pipeline_id === p.id).map((s) => ({ id: s.id, name: s.name, kind: s.kind as "open" | "won" | "lost", probability: s.probability })),
  }));
  return <PipelinesEditor pipelines={full} />;
}

async function Audit({ orgId, supabase }: { orgId: string; supabase: Supabase }) {
  const { data } = await supabase.from("audit_log").select("id, actor_id, table_name, op, changed, created_at").eq("org_id", orgId).order("id", { ascending: false }).limit(100);
  const ids = [...new Set((data ?? []).map((a) => a.actor_id).filter((i): i is string => !!i))];
  const { data: profiles } = ids.length ? await supabase.from("profiles").select("id, full_name, email").in("id", ids) : { data: [] };
  const name = new Map((profiles ?? []).map((p) => [p.id, p.full_name || p.email]));
  const fmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  return (
    <Card className="flex flex-col gap-3 p-4 md:p-6">
      <div>
        <h2 className="text-lg font-medium">Registro de atividades</h2>
        <p className="text-[13px] text-fg-2">Quem fez o quê, nas últimas 100 ações. O registro guarda só o nome dos campos alterados, nunca o conteúdo, para não duplicar dados pessoais.</p>
      </div>
      {(data ?? []).length === 0 ? (
        <p className="text-[13px] text-fg-3">Nada registrado ainda.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--border-subtle)]">
          {(data ?? []).map((a) => (
            <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5 text-[13px]">
              <span>
                <span className="font-medium">{a.actor_id ? (name.get(a.actor_id) ?? "Ex-membro") : "Sistema"}</span> · {describeAudit(a)}
              </span>
              <span className="num text-fg-3">{fmt.format(new Date(a.created_at))}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  const session = await requireSession();
  const sp = await searchParams;
  const isAdmin = session.org.role === "admin";
  const requested = typeof sp.tab === "string" ? sp.tab : "usuarios";
  const tab = TABS.find((t) => t.key === requested)?.key ?? "usuarios";
  const supabase = await createClient();

  const { data: org } = await supabase.from("organizations").select("name, monthly_goal").eq("id", session.org.id).single();

  return (
    <div className="animate-in-up flex flex-col gap-4">
      <div>
        <h1 className="text-[28px] font-medium leading-tight">Administração</h1>
        <p className="text-[13px] text-fg-2">
          {session.org.name} · seu papel: {roleLabel(session.org.role)}
        </p>
      </div>

      <nav aria-label="Seções" className="flex w-fit flex-wrap gap-1 rounded-full border border-line bg-raised p-1">
        {TABS.filter((t) => isAdmin || OPEN_TABS.includes(t.key)).map((t) => (
          <Link key={t.key} href={t.key === "usuarios" ? "/admin" : `/admin?tab=${t.key}`} aria-current={t.key === tab ? "page" : undefined} className={cn("inline-flex h-8 items-center rounded-full px-4 text-[13px] font-medium no-underline", t.key === tab ? "bg-selected text-fg" : "text-fg-2 hover:text-fg")}>
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "usuarios" && <Users orgId={session.org.id} userId={session.userId} isAdmin={isAdmin} />}
      {tab === "organizacao" && <OrgSettings name={org?.name ?? session.org.name} goal={Number(org?.monthly_goal ?? 0)} isAdmin={isAdmin} />}
      {tab === "funis" && isAdmin && <Pipelines orgId={session.org.id} supabase={supabase} />}
      {tab === "respostas" && <QuickRepliesEditor items={await listQuickReplies()} canEdit={session.org.role !== "seller"} />}
      {tab === "auditoria" && isAdmin && <Audit orgId={session.org.id} supabase={supabase} />}
    </div>
  );
}
