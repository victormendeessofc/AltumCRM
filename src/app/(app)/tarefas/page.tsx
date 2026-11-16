import type { Metadata } from "next";
import { TasksView, type TabKey, type TaskRow } from "@/components/tasks/tasks-view";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Tarefas" };

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
const cleanTerm = (s: string) => s.replace(/[,()%*\\:"']/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
const TABS: TabKey[] = ["hoje", "atrasadas", "proximas", "sem-prazo", "concluidas"];

export default async function TarefasPage({ searchParams }: PageProps<"/tarefas">) {
  const session = await requireSession();
  const sp = await searchParams;
  const tab = (TABS as string[]).includes(str(sp.v)) ? (str(sp.v) as TabKey) : "hoje";
  const scope = str(sp.m) === "all" ? "all" : "mine";
  const q = cleanTerm(str(sp.q));
  const supabase = await createClient();

  const select = "id, title, notes, due_at, done_at, assignee_id, deal_id, contact_id, created_by";
  let open = supabase.from("tasks").select(select).eq("org_id", session.org.id).is("done_at", null).order("due_at", { ascending: true, nullsFirst: false }).limit(500);
  let done = supabase.from("tasks").select(select).eq("org_id", session.org.id).not("done_at", "is", null).order("done_at", { ascending: false }).limit(100);
  if (scope === "mine") {
    open = open.eq("assignee_id", session.userId);
    done = done.eq("assignee_id", session.userId);
  }
  if (q) {
    open = open.ilike("title", `%${q}%`);
    done = done.ilike("title", `%${q}%`);
  }
  const [{ data: a }, { data: b }, { data: ms }] = await Promise.all([open, done, supabase.from("memberships").select("user_id").eq("org_id", session.org.id)]);
  const raw = [...(a ?? []), ...(b ?? [])];

  const ids = (ms ?? []).map((m) => m.user_id);
  const dealIds = [...new Set(raw.map((t) => t.deal_id).filter((i): i is string => !!i))];
  const contactIds = [...new Set(raw.map((t) => t.contact_id).filter((i): i is string => !!i))];
  const [{ data: profiles }, { data: deals }, { data: contacts }] = await Promise.all([
    ids.length ? supabase.from("profiles").select("id, full_name, email").in("id", ids) : Promise.resolve({ data: [] }),
    dealIds.length ? supabase.from("deals").select("id, title").in("id", dealIds) : Promise.resolve({ data: [] }),
    contactIds.length ? supabase.from("contacts").select("id, name").in("id", contactIds) : Promise.resolve({ data: [] }),
  ]);
  const person = new Map((profiles ?? []).map((p) => [p.id, p.full_name || p.email]));
  const dealName = new Map((deals ?? []).map((d) => [d.id, d.title]));
  const contactName = new Map((contacts ?? []).map((c) => [c.id, c.name]));

  const tasks: TaskRow[] = raw.map((t) => ({
    id: t.id,
    title: t.title,
    notes: t.notes,
    dueAt: t.due_at,
    doneAt: t.done_at,
    assigneeId: t.assignee_id,
    assigneeName: t.assignee_id ? (person.get(t.assignee_id) ?? null) : null,
    dealId: t.deal_id,
    dealTitle: t.deal_id ? (dealName.get(t.deal_id) ?? null) : null,
    contactId: t.contact_id,
    contactName: t.contact_id ? (contactName.get(t.contact_id) ?? null) : null,
    createdBy: t.created_by,
  }));

  return (
    <div className="animate-in-up">
      <TasksView
        tasks={tasks}
        tab={tab}
        scope={scope}
        q={q}
        members={(profiles ?? []).map((p) => ({ id: p.id, name: p.full_name || p.email }))}
        meId={session.userId}
        openNew={str(sp.novo) === "1"}
      />
    </div>
  );
}
