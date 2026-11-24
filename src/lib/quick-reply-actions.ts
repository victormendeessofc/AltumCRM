"use server";
import { revalidatePath } from "next/cache";
import { normalizeShortcut, SHORTCUT_RE, type QuickReply } from "@/lib/quick-replies";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export interface QuickReplyState {
  ok?: boolean;
  error?: string;
}

const UUID = /^[0-9a-f-]{36}$/i;

function friendly(message: string): string {
  if (message.includes("quick_replies_shortcut_uniq")) return "Já existe uma resposta com esse atalho.";
  if (message.includes("row-level security")) return "Só administradores e gerentes cadastram respostas rápidas.";
  return "Não foi possível salvar. Tente de novo.";
}

function read(fd: FormData): { shortcut: string; title: string; body: string } | { error: string } {
  const shortcut = normalizeShortcut(String(fd.get("shortcut") ?? ""));
  const title = String(fd.get("title") ?? "").trim();
  const body = String(fd.get("body") ?? "").trim();
  if (!SHORTCUT_RE.test(shortcut)) return { error: "Informe um atalho (letras, números, - ou _), ex.: preco." };
  if (!title || title.length > 80) return { error: "Dê um nome à resposta (até 80 caracteres)." };
  if (!body || body.length > 4096) return { error: "Escreva o texto da resposta (até 4.096 caracteres)." };
  return { shortcut, title, body };
}

/** Lista para a conversa e para a tela de cadastro (todos da organização podem ler). */
export async function listQuickReplies(): Promise<QuickReply[]> {
  const session = await requireSession();
  const supabase = await createClient();
  const { data } = await supabase.from("quick_replies").select("id, shortcut, title, body").eq("org_id", session.org.id).order("shortcut");
  return (data ?? []) as QuickReply[];
}

export async function createQuickReply(_: QuickReplyState | undefined, fd: FormData): Promise<QuickReplyState> {
  const v = read(fd);
  if ("error" in v) return v;
  const session = await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.from("quick_replies").insert({ org_id: session.org.id, ...v, created_by: session.userId });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/admin");
  revalidatePath("/conversas");
  return { ok: true };
}

export async function updateQuickReply(id: string, fd: FormData): Promise<QuickReplyState> {
  if (!UUID.test(id)) return { error: "Resposta inválida." };
  const v = read(fd);
  if ("error" in v) return v;
  const session = await requireSession();
  const supabase = await createClient();
  const { error, count } = await supabase.from("quick_replies").update(v, { count: "exact" }).eq("id", id).eq("org_id", session.org.id);
  if (error) return { error: friendly(error.message) };
  if (!count) return { error: "Só administradores e gerentes alteram respostas rápidas." };
  revalidatePath("/admin");
  revalidatePath("/conversas");
  return { ok: true };
}

export async function deleteQuickReply(id: string): Promise<QuickReplyState> {
  if (!UUID.test(id)) return { error: "Resposta inválida." };
  const session = await requireSession();
  const supabase = await createClient();
  const { error, count } = await supabase.from("quick_replies").delete({ count: "exact" }).eq("id", id).eq("org_id", session.org.id);
  if (error) return { error: friendly(error.message) };
  if (!count) return { error: "Só administradores e gerentes apagam respostas rápidas." };
  revalidatePath("/admin");
  revalidatePath("/conversas");
  return { ok: true };
}
