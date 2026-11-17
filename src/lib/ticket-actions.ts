"use server";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export interface TicketState {
  ok?: boolean;
  error?: string;
  id?: string;
}

const UUID = /^[0-9a-f-]{36}$/i;
const STATUSES = ["open", "in_progress", "resolved"];
const PRIORITIES = ["low", "normal", "high"];

function friendly(message: string): string {
  if (message.includes("row-level security")) return "Você não tem permissão para isso.";
  if (message.includes("violates foreign key")) return "A pessoa escolhida não faz mais parte da equipe.";
  return "Não foi possível salvar. Tente de novo.";
}

export async function createTicket(_: TicketState | undefined, fd: FormData): Promise<TicketState> {
  const session = await requireSession();
  const title = String(fd.get("title") ?? "").trim();
  const body = String(fd.get("body") ?? "").trim();
  const priority = String(fd.get("priority") ?? "normal");
  const assignee = String(fd.get("assigneeId") ?? "");
  if (title.length < 3 || title.length > 160) return { error: "Descreva o assunto em poucas palavras (3 a 160 letras)." };
  if (body.length > 5000) return { error: "O texto pode ter até 5.000 caracteres." };
  if (!PRIORITIES.includes(priority)) return { error: "Prioridade inválida." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tickets")
    .insert({ org_id: session.org.id, title, body: body || null, priority, requester_id: session.userId, assignee_id: UUID.test(assignee) ? assignee : null })
    .select("id")
    .single();
  if (error || !data) return { error: friendly(error?.message ?? "") };
  revalidatePath("/suporte");
  return { ok: true, id: data.id };
}

export async function updateTicket(id: string, patch: { status?: string; priority?: string; assigneeId?: string | null }): Promise<TicketState> {
  if (!UUID.test(id)) return { error: "Chamado inválido." };
  const update: Record<string, unknown> = {};
  if (patch.status !== undefined) {
    if (!STATUSES.includes(patch.status)) return { error: "Status inválido." };
    update.status = patch.status;
  }
  if (patch.priority !== undefined) {
    if (!PRIORITIES.includes(patch.priority)) return { error: "Prioridade inválida." };
    update.priority = patch.priority;
  }
  if (patch.assigneeId !== undefined) {
    if (patch.assigneeId !== null && !UUID.test(patch.assigneeId)) return { error: "Responsável inválido." };
    update.assignee_id = patch.assigneeId;
  }
  if (Object.keys(update).length === 0) return { ok: true };
  const session = await requireSession();
  const supabase = await createClient();
  const { error, count } = await supabase.from("tickets").update(update, { count: "exact" }).eq("id", id).eq("org_id", session.org.id);
  if (error) return { error: friendly(error.message) };
  if (!count) return { error: "Só quem abriu o chamado, o responsável ou um gerente pode alterá-lo." };
  revalidatePath("/suporte");
  return { ok: true };
}

export async function addTicketComment(ticketId: string, rawBody: string): Promise<TicketState> {
  const body = String(rawBody ?? "").trim();
  if (!UUID.test(ticketId)) return { error: "Chamado inválido." };
  if (!body) return { error: "Escreva o comentário." };
  if (body.length > 5000) return { error: "O comentário pode ter até 5.000 caracteres." };
  const session = await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.from("ticket_comments").insert({ org_id: session.org.id, ticket_id: ticketId, body, author_id: session.userId });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/suporte");
  return { ok: true };
}

export async function deleteTicket(id: string): Promise<TicketState> {
  if (!UUID.test(id)) return { error: "Chamado inválido." };
  const session = await requireSession();
  const supabase = await createClient();
  const { error, count } = await supabase.from("tickets").delete({ count: "exact" }).eq("id", id).eq("org_id", session.org.id);
  if (error) return { error: friendly(error.message) };
  if (!count) return { error: "Só quem abriu o chamado ou um gerente pode excluí-lo." };
  revalidatePath("/suporte");
  return { ok: true };
}
