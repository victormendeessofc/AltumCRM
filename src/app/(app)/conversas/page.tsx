import type { Metadata } from "next";
import { ConversationsView, type ChannelOption } from "@/components/conversations/conversations-view";
import { listConversations, type ConvFilter } from "@/lib/conversation-actions";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Conversas" };

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
const UUID = /^[0-9a-f-]{36}$/i;
const FILTERS: ConvFilter[] = ["open", "mine", "pending", "closed"];

export default async function ConversasPage({ searchParams }: PageProps<"/conversas">) {
  const session = await requireSession();
  const sp = await searchParams;
  const filter = (FILTERS as string[]).includes(str(sp.f)) ? (str(sp.f) as ConvFilter) : "open";
  const selected = UUID.test(str(sp.c)) ? str(sp.c) : null;

  const supabase = await createClient();
  const [initial, { data: channels }, { data: ms }] = await Promise.all([
    listConversations(filter),
    supabase.from("whatsapp_channels").select("id, name, status").eq("org_id", session.org.id).order("created_at"),
    supabase.from("memberships").select("user_id").eq("org_id", session.org.id),
  ]);
  const ids = (ms ?? []).map((m) => m.user_id);
  const { data: profiles } = ids.length ? await supabase.from("profiles").select("id, full_name, email").in("id", ids) : { data: [] };

  return (
    <div className="animate-in-up">
      <ConversationsView
        initial={initial}
        initialFilter={filter}
        initialId={selected}
        channels={(channels ?? []) as ChannelOption[]}
        members={(profiles ?? []).map((p) => ({ id: p.id, name: p.full_name || p.email }))}
        meId={session.userId}
      />
    </div>
  );
}
