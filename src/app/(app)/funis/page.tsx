import type { Metadata } from "next";
import type { DealRow } from "@/components/deals/deal-dialog";
import { FunisView } from "@/components/deals/funis-view";
import { Card } from "@/components/ui/card";
import type { StageLite } from "@/lib/deals";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Funis de vendas" };

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export default async function FunisPage({ searchParams }: PageProps<"/funis">) {
  const session = await requireSession();
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: pipelines } = await supabase.from("pipelines").select("id, name").eq("org_id", session.org.id).order("position").order("created_at");
  if (!pipelines || pipelines.length === 0) {
    return (
      <Card>
        <p className="text-fg-2">Esta organização ainda não tem funis. Um administrador pode criar o primeiro em Administração → Funis.</p>
      </Card>
    );
  }
  const pipelineId = pipelines.find((p) => p.id === str(sp.p))?.id ?? pipelines[0].id;

  const [{ data: stageRows }, { data: dealRows }, { data: companyRows }, { data: ms }] = await Promise.all([
    supabase.from("stages").select("id, name, kind, probability").eq("pipeline_id", pipelineId).order("position"),
    supabase
      .from("deals")
      .select("id, title, value, stage_id, pipeline_id, contact_id, company_id, owner_id, expected_close, notes, stage_changed_at, lost_reason")
      .eq("org_id", session.org.id)
      .eq("pipeline_id", pipelineId)
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase.from("companies").select("id, name").eq("org_id", session.org.id).order("name").limit(1000),
    supabase.from("memberships").select("user_id").eq("org_id", session.org.id),
  ]);

  const ids = (ms ?? []).map((m) => m.user_id);
  const contactIds = [...new Set((dealRows ?? []).map((d) => d.contact_id).filter((i): i is string => !!i))];
  const [{ data: profiles }, { data: contacts }] = await Promise.all([
    ids.length ? supabase.from("profiles").select("id, full_name, email").in("id", ids) : Promise.resolve({ data: [] }),
    contactIds.length ? supabase.from("contacts").select("id, name").in("id", contactIds) : Promise.resolve({ data: [] }),
  ]);
  const owner = new Map((profiles ?? []).map((p) => [p.id, p.full_name || p.email]));
  const contact = new Map((contacts ?? []).map((c) => [c.id, c.name]));
  const company = new Map((companyRows ?? []).map((c) => [c.id, c.name]));

  const stages: StageLite[] = (stageRows ?? []).map((s) => ({ id: s.id, name: s.name, kind: s.kind as StageLite["kind"], probability: s.probability }));
  const deals: DealRow[] = (dealRows ?? []).map((d) => ({
    id: d.id,
    title: d.title,
    value: Number(d.value),
    stageId: d.stage_id,
    pipelineId: d.pipeline_id,
    contactId: d.contact_id,
    contactName: d.contact_id ? (contact.get(d.contact_id) ?? null) : null,
    company: d.company_id ? (company.get(d.company_id) ?? null) : null,
    ownerId: d.owner_id,
    ownerName: d.owner_id ? (owner.get(d.owner_id) ?? null) : null,
    expectedClose: d.expected_close,
    notes: d.notes,
    stageChangedAt: d.stage_changed_at,
    lostReason: d.lost_reason,
  }));

  const f = str(sp.f);
  return (
    <div className="animate-in-up">
      <FunisView
        pipelines={pipelines}
        pipelineId={pipelineId}
        stages={stages}
        deals={deals}
        members={(profiles ?? []).map((p) => ({ id: p.id, name: p.full_name || p.email }))}
        companies={(companyRows ?? []).map((c) => c.name)}
        meId={session.userId}
        canDelete={session.org.role !== "seller"}
        view={str(sp.v) === "lista" ? "lista" : "kanban"}
        filter={f === "mine" || f === "stalled" ? f : ""}
        openDealId={str(sp.deal) || null}
        openNew={str(sp.novo) === "1"}
      />
    </div>
  );
}
