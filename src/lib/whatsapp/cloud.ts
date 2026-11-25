import { createHmac, timingSafeEqual } from "node:crypto";
import { normalizePhone } from "./phone";
import { safeFetch } from "./net";

/** API oficial do WhatsApp (Cloud API da Meta). */
export const GRAPH = "https://graph.facebook.com/v27.0";

export interface CloudSecrets {
  access_token?: string;
  app_secret?: string;
}
export type SendResult = { ok: true; id: string } | { ok: false; error: string };

export interface InboundMessage {
  phone: string;
  name: string;
  body: string;
  id: string;
  at: Date;
}
export interface StatusUpdate {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  /** Motivo, quando a Meta avisa a falha depois de ter aceitado o envio. */
  error?: string;
}

/** Códigos de erro da Meta que o usuário consegue entender e resolver. */
export function friendlyCloudError(code: number | undefined, message: string): string {
  if (code === 131047 || code === 131051) return "Passaram mais de 24 horas desde a última mensagem do cliente. Nesse caso o WhatsApp só permite enviar um modelo de mensagem aprovado.";
  if (code === 190 || code === 102) return "O token de acesso expirou ou é inválido. Gere um novo no painel da Meta e atualize o canal.";
  if (code === 131030) return "Esse número não está na lista de destinatários permitidos (modo de teste da Meta).";
  if (code === 131026) return "Esse número não tem WhatsApp ou não pôde receber a mensagem.";
  if (code === 4 || code === 80007 || code === 130429) return "Limite de envios da Meta atingido. Tente de novo em alguns minutos.";
  return message ? `Falha no envio: ${message}`.slice(0, 280) : "Não foi possível enviar a mensagem.";
}

