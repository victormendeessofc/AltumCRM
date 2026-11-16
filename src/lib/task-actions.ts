"use server";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { validateTask } from "@/lib/tasks";

export interface TaskState {
  error?: string;
  ok?: boolean;
}

const uuid = (v: unknown) => {
  const s = String(v ?? "");
  return /^[0-9a-f-]{36}$/i.test(s) ? s : null;
};

function friendly(message: string): string {
  if (message.includes("row-level security")) return "Você não tem permissão para isso.";
  if (message.includes("violates foreign key")) return "O negócio, contato ou responsável escolhido não existe mais.";
  return "Não foi possível salvar. Tente de novo.";
}

export async function saveTask(_: TaskState | undefined, fd: FormData): Promise<TaskState> {
  const session = await requireSession();
  const v = validateTask(Object.fromEntries(fd));
  if (!v.ok) return { error: v.error };
  const id = uuid(fd.get("id"));
  const common = {
    title: v.value.title,
    notes: v.value.notes,
    due_at: v.value.dueAt,
    assignee_id: uuid(fd.get("assigneeId")),
    deal_id: uuid(fd.get("dealId")),
    contact_id: uuid(fd.get("contactId")),
  };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("tasks").update(common).eq("id", id).eq("org_id", session.org.id)
    : await supabase.from("tasks").insert({ ...common, org_id: session.org.id, created_by: session.userId });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/tarefas");
  revalidatePath("/painel");
  return { ok: true };
}

export async function toggleTask(id: string, done: boolean): Promise<TaskState> {
  const session = await requireSession();
  const supabase = await createClient();
  const { error } = await supabase
    .from("tasks")
    .update({ done_at: done ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("org_id", session.org.id);
  if (error) return { error: friendly(error.message) };
  revalidatePath("/tarefas");
  revalidatePath("/painel");
  return { ok: true };
}

export async function deleteTask(id: string): Promise<TaskState> {
  const session = await requireSession();
  const supabase = await createClient();
  const { error, count } = await supabase.from("tasks").delete({ count: "exact" }).eq("id", id).eq("org_id", session.org.id);
  if (error) return { error: friendly(error.message) };
  if (!count) return { error: "Você só exclui tarefas criadas por você ou atribuídas a você." };
  revalidatePath("/tarefas");
  revalidatePath("/painel");
  return { ok: true };
}
