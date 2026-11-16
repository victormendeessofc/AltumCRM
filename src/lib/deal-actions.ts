"use server";
import { revalidatePath } from "next/cache";
import { ensureCompany } from "@/lib/companies";
import { validateDeal } from "@/lib/deals";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export interface DealState {
  error?: string;
  ok?: boolean;
  id?: string;
}
export interface Result {
  error?: string;
  ok?: boolean;
}
export interface TimelineItem {
  id: string;
  kind: string;
  body: string | null;
  meta: Record<string, unknown>;
  actor: string | null;
  createdAt: string;
}

function friendly(message: string): string {
  if (message.includes("row-level security")) return "Você não tem permissão para isso.";
  if (message.includes("violates foreign key")) return "Algum item vinculado não existe mais. Atualize a página.";
  if (message.includes("Etapa inválida")) return "Etapa inválida para este funil.";
  if (message.includes("violates check constraint")) return "Algum campo está fora do limite permitido.";
  return "Não foi possível salvar. Tente de novo.";
}

const uuid = (v: unknown) => {
  const s = String(v ?? "");
  return /^[0-9a-f-]{36}$/i.test(s) ? s : null;
};

export async function saveDeal(_: DealState | undefined, fd: FormData): Promise<DealState> {
  const session = await requireSession();
  const v = validateDeal(Object.fromEntries(fd));
  if (!v.ok) return { error: v.error };
  const id = uuid(fd.get("id"));
  const supabase = await createClient();
  const companyId = v.value.company ? await ensureCompany(supabase, session.org.id, session.userId, v.value.company) : null;
  const common = {
    title: v.value.title,
    value: v.value.value,
    contact_id: uuid(fd.get("contactId")),
    company_id: companyId,
    owner_id: uuid(fd.get("ownerId")),
    expected_close: v.value.expectedClose,
    notes: v.value.notes,
  };

  if (id) {
    const { error } = await supabase.from("deals").update(common).eq("id", id).eq("org_id", session.org.id);
    if (error) return { error: friendly(error.message) };
    revalidatePath("/funis");
    return { ok: true, id };
  }
  const pipelineId = uuid(fd.get("pipelineId"));
  const stageId = uuid(fd.get("stageId"));
  if (!pipelineId || !stageId) return { error: "Escolha o funil e a etapa." };
  const { data, error } = await supabase
    .from("deals")
    .insert({ ...common, org_id: session.org.id, pipeline_id: pipelineId, stage_id: stageId, created_by: session.userId })
    .select("id")
    .single();
  if (error) return { error: friendly(error.message) };
  revalidatePath("/funis");
  return { ok: true, id: data.id };
}

/** Move o negócio de etapa (arrastar no kanban). Para "Perdido", o motivo é opcional. */
export async function moveDeal(dealId: string, stageId: string, lostReason?: string): Promise<Result> {
  const session = await requireSession();
  const supabase = await createClient();
  const patch: { stage_id: string; lost_reason?: string | null } = { stage_id: stageId };
  if (lostReason !== undefined) patch.lost_reason = lostReason.trim().slice(0, 300) || null;
  const { error } = await supabase.from("deals").update(patch).eq("id", dealId).eq("org_id", session.org.id);
  if (error) return { error: friendly(error.message) };
  revalidatePath("/funis");
  revalidatePath("/painel");
  return { ok: true };
}

export async function deleteDeal(id: string): Promise<Result> {
  const session = await requireSession();
  if (session.org.role === "seller") return { error: "Apenas administradores e gerentes excluem negócios." };
  const supabase = await createClient();
  const { error } = await supabase.from("deals").delete().eq("id", id).eq("org_id", session.org.id);
  if (error) return { error: friendly(error.message) };
  revalidatePath("/funis");
  return { ok: true };
}

export async function addActivity(dealId: string, kind: string, body: string): Promise<Result> {
  const session = await requireSession();
  if (!["note", "call", "meeting", "email"].includes(kind)) return { error: "Tipo inválido." };
  const text = body.trim().slice(0, 5000);
  if (!text) return { error: "Escreva algo antes de registrar." };
  const supabase = await createClient();
  const { error } = await supabase.from("activities").insert({ org_id: session.org.id, deal_id: dealId, kind, body: text, actor_id: session.userId });
  if (error) return { error: friendly(error.message) };
  return { ok: true };
}

export async function getTimeline(dealId: string): Promise<TimelineItem[]> {
  const session = await requireSession();
  const supabase = await createClient();
  const { data } = await supabase
    .from("activities")
    .select("id, kind, body, meta, actor_id, created_at")
    .eq("org_id", session.org.id)
    .eq("deal_id", dealId)
    .order("created_at", { ascending: false })
    .limit(100);
  const ids = [...new Set((data ?? []).map((a) => a.actor_id).filter((i): i is string => !!i))];
  const { data: profiles } = ids.length ? await supabase.from("profiles").select("id, full_name, email").in("id", ids) : { data: [] };
  const name = new Map((profiles ?? []).map((p) => [p.id, p.full_name || p.email]));
  return (data ?? []).map((a) => ({
    id: a.id,
    kind: a.kind,
    body: a.body,
    meta: (a.meta ?? {}) as Record<string, unknown>,
    actor: a.actor_id ? (name.get(a.actor_id) ?? null) : null,
    createdAt: a.created_at,
  }));
}
