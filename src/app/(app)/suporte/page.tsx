import type { Metadata } from "next";
import { TicketsView, type CommentRow, type TicketFilter, type TicketRow } from "@/components/tickets/tickets-view";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Suporte interno" };

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
const UUID = /^[0-9a-f-]{36}$/i;
const FILTERS: TicketFilter[] = ["open", "in_progress", "mine", "resolved"];
const COLS = "id, title, body, status, priority, requester_id, assignee_id, created_at, resolved_at";

type Row = { id: string; title: string; body: string | null; status: string; priority: string; requester_id: string | null; assignee_id: string | null; created_at: string; resolved_at: string | null };
const toRow = (t: Row): TicketRow => ({
  id: t.id,
  title: t.title,
  body: t.body,
  status: t.status as TicketRow["status"],
  priority: t.priority as TicketRow["priority"],
  requesterId: t.requester_id,
  assigneeId: t.assignee_id,
  createdAt: t.created_at,
  resolvedAt: t.resolved_at,
});

export default async function SuportePage({ searchParams }: PageProps<"/suporte">) {
  const session = await requireSession();
  const sp = await searchParams;
  const filter = (FILTERS as string[]).includes(str(sp.f)) ? (str(sp.f) as TicketFilter) : "open";
  const selectedId = UUID.test(str(sp.t)) ? str(sp.t) : null;
  const supabase = await createClient();

  let query = supabase.from("tickets").select(COLS).eq("org_id", session.org.id).limit(200);
  if (filter === "resolved") query = query.eq("status", "resolved").order("resolved_at", { ascending: false });
  else if (filter === "in_progress") query = query.eq("status", "in_progress").order("created_at", { ascending: false });
  else if (filter === "mine") query = query.neq("status", "resolved").or(`assignee_id.eq.${session.userId},requester_id.eq.${session.userId}`).order("created_at", { ascending: false });
  else query = query.eq("status", "open").order("created_at", { ascending: false });

  const [{ data }, selectedRes, commentsRes, { data: ms }] = await Promise.all([
    query,
    selectedId ? supabase.from("tickets").select(COLS).eq("id", selectedId).eq("org_id", session.org.id).maybeSingle() : Promise.resolve({ data: null }),
    selectedId ? supabase.from("ticket_comments").select("id, body, author_id, created_at").eq("ticket_id", selectedId).eq("org_id", session.org.id).order("created_at") : Promise.resolve({ data: [] }),
    supabase.from("memberships").select("user_id").eq("org_id", session.org.id),
  ]);
  const ids = (ms ?? []).map((m) => m.user_id);
  const { data: profiles } = ids.length ? await supabase.from("profiles").select("id, full_name, email").in("id", ids) : { data: [] };

  const comments: CommentRow[] = (commentsRes.data ?? []).map((c) => ({ id: c.id, body: c.body, authorId: c.author_id, createdAt: c.created_at }));

  return (
    <div className="animate-in-up">
      <TicketsView
        tickets={(data ?? []).map(toRow)}
        filter={filter}
        selected={selectedRes.data ? toRow(selectedRes.data as Row) : null}
        comments={comments}
        members={(profiles ?? []).map((p) => ({ id: p.id, name: p.full_name || p.email }))}
        meId={session.userId}
        canManage={session.org.role !== "seller"}
      />
    </div>
  );
}
