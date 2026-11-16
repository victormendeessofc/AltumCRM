"use server";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  unread: boolean;
  createdAt: string;
}

export async function listNotifications(): Promise<{ items: NotificationItem[]; unread: number }> {
  const session = await requireSession();
  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select("id, kind, title, body, link, read_at, created_at")
    .eq("user_id", session.userId)
    .eq("org_id", session.org.id)
    .order("created_at", { ascending: false })
    .limit(30);
  const items = (data ?? []).map((n) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body, link: n.link, unread: !n.read_at, createdAt: n.created_at }));
  return { items, unread: items.filter((i) => i.unread).length };
}

export async function markAllRead(): Promise<void> {
  const session = await requireSession();
  const supabase = await createClient();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", session.userId).is("read_at", null);
}

export async function markRead(id: string): Promise<void> {
  const session = await requireSession();
  const supabase = await createClient();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).eq("user_id", session.userId);
}

// ------------------------------------------------------------------ busca
export interface SearchHit {
  kind: "contact" | "deal" | "task";
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

/** Remove caracteres que têm significado na sintaxe de filtros do PostgREST. */
const clean = (s: string) => s.replace(/[,()%*\\:"']/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);

export async function searchAll(q: string): Promise<SearchHit[]> {
  const term = clean(q);
  if (term.length < 2) return [];
  const session = await requireSession();
  const supabase = await createClient();
  const [contacts, deals, tasks] = await Promise.all([
    supabase.from("contacts").select("id, name, email, phone").eq("org_id", session.org.id).or(`name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`).limit(5),
    supabase.from("deals").select("id, title, value").eq("org_id", session.org.id).ilike("title", `%${term}%`).limit(5),
    supabase.from("tasks").select("id, title, done_at").eq("org_id", session.org.id).ilike("title", `%${term}%`).limit(5),
  ]);
  return [
    ...(contacts.data ?? []).map((c): SearchHit => ({ kind: "contact", id: c.id, title: c.name, subtitle: c.email ?? c.phone ?? "Contato", href: `/contatos?q=${encodeURIComponent(c.name)}` })),
    ...(deals.data ?? []).map((d): SearchHit => ({ kind: "deal", id: d.id, title: d.title, subtitle: "Negócio", href: `/funis?deal=${d.id}` })),
    ...(tasks.data ?? []).map((t): SearchHit => ({ kind: "task", id: t.id, title: t.title, subtitle: t.done_at ? "Tarefa concluída" : "Tarefa", href: `/tarefas?q=${encodeURIComponent(t.title)}` })),
  ];
}

export interface PickItem {
  id: string;
  label: string;
  hint: string;
}

/** Para os seletores de contato/negócio nos formulários. */
export async function searchEntities(kind: "contact" | "deal", q: string): Promise<PickItem[]> {
  const term = clean(q);
  const session = await requireSession();
  const supabase = await createClient();
  if (kind === "contact") {
    let query = supabase.from("contacts").select("id, name, email").eq("org_id", session.org.id).order("created_at", { ascending: false }).limit(8);
    if (term) query = query.or(`name.ilike.%${term}%,email.ilike.%${term}%`);
    const { data } = await query;
    return (data ?? []).map((c) => ({ id: c.id, label: c.name, hint: c.email ?? "" }));
  }
  let query = supabase.from("deals").select("id, title").eq("org_id", session.org.id).order("created_at", { ascending: false }).limit(8);
  if (term) query = query.ilike("title", `%${term}%`);
  const { data } = await query;
  return (data ?? []).map((d) => ({ id: d.id, label: d.title, hint: "" }));
}
