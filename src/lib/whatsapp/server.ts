import { timingSafeEqual } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import * as cloud from "./cloud";
import * as evo from "./evolution";

/**
 * Ponte entre o servidor do app e o banco para o que não tem usuário logado (webhooks) ou precisa dos segredos do canal
 * (envio). Toda chamada leva a "chave interna" (ALTUM_INTERNAL_KEY); sem ela o banco recusa. Nada daqui vai para o navegador.
 */
export function internalKey(): string | null {
  const k = process.env.ALTUM_INTERNAL_KEY;
  return k && k.length >= 32 ? k : null;
}

export const NOT_CONFIGURED = "O Atendimento ainda não foi ativado no servidor (falta a variável ALTUM_INTERNAL_KEY na Vercel).";

export async function internalRpc<T>(fn: string, args: Record<string, unknown>): Promise<{ data: T | null; error: string | null }> {
  const key = internalKey();
  if (!key) return { data: null, error: NOT_CONFIGURED };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, { p_key: key, ...args });
  return { data: (data ?? null) as T | null, error: error?.message ?? null };
}

export function safeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export interface ServerChannel {
  id: string;
  org_id: string;
  provider: "cloud" | "qr";
  external_id: string | null;
  status: string;
  secrets: Record<string, string>;
}

export async function loadChannel(channelId: string): Promise<ServerChannel | null> {
  const { data } = await internalRpc<ServerChannel>("wa_channel_for_server", { p_channel: channelId });
  return data;
}

export function webhookUrl(origin: string, channelId: string, secret: string): string {
  return `${origin}/api/whatsapp/${channelId}?s=${secret}`;
}

interface SendPayload {
  message_id: string;
  body: string;
  phone: string;
  last_inbound_at: string | null;
  channel: ServerChannel | null;
}

const DAY = 24 * 60 * 60 * 1000;

/** Envia uma mensagem que já está gravada na fila (status "queued") e registra o resultado. */
export async function deliver(messageId: string): Promise<{ ok: boolean; error?: string }> {
  const { data: p, error } = await internalRpc<SendPayload>("wa_message_for_send", { p_message: messageId });
  if (error) return { ok: false, error: error === NOT_CONFIGURED ? error : "Não foi possível preparar o envio." };
  if (!p || !p.channel) return { ok: false, error: "Mensagem não encontrada na fila." };

  const ch = p.channel;
  let result: cloud.SendResult;
  if (ch.provider === "cloud") {
    const token = ch.secrets.access_token;
    if (!token || !ch.external_id) {
      result = { ok: false, error: "O canal está sem o token de acesso ou o ID do número. Edite o canal em WhatsApp." };
    } else if (!p.last_inbound_at || Date.now() - new Date(p.last_inbound_at).getTime() > DAY) {
      result = { ok: false, error: "Passaram mais de 24 horas desde a última mensagem do cliente (ou ele ainda não escreveu). Nesse caso o WhatsApp só permite enviar um modelo de mensagem aprovado." };
    } else {
      result = await cloud.sendText(ch.external_id, token, p.phone, p.body);
    }
  } else {
    const cfg = evo.evolutionConfig(ch.secrets);
    result = "error" in cfg || !ch.external_id ? { ok: false, error: "error" in cfg ? cfg.error : "Canal sem instância configurada." } : await evo.sendText(cfg, ch.external_id, p.phone, p.body);
  }

  await internalRpc("wa_message_result", {
    p_message: messageId,
    p_status: result.ok ? "sent" : "failed",
    p_external_id: result.ok ? result.id : null,
    p_error: result.ok ? null : result.error,
  });
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}
