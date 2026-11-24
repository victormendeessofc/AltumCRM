"use server";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { formatPhone, normalizePhone, phoneKey } from "@/lib/whatsapp/phone";
import { NOT_CONFIGURED, deliver, internalKey, internalRpc } from "@/lib/whatsapp/server";

export type ConvStatus = "open" | "pending" | "closed";
export type ConvFilter = ConvStatus | "mine";

export interface ConversationItem {
  id: string;
  channelId: string;
  channelName: string;
  phone: string;
  name: string;
  contactId: string | null;
  assigneeId: string | null;
  status: ConvStatus;
  unread: number;
  lastAt: string | null;
  preview: string | null;
  /** Dentro da janela de 24h da API oficial (resposta livre permitida). Em QR Code é sempre true. */
  windowOpen: boolean;
}
export interface MessageItem {
  id: string;
  direction: "in" | "out";
  body: string;
  status: string;
  error: string | null;
  senderId: string | null;
  createdAt: string;
}
export interface ActionState {
  ok?: boolean;
  error?: string;
  id?: string;
}

const UUID = /^[0-9a-f-]{36}$/i;
const DAY = 24 * 60 * 60 * 1000;
const clean = (s: string) => s.replace(/[,()%*\\:"']/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);

function friendly(message: string): string {
  if (message.includes("row-level security")) return "Você não tem permissão para isso.";
  if (message.includes("violates foreign key")) return "A pessoa ou o contato escolhido não existe mais.";
  if (message.includes("Telefone inválido")) return "Telefone inválido. Informe com DDD, por exemplo (11) 91234-5678.";
  if (message.includes("Canal não encontrado")) return "Canal não encontrado.";
  return "Não foi possível concluir. Tente de novo.";
}

type Row = {
  id: string;
  channel_id: string;
  phone: string;
  display_name: string | null;
  contact_id: string | null;
  assignee_id: string | null;
  status: ConvStatus;
  unread_count: number;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_inbound_at: string | null;
};
const COLS = "id, channel_id, phone, display_name, contact_id, assignee_id, status, unread_count, last_message_at, last_message_preview, last_inbound_at";

async function toItems(rows: Row[]): Promise<ConversationItem[]> {
  const session = await requireSession();
  const supabase = await createClient();
  const contactIds = [...new Set(rows.map((r) => r.contact_id).filter((i): i is string => !!i))];
  const channelIds = [...new Set(rows.map((r) => r.channel_id))];
  const [{ data: contacts }, { data: channels }] = await Promise.all([
    contactIds.length ? supabase.from("contacts").select("id, name").eq("org_id", session.org.id).in("id", contactIds) : Promise.resolve({ data: [] }),
    channelIds.length ? supabase.from("whatsapp_channels").select("id, name, provider").in("id", channelIds) : Promise.resolve({ data: [] }),
  ]);
  const cName = new Map((contacts ?? []).map((c) => [c.id, c.name]));
  const ch = new Map((channels ?? []).map((c) => [c.id, c]));
  const now = Date.now();
  return rows.map((r) => {
    const channel = ch.get(r.channel_id);
    return {
      id: r.id,
      channelId: r.channel_id,
      channelName: channel?.name ?? "Canal",
      phone: r.phone,
      name: r.display_name || (r.contact_id ? cName.get(r.contact_id) : "") || formatPhone(r.phone),
      contactId: r.contact_id,
      assigneeId: r.assignee_id,
      status: r.status,
      unread: r.unread_count,
      lastAt: r.last_message_at,
      preview: r.last_message_preview,
      windowOpen: channel?.provider === "cloud" ? !!r.last_inbound_at && now - new Date(r.last_inbound_at).getTime() < DAY : true,
    };
  });
}

export async function listConversations(filter: ConvFilter = "open", q = ""): Promise<ConversationItem[]> {
  const session = await requireSession();
  const supabase = await createClient();
  let query = supabase.from("conversations").select(COLS).eq("org_id", session.org.id).order("last_message_at", { ascending: false, nullsFirst: false }).limit(200);
  query = filter === "mine" ? query.eq("assignee_id", session.userId).neq("status", "closed") : query.eq("status", filter);
  const term = clean(q);
  if (term) query = query.or(`display_name.ilike.%${term}%,phone.ilike.%${term}%`);
  const { data } = await query;
  return toItems((data ?? []) as Row[]);
}

export async function getThread(conversationId: string): Promise<{ conversation: ConversationItem | null; messages: MessageItem[] }> {
  if (!UUID.test(conversationId)) return { conversation: null, messages: [] };
  const session = await requireSession();
  const supabase = await createClient();
  const [{ data: conv }, { data: msgs }] = await Promise.all([
    supabase.from("conversations").select(COLS).eq("id", conversationId).eq("org_id", session.org.id).maybeSingle(),
    supabase.from("messages").select("id, direction, body, status, error, sender_id, created_at").eq("conversation_id", conversationId).eq("org_id", session.org.id).order("created_at", { ascending: false }).limit(200),
  ]);
  if (!conv) return { conversation: null, messages: [] };
  const [item] = await toItems([conv as Row]);
  const messages = (msgs ?? []).reverse().map((m) => ({ id: m.id, direction: m.direction as "in" | "out", body: m.body, status: m.status, error: m.error, senderId: m.sender_id, createdAt: m.created_at }));
  return { conversation: item, messages };
}

export async function sendMessage(conversationId: string, rawBody: string): Promise<ActionState> {
  const body = String(rawBody ?? "").trim();
  if (!body) return { error: "Escreva uma mensagem." };
  if (body.length > 4096) return { error: "A mensagem pode ter até 4.096 caracteres." };
  if (!UUID.test(conversationId)) return { error: "Conversa inválida." };
  if (!internalKey()) return { error: NOT_CONFIGURED };

  const session = await requireSession();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messages")
    .insert({ org_id: session.org.id, conversation_id: conversationId, direction: "out", body, status: "queued", sender_id: session.userId })
    .select("id")
    .single();
  if (error || !data) return { error: "Conversa não encontrada ou sem permissão." };

  // quem responde primeiro assume a conversa
  await supabase.from("conversations").update({ assignee_id: session.userId }).eq("id", conversationId).eq("org_id", session.org.id).is("assignee_id", null);

  try {
    const r = await deliver(data.id);
    return r.ok ? { ok: true, id: data.id } : { error: r.error, id: data.id };
  } catch {
    await internalRpc("wa_message_result", { p_message: data.id, p_status: "failed", p_external_id: null, p_error: "Erro inesperado no envio." });
    return { error: "Erro inesperado no envio. Tente de novo.", id: data.id };
  }
}

export async function setConversationStatus(id: string, status: ConvStatus): Promise<ActionState> {
  if (!UUID.test(id) || !["open", "pending", "closed"].includes(status)) return { error: "Pedido inválido." };
  const session = await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.from("conversations").update({ status }).eq("id", id).eq("org_id", session.org.id);
  if (error) return { error: friendly(error.message) };
  revalidatePath("/conversas");
  return { ok: true };
}

export async function assignConversation(id: string, userId: string | null): Promise<ActionState> {
  if (!UUID.test(id) || (userId !== null && !UUID.test(userId))) return { error: "Pedido inválido." };
  const session = await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.from("conversations").update({ assignee_id: userId }).eq("id", id).eq("org_id", session.org.id);
  if (error) return { error: friendly(error.message) };
  revalidatePath("/conversas");
  return { ok: true };
}

export async function markConversationRead(id: string): Promise<void> {
  if (!UUID.test(id)) return;
  const session = await requireSession();
  const supabase = await createClient();
  await supabase.from("conversations").update({ unread_count: 0 }).eq("id", id).eq("org_id", session.org.id).gt("unread_count", 0);
}

export async function startConversation(_: ActionState | undefined, fd: FormData): Promise<ActionState> {
  await requireSession();
  const channel = String(fd.get("channelId") ?? "");
  const phone = normalizePhone(String(fd.get("phone") ?? ""));
  const name = String(fd.get("name") ?? "").trim().slice(0, 120);
  const contact = String(fd.get("contactId") ?? "");
  if (!UUID.test(channel)) return { error: "Escolha o canal." };
  if (!phone) return { error: "Telefone inválido. Informe com DDD, por exemplo (11) 91234-5678." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_conversation", { p_channel: channel, p_phone: phone, p_name: name || null, p_contact: UUID.test(contact) ? contact : null });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/conversas");
  return { ok: true, id: String(data) };
}

/** Cria um contato a partir da conversa (nome e telefone do WhatsApp) e já vincula. */
export async function createContactFromConversation(conversationId: string): Promise<ActionState> {
  if (!UUID.test(conversationId)) return { error: "Conversa inválida." };
  const session = await requireSession();
  const supabase = await createClient();
  const { data: conv } = await supabase.from("conversations").select("id, phone, display_name, contact_id").eq("id", conversationId).eq("org_id", session.org.id).maybeSingle();
  if (!conv) return { error: "Conversa não encontrada." };
  if (conv.contact_id) return { error: "Esta conversa já tem um contato." };
  const phone = formatPhone(conv.phone);
  let { data: contact, error } = await supabase
    .from("contacts")
    .insert({ org_id: session.org.id, name: (conv.display_name || phone).slice(0, 120), phone, source: "WhatsApp", created_by: session.userId })
    .select("id")
    .single();
  if (error?.message.includes("contacts_phone_uniq")) {
    // já existe um contato com esse telefone (com ou sem o 9): liga a conversa a ele em vez de duplicar
    ({ data: contact, error } = await supabase.from("contacts").select("id").eq("org_id", session.org.id).eq("phone_key", phoneKey(conv.phone) ?? "").limit(1).single());
  }
  if (error || !contact) return { error: friendly(error?.message ?? "") };
  const { error: linkError } = await supabase.from("conversations").update({ contact_id: contact.id }).eq("id", conversationId).eq("org_id", session.org.id);
  if (linkError) return { error: friendly(linkError.message) };
  revalidatePath("/conversas");
  revalidatePath("/contatos");
  return { ok: true, id: contact.id };
}

export async function linkContact(conversationId: string, contactId: string | null): Promise<ActionState> {
  if (!UUID.test(conversationId) || (contactId !== null && !UUID.test(contactId))) return { error: "Pedido inválido." };
  const session = await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.from("conversations").update({ contact_id: contactId }).eq("id", conversationId).eq("org_id", session.org.id);
  if (error) return { error: friendly(error.message) };
  revalidatePath("/conversas");
  return { ok: true };
}
