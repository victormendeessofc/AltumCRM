import { safeFetch, publicHttpsUrl } from "./net";
import { phoneFromJid } from "./phone";
import type { InboundMessage, SendResult } from "./cloud";

/**
 * Conexão por QR Code (leitura do código no WhatsApp do celular) usando o Evolution API v2,
 * um servidor próprio que o cliente hospeda. Não é a API oficial: o WhatsApp pode bloquear números
 * que usam esse tipo de conexão, então a recomendação é usar um número dedicado.
 */
export interface EvolutionConfig {
  url: string;
  key: string;
}
export interface EvoSecrets {
  api_url?: string;
  api_key?: string;
}

/** Credenciais do canal; se faltarem, usa as variáveis do servidor (EVOLUTION_API_URL / EVOLUTION_API_KEY). */
export function evolutionConfig(secrets: EvoSecrets): EvolutionConfig | { error: string } {
  const rawUrl = secrets.api_url || process.env.EVOLUTION_API_URL || "";
  const key = secrets.api_key || process.env.EVOLUTION_API_KEY || "";
  if (!rawUrl || !key) return { error: "Informe o endereço e a chave do servidor de QR Code (Evolution API)." };
  const u = publicHttpsUrl(rawUrl);
  if (!u) return { error: "O endereço do servidor precisa começar com https:// e ser público (não vale localhost nem IP interno)." };
  return { url: u.origin + u.pathname.replace(/\/+$/, ""), key };
}

