"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseMoney } from "@/lib/money";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export interface OrgState {
  error?: string;
  ok?: boolean;
}
export interface Res {
  error?: string;
  ok?: boolean;
}

const NOT_ADMIN = "Apenas administradores podem fazer isso.";

function friendly(message: string): string {
  if (message.includes("violates foreign key")) return "Existem negócios nesta etapa ou neste funil. Mova ou exclua os negócios antes.";
  if (message.includes("row-level security") || message.includes("42501")) return NOT_ADMIN;
  if (message.includes("violates check constraint")) return "Algum campo está fora do limite permitido.";
  return "Não foi possível concluir. Tente de novo.";
}


// --------------------------------------------------------------- organização
export async function updateOrganization(_: OrgState | undefined, fd: FormData): Promise<OrgState> {
  const session = await requireSession();
  if (session.org.role !== "admin") return { error: NOT_ADMIN };
  const name = String(fd.get("name") ?? "").trim();
  if (name.length < 2 || name.length > 80) return { error: "O nome precisa ter entre 2 e 80 caracteres." };
  const goal = parseMoney(fd.get("monthlyGoal"));
  if (goal === null) return { error: "Meta inválida. Use números, por exemplo 50.000." };
  const supabase = await createClient();
  const { error } = await supabase.from("organizations").update({ name, monthly_goal: goal }).eq("id", session.org.id);
  if (error) return { error: friendly(error.message) };
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Exclui a organização e TODOS os dados dela. Exige digitar o nome exato. */
export async function deleteOrganization(confirmName: string): Promise<Res> {
  const session = await requireSession();
  if (session.org.role !== "admin") return { error: NOT_ADMIN };
  if (confirmName.trim() !== session.org.name) return { error: "O nome digitado não confere." };
  const supabase = await createClient();
  const { error, count } = await supabase.from("organizations").delete({ count: "exact" }).eq("id", session.org.id);
  if (error) return { error: friendly(error.message) };
  if (!count) return { error: "Não foi possível excluir." };
  redirect("/onboarding");
}

// --------------------------------------------------------------- funis e etapas
export async function createPipeline(name: string): Promise<Res> {
  const session = await requireSession();
  if (session.org.role !== "admin") return { error: NOT_ADMIN };
  const n = name.trim();
  if (!n || n.length > 80) return { error: "Dê um nome ao funil (até 80 caracteres)." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_pipeline", { p_org: session.org.id, p_name: n });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/admin");
  revalidatePath("/funis");
  return { ok: true };
}

export async function renamePipeline(id: string, name: string): Promise<Res> {
  const session = await requireSession();
  if (session.org.role !== "admin") return { error: NOT_ADMIN };
  const n = name.trim();
  if (!n || n.length > 80) return { error: "Dê um nome ao funil (até 80 caracteres)." };
  const supabase = await createClient();
  const { error } = await supabase.from("pipelines").update({ name: n }).eq("id", id).eq("org_id", session.org.id);
  if (error) return { error: friendly(error.message) };
  revalidatePath("/admin");
  revalidatePath("/funis");
  return { ok: true };
}

export async function deletePipeline(id: string): Promise<Res> {
  const session = await requireSession();
  if (session.org.role !== "admin") return { error: NOT_ADMIN };
  const supabase = await createClient();
  const { count } = await supabase.from("pipelines").select("id", { count: "exact", head: true }).eq("org_id", session.org.id);
  if ((count ?? 0) <= 1) return { error: "A organização precisa ter pelo menos um funil." };
  const { error } = await supabase.from("pipelines").delete().eq("id", id).eq("org_id", session.org.id);
  if (error) return { error: friendly(error.message) };
  revalidatePath("/admin");
  revalidatePath("/funis");
  return { ok: true };
}

/** Renumera todas as etapas de um funil de 10 em 10, na ordem dada. */
async function renumber(supabase: Awaited<ReturnType<typeof createClient>>, ordered: string[]) {
  for (let i = 0; i < ordered.length; i++) {
    await supabase.from("stages").update({ position: i * 10 }).eq("id", ordered[i]);
  }
}

export async function addStage(pipelineId: string, name: string, probability: number): Promise<Res> {
  const session = await requireSession();
  if (session.org.role !== "admin") return { error: NOT_ADMIN };
  const n = name.trim();
  if (!n || n.length > 60) return { error: "Dê um nome à etapa (até 60 caracteres)." };
  const p = Math.min(100, Math.max(0, Math.round(Number(probability) || 0)));
  const supabase = await createClient();
  const { data: all } = await supabase.from("stages").select("id, kind, position").eq("pipeline_id", pipelineId).order("position");
  if (!all || all.length >= 20) return { error: "Limite de 20 etapas por funil." };
  const { data: created, error } = await supabase
    .from("stages")
    .insert({ org_id: session.org.id, pipeline_id: pipelineId, name: n, probability: p, kind: "open", position: 9999 })
    .select("id")
    .single();
  if (error) return { error: friendly(error.message) };
  // entra depois da última etapa aberta, antes de Ganho/Perdido
  const open = all.filter((s) => s.kind === "open").map((s) => s.id);
  const closed = all.filter((s) => s.kind !== "open").map((s) => s.id);
  await renumber(supabase, [...open, created.id, ...closed]);
  revalidatePath("/admin");
  revalidatePath("/funis");
  return { ok: true };
}

export async function updateStage(id: string, name: string, probability: number): Promise<Res> {
  const session = await requireSession();
  if (session.org.role !== "admin") return { error: NOT_ADMIN };
  const n = name.trim();
  if (!n || n.length > 60) return { error: "Dê um nome à etapa (até 60 caracteres)." };
  const p = Math.min(100, Math.max(0, Math.round(Number(probability) || 0)));
  const supabase = await createClient();
  const { error } = await supabase.from("stages").update({ name: n, probability: p }).eq("id", id).eq("org_id", session.org.id);
  if (error) return { error: friendly(error.message) };
  revalidatePath("/admin");
  revalidatePath("/funis");
  return { ok: true };
}

export async function moveStage(id: string, direction: -1 | 1): Promise<Res> {
  const session = await requireSession();
  if (session.org.role !== "admin") return { error: NOT_ADMIN };
  const supabase = await createClient();
  const { data: stage } = await supabase.from("stages").select("pipeline_id, kind").eq("id", id).single();
  if (!stage || stage.kind !== "open") return { error: "Só as etapas intermediárias podem ser reordenadas." };
  const { data: all } = await supabase.from("stages").select("id, kind").eq("pipeline_id", stage.pipeline_id).order("position");
  const order = (all ?? []).map((s) => s.id);
  const kinds = new Map((all ?? []).map((s) => [s.id, s.kind]));
  const i = order.indexOf(id);
  const j = i + direction;
  if (j < 0 || j >= order.length || kinds.get(order[j]) !== "open") return { ok: true };
  [order[i], order[j]] = [order[j], order[i]];
  await renumber(supabase, order);
  revalidatePath("/admin");
  revalidatePath("/funis");
  return { ok: true };
}

export async function deleteStage(id: string): Promise<Res> {
  const session = await requireSession();
  if (session.org.role !== "admin") return { error: NOT_ADMIN };
  const supabase = await createClient();
  const { data: stage } = await supabase.from("stages").select("kind").eq("id", id).single();
  if (!stage) return { error: "Etapa não encontrada." };
  if (stage.kind !== "open") return { error: "As etapas Ganho e Perdido não podem ser excluídas." };
  const { error } = await supabase.from("stages").delete().eq("id", id).eq("org_id", session.org.id);
  if (error) return { error: friendly(error.message) };
  revalidatePath("/admin");
  revalidatePath("/funis");
  return { ok: true };
}

