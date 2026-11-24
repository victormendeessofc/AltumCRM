import type { Metadata } from "next";
import { WhatsappPanel, type ChannelRow } from "@/components/whatsapp/whatsapp-panel";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { agencyAppMissing } from "@/lib/whatsapp/meta";
import { internalKey } from "@/lib/whatsapp/server";

export const metadata: Metadata = { title: "WhatsApp" };

export default async function WhatsappPage() {
  const session = await requireSession();
  const supabase = await createClient();
  const { data } = await supabase
    .from("whatsapp_channels")
    .select("id, provider, name, phone, status, status_detail, created_at")
    .eq("org_id", session.org.id)
    .order("created_at", { ascending: true });

  const channels: ChannelRow[] = (data ?? []).map((c) => ({
    id: c.id,
    provider: c.provider as ChannelRow["provider"],
    name: c.name,
    phone: c.phone,
    status: c.status as ChannelRow["status"],
    statusDetail: c.status_detail,
  }));

  return (
    <div className="animate-in-up">
      <WhatsappPanel channels={channels} isAdmin={session.org.role === "admin"} serverReady={internalKey() !== null} metaMissing={agencyAppMissing()} />
    </div>
  );
}