async function call(cfg: EvolutionConfig, method: string, path: string, body?: unknown): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  try {
    const res = await safeFetch(`${cfg.url}${path}`, {
      method,
      headers: { apikey: cfg.key, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, status: res.status, json };
  } catch {
    return { ok: false, status: 0, json: {} };
  }
}

const EVENTS = ["MESSAGES_UPSERT", "CONNECTION_UPDATE"];

/** Cria a instância (se ainda não existir) e aponta o webhook para o Altum. */
export async function ensureInstance(cfg: EvolutionConfig, instance: string, webhookUrl: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const created = await call(cfg, "POST", "/instance/create", { instanceName: instance, qrcode: true, integration: "WHATSAPP-BAILEYS" });
  if (created.status === 0) return { ok: false, error: "Não foi possível falar com o servidor de QR Code. Confira o endereço e se ele está no ar." };
  if (created.status === 401 || created.status === 403) return { ok: false, error: "O servidor recusou a chave (apikey). Confira a chave informada." };
  // 403/409 "já existe" é aceitável: a instância foi criada antes
  const webhook = { enabled: true, url: webhookUrl, webhookByEvents: false, byEvents: false, webhookBase64: false, base64: false, events: EVENTS };
  let set = await call(cfg, "POST", `/webhook/set/${encodeURIComponent(instance)}`, { webhook });
  if (!set.ok) set = await call(cfg, "POST", `/webhook/set/${encodeURIComponent(instance)}`, webhook);
  if (!set.ok) return { ok: false, error: "A instância foi criada, mas não foi possível configurar o recebimento de mensagens (webhook). Confira a versão do Evolution API (v2)." };
  return { ok: true };
}

export async function getQr(cfg: EvolutionConfig, instance: string): Promise<{ state: "open" | "qr" | "error"; qr?: string; pairingCode?: string; error?: string }> {
  const r = await call(cfg, "GET", `/instance/connect/${encodeURIComponent(instance)}`);
  if (!r.ok) return { state: "error", error: "Não foi possível gerar o QR Code. Tente de novo em instantes." };
  const j = r.json as { base64?: string; code?: string; pairingCode?: string; instance?: { state?: string } };
  if (j.instance?.state === "open") return { state: "open" };
  const img = typeof j.base64 === "string" ? j.base64 : "";
  if (!img.startsWith("data:image/")) return { state: "error", error: "O servidor ainda está preparando o QR Code. Tente de novo em alguns segundos." };
  return { state: "qr", qr: img, pairingCode: j.pairingCode };
}

export async function connectionState(cfg: EvolutionConfig, instance: string): Promise<"open" | "connecting" | "close" | "unknown"> {
  const r = await call(cfg, "GET", `/instance/connectionState/${encodeURIComponent(instance)}`);
  const state = (r.json as { instance?: { state?: string } }).instance?.state;
  return state === "open" || state === "connecting" || state === "close" ? state : "unknown";
}

export async function instanceNumber(cfg: EvolutionConfig, instance: string): Promise<string | null> {
  const r = await call(cfg, "GET", `/instance/fetchInstances?instanceName=${encodeURIComponent(instance)}`);
  const first = (Array.isArray(r.json) ? r.json[0] : r.json) as { ownerJid?: string; instance?: { owner?: string } } | undefined;
  return phoneFromJid(first?.ownerJid ?? first?.instance?.owner ?? null);
}

export async function sendText(cfg: EvolutionConfig, instance: string, to: string, text: string): Promise<SendResult> {
  const r = await call(cfg, "POST", `/message/sendText/${encodeURIComponent(instance)}`, { number: to, text });
  const key = (r.json as { key?: { id?: string } }).key;
  if (r.ok && key?.id) return { ok: true, id: key.id };
  if (r.status === 0) return { ok: false, error: "Não foi possível falar com o servidor de QR Code." };
  if (r.status === 400 || r.status === 404) return { ok: false, error: "O WhatsApp está desconectado ou o número não tem WhatsApp. Reconecte o canal em WhatsApp." };
  return { ok: false, error: "Não foi possível enviar a mensagem." };
}

export async function logout(cfg: EvolutionConfig, instance: string): Promise<void> {
  await call(cfg, "DELETE", `/instance/logout/${encodeURIComponent(instance)}`);
}
export async function removeInstance(cfg: EvolutionConfig, instance: string): Promise<void> {
  await call(cfg, "DELETE", `/instance/delete/${encodeURIComponent(instance)}`);
}

type EvoMessage = {
  conversation?: string;
  extendedTextMessage?: { text?: string };
  imageMessage?: { caption?: string };
  videoMessage?: { caption?: string };
  documentMessage?: { caption?: string; fileName?: string };
  audioMessage?: unknown;
  stickerMessage?: unknown;
  locationMessage?: { name?: string };
  contactMessage?: unknown;
  buttonsResponseMessage?: { selectedDisplayText?: string };
  listResponseMessage?: { title?: string };
};

function describe(m: EvoMessage | undefined): string {
  if (!m) return "[mensagem não suportada]";
  if (m.conversation) return m.conversation;
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
  if (m.imageMessage) return m.imageMessage.caption ? `[imagem] ${m.imageMessage.caption}` : "[imagem]";
  if (m.videoMessage) return m.videoMessage.caption ? `[vídeo] ${m.videoMessage.caption}` : "[vídeo]";
  if (m.audioMessage) return "[áudio]";
  if (m.documentMessage) return `[documento] ${m.documentMessage.caption ?? m.documentMessage.fileName ?? ""}`.trim();
  if (m.stickerMessage) return "[figurinha]";
  if (m.locationMessage) return `[localização] ${m.locationMessage.name ?? ""}`.trim();
  if (m.contactMessage) return "[contato compartilhado]";
  if (m.buttonsResponseMessage?.selectedDisplayText) return m.buttonsResponseMessage.selectedDisplayText;
  if (m.listResponseMessage?.title) return m.listResponseMessage.title;
  return "[mensagem não suportada]";
}

export type EvolutionEvent =
  | { kind: "message"; message: InboundMessage }
  | { kind: "connection"; state: "open" | "connecting" | "close" }
  | { kind: "ignore" };

/** Interpreta o webhook do Evolution API. Mensagens enviadas pelo próprio número (fromMe) e grupos são ignoradas. */
export function parseWebhook(body: unknown): EvolutionEvent {
  const b = body as { event?: string; data?: Record<string, unknown> } | null;
  const event = String(b?.event ?? "").toLowerCase().replace(/_/g, ".");
  const data = b?.data;
  if (!data) return { kind: "ignore" };

  if (event === "connection.update") {
    const state = (data as { state?: string }).state;
    return state === "open" || state === "connecting" || state === "close" ? { kind: "connection", state } : { kind: "ignore" };
  }
  if (event !== "messages.upsert") return { kind: "ignore" };

  const d = data as { key?: { remoteJid?: string; remoteJidAlt?: string; senderPn?: string; fromMe?: boolean; id?: string }; pushName?: string; message?: EvoMessage; messageTimestamp?: number | string };
  if (!d.key || d.key.fromMe || !d.key.id) return { kind: "ignore" };
  const phone = phoneFromJid(d.key.remoteJid) ?? phoneFromJid(d.key.remoteJidAlt) ?? phoneFromJid(d.key.senderPn);
  if (!phone) return { kind: "ignore" };
  const ts = Number(d.messageTimestamp);
  return { kind: "message", message: { phone, name: d.pushName ?? "", body: describe(d.message), id: d.key.id, at: Number.isFinite(ts) && ts > 0 ? new Date(ts * 1000) : new Date() } };
}