export async function sendText(phoneNumberId: string, token: string, to: string, body: string): Promise<SendResult> {
  try {
    const res = await safeFetch(`${GRAPH}/${encodeURIComponent(phoneNumberId)}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      // Responde para o número EXATAMENTE como o WhatsApp mandou (wa_id). Contas brasileiras antigas chegam sem o 9 e só
      // recebem nesse formato; o 9 é recolocado apenas na exibição (formatPhone).
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { preview_url: false, body } }),
    });
    const json = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { code?: number; message?: string } };
    if (res.ok && json.messages?.[0]?.id) return { ok: true, id: json.messages[0].id };
    return { ok: false, error: friendlyCloudError(json.error?.code, json.error?.message ?? "") };
  } catch {
    return { ok: false, error: "Não foi possível falar com o WhatsApp agora. Tente de novo." };
  }
}

/** Confere token e número: devolve o telefone exibido na Meta. */
export async function checkNumber(phoneNumberId: string, token: string): Promise<{ ok: true; phone: string; name: string } | { ok: false; error: string }> {
  try {
    const res = await safeFetch(`${GRAPH}/${encodeURIComponent(phoneNumberId)}?fields=display_phone_number,verified_name`, { headers: { Authorization: `Bearer ${token}` } });
    const json = (await res.json().catch(() => ({}))) as { display_phone_number?: string; verified_name?: string; error?: { code?: number; message?: string } };
    if (res.ok && json.display_phone_number) return { ok: true, phone: json.display_phone_number, name: json.verified_name ?? "" };
    return { ok: false, error: friendlyCloudError(json.error?.code, json.error?.message ?? "Número ou token inválido.") };
  } catch {
    return { ok: false, error: "Não foi possível falar com a Meta agora. Tente de novo." };
  }
}

/** A Meta assina cada chamada com HMAC-SHA256 do corpo usando o "App Secret". */
export function verifySignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const got = header.slice(7);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(got, "hex");
  return a.length === b.length && b.length > 0 && timingSafeEqual(a, b);
}

type Msg = {
  from?: string;
  id?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  image?: { caption?: string };
  video?: { caption?: string };
  document?: { caption?: string; filename?: string };
  button?: { text?: string };
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
  location?: { name?: string };
};

function describe(m: Msg): string {
  switch (m.type) {
    case "text":
      return m.text?.body ?? "";
    case "image":
      return m.image?.caption ? `[imagem] ${m.image.caption}` : "[imagem]";
    case "video":
      return m.video?.caption ? `[vídeo] ${m.video.caption}` : "[vídeo]";
    case "audio":
      return "[áudio]";
    case "voice":
      return "[áudio]";
    case "document":
      return `[documento] ${m.document?.caption ?? m.document?.filename ?? ""}`.trim();
    case "sticker":
      return "[figurinha]";
    case "location":
      return `[localização] ${m.location?.name ?? ""}`.trim();
    case "contacts":
      return "[contato compartilhado]";
    case "button":
      return m.button?.text ?? "[resposta de botão]";
    case "interactive":
      return m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? "[resposta interativa]";
    default:
      return "[mensagem não suportada]";
  }
}

/** IDs de número (phone_number_id) presentes no aviso. O webhook único da Agência usa isso para achar os canais. */
export function phoneNumberIds(body: unknown): string[] {
  const ids = new Set<string>();
  const entries = (body as { entry?: unknown[] } | null)?.entry;
  if (!Array.isArray(entries)) return [];
  for (const e of entries) {
    for (const ch of ((e as { changes?: unknown[] }).changes ?? []) as { field?: string; value?: { metadata?: { phone_number_id?: unknown } } }[]) {
      const id = ch.field === "messages" ? ch.value?.metadata?.phone_number_id : undefined;
      if (typeof id === "string" && /^\d{5,30}$/.test(id)) ids.add(id);
    }
  }
  return [...ids];
}

/** Assinatura conferida contra vários segredos (um por app da Meta); basta um bater. */
export function verifySignatureAny(rawBody: string, header: string | null, secrets: string[]): boolean {
  return secrets.some((s) => verifySignature(rawBody, header, s));
}

/** Extrai mensagens recebidas e atualizações de entrega do corpo do webhook. Ignora o que não for do número do canal. */
export function parseWebhook(body: unknown, phoneNumberId: string | null): { messages: InboundMessage[]; statuses: StatusUpdate[] } {
  const out = { messages: [] as InboundMessage[], statuses: [] as StatusUpdate[] };
  const entries = (body as { entry?: unknown[] } | null)?.entry;
  if (!Array.isArray(entries)) return out;
  for (const e of entries) {
    for (const ch of ((e as { changes?: unknown[] }).changes ?? []) as { field?: string; value?: Record<string, unknown> }[]) {
      const v = ch.value;
      if (!v || ch.field !== "messages") continue;
      const metaId = (v.metadata as { phone_number_id?: string } | undefined)?.phone_number_id;
      if (phoneNumberId && metaId && metaId !== phoneNumberId) continue;
      const names = new Map<string, string>();
      for (const c of (v.contacts as { wa_id?: string; profile?: { name?: string } }[] | undefined) ?? []) {
        if (c.wa_id) names.set(c.wa_id, c.profile?.name ?? "");
      }
      for (const m of (v.messages as Msg[] | undefined) ?? []) {
        const phone = normalizePhone(m.from ?? "");
        if (!phone || !m.id) continue;
        const ts = Number(m.timestamp);
        out.messages.push({ phone, name: names.get(m.from ?? "") ?? "", body: describe(m), id: m.id, at: Number.isFinite(ts) && ts > 0 ? new Date(ts * 1000) : new Date() });
      }
      type RawStatus = { id?: string; status?: string; errors?: { code?: number; title?: string; message?: string; error_data?: { details?: string } }[] };
      for (const s of (v.statuses as RawStatus[] | undefined) ?? []) {
        if (!s.id || !(s.status === "sent" || s.status === "delivered" || s.status === "read" || s.status === "failed")) continue;
        const e = s.status === "failed" ? s.errors?.[0] : undefined;
        const why = e ? `${friendlyCloudError(e.code, e.error_data?.details ?? e.message ?? e.title ?? "")}${e.code ? ` (código ${e.code})` : ""}` : undefined;
        out.statuses.push({ id: s.id, status: s.status, ...(why ? { error: why } : {}) });
      }
    }
  }
  return out;
}
