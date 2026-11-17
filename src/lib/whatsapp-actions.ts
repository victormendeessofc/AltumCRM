"use server";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getOrigin } from "@/lib/origin";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import * as cloud from "@/lib/whatsapp/cloud";
import * as evo from "@/lib/whatsapp/evolution";
import { NOT_CONFIGURED, internalKey, internalRpc, loadChannel, webhookUrl, type ServerChannel } from "@/lib/whatsapp/server";

export interface WaState {
  ok?: boolean;
  error?: string;
  channelId?: string;
}
export interface SetupInfo {
  webhookUrl: string;
  verifyToken: string;
  configured: string[];
}
export interface QrResult {
  error?: string;
  state?: "open" | "qr";
  qr?: string;
  pairingCode?: string;
}
export interface CheckResult {
  error?: string;
  status?: "connected" | "connecting" | "disconnected" | "error";
  detail?: string;
}

const NOT_ADMIN = "Apenas administradores configuram o WhatsApp.";
const UUID = /^[0-9a-f-]{36}$/i;
const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

function friendly(message: string): string {
  if (message.includes("Apenas administradores") || message.includes("row-level security")) return NOT_ADMIN;
  return "Não foi possível concluir. Tente de novo.";
}

/** Garante: usuário admin da organização ativa, canal dela, e servidor com a chave interna. Devolve o canal com segredos. */
async function adminChannel(channelId: string): Promise<{ error: string } | { channel: ServerChannel }> {
  const session = await requireSession();
  if (session.org.role !== "admin") return { error: NOT_ADMIN };
  if (!UUID.test(channelId)) return { error: "Canal inválido." };
  if (!internalKey()) return { error: NOT_CONFIGURED };
  const supabase = await createClient();
  const { data } = await supabase.from("whatsapp_channels").select("id").eq("id", channelId).eq("org_id", session.org.id).maybeSingle();
  if (!data) return { error: "Canal não encontrado." };
  const channel = await loadChannel(channelId);
  return channel ? { channel } : { error: "Canal não encontrado." };
}

export async function createChannel(_: WaState | undefined, fd: FormData): Promise<WaState> {
  const session = await requireSession();
  if (session.org.role !== "admin") return { error: NOT_ADMIN };
  if (!internalKey()) return { error: NOT_CONFIGURED };

  const provider = text(fd, "provider");
  const name = text(fd, "name");
  if (name.length < 1 || name.length > 60) return { error: "Dê um nome ao canal (até 60 letras). Ex.: Comercial." };

  let externalId: string;
  const secrets: Record<string, string> = {};
  if (provider === "cloud") {
    const phoneId = text(fd, "phone_number_id");
    const token = text(fd, "access_token");
    if (!/^\d{5,30}$/.test(phoneId)) return { error: "O ID do número de telefone tem só dígitos (está no painel da Meta, em WhatsApp > Configuração da API)." };
    if (token.length < 20) return { error: "Cole o token de acesso permanente gerado na Meta." };
    externalId = phoneId;
    secrets.access_token = token;
    if (text(fd, "app_secret")) secrets.app_secret = text(fd, "app_secret");
  } else if (provider === "qr") {
    const check = evo.evolutionConfig({ api_url: text(fd, "api_url"), api_key: text(fd, "api_key") });
    if ("error" in check) return { error: check.error };
    externalId = `altum-${randomBytes(5).toString("hex")}`;
    if (text(fd, "api_url")) secrets.api_url = text(fd, "api_url");
    if (text(fd, "api_key")) secrets.api_key = text(fd, "api_key");
  } else {
    return { error: "Escolha como conectar: API oficial ou QR Code." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_whatsapp_channel", { p_org: session.org.id, p_provider: provider, p_name: name, p_external_id: externalId, p_secrets: secrets });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/whatsapp");
  return { ok: true, channelId: String(data) };
}

/** Dados que o administrador cola no painel da Meta (endereço do webhook e token de verificação). */
export async function getSetupInfo(channelId: string): Promise<SetupInfo | { error: string }> {
  const session = await requireSession();
  if (session.org.role !== "admin") return { error: NOT_ADMIN };
  if (!UUID.test(channelId)) return { error: "Canal inválido." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("channel_setup_info", { p_channel: channelId });
  if (error || !data) return { error: friendly(error?.message ?? "") };
  const info = data as { webhook_secret: string; configured: string[] };
  return { webhookUrl: webhookUrl(await getOrigin(), channelId, info.webhook_secret), verifyToken: info.webhook_secret, configured: info.configured };
}

/** Atualiza nome e/ou segredos (campos em branco mantêm o valor atual). */
export async function updateChannel(_: WaState | undefined, fd: FormData): Promise<WaState> {
  const session = await requireSession();
  if (session.org.role !== "admin") return { error: NOT_ADMIN };
  const id = text(fd, "id");
  if (!UUID.test(id)) return { error: "Canal inválido." };
  const supabase = await createClient();
  const name = text(fd, "name");
  if (name) {
    if (name.length > 60) return { error: "O nome pode ter até 60 letras." };
    const { error } = await supabase.from("whatsapp_channels").update({ name }).eq("id", id).eq("org_id", session.org.id);
    if (error) return { error: friendly(error.message) };
  }
  const secrets: Record<string, string> = {};
  for (const k of ["access_token", "app_secret", "api_url", "api_key"]) if (text(fd, k)) secrets[k] = text(fd, k);
  if (secrets.api_url && "error" in evo.evolutionConfig({ api_url: secrets.api_url, api_key: secrets.api_key || "x" })) {
    return { error: "O endereço do servidor precisa começar com https:// e ser público." };
  }
  if (Object.keys(secrets).length) {
    const { error } = await supabase.rpc("save_channel_secrets", { p_channel: id, p_secrets: secrets });
    if (error) return { error: friendly(error.message) };
  }
  revalidatePath("/whatsapp");
  return { ok: true };
}

/** Prepara a instância no servidor de QR Code e devolve o QR para escanear. */
export async function connectQr(channelId: string): Promise<QrResult> {
  const r = await adminChannel(channelId);
  if ("error" in r) return { error: r.error };
  const ch = r.channel;
  if (ch.provider !== "qr" || !ch.external_id) return { error: "Este canal não usa QR Code." };
  const cfg = evo.evolutionConfig(ch.secrets);
  if ("error" in cfg) return { error: cfg.error };

  const ensured = await evo.ensureInstance(cfg, ch.external_id, webhookUrl(await getOrigin(), ch.id, ch.secrets.webhook_secret));
  if (!ensured.ok) {
    await internalRpc("wa_set_channel_status", { p_channel: ch.id, p_status: "error", p_detail: ensured.error, p_phone: null });
    revalidatePath("/whatsapp");
    return { error: ensured.error };
  }
  const q = await evo.getQr(cfg, ch.external_id);
  if (q.state === "open") {
    const phone = await evo.instanceNumber(cfg, ch.external_id);
    await internalRpc("wa_set_channel_status", { p_channel: ch.id, p_status: "connected", p_detail: null, p_phone: phone });
    revalidatePath("/whatsapp");
    return { state: "open" };
  }
  if (q.state === "error") return { error: q.error };
  await internalRpc("wa_set_channel_status", { p_channel: ch.id, p_status: "connecting", p_detail: "Aguardando a leitura do QR Code", p_phone: null });
  revalidatePath("/whatsapp");
  return { state: "qr", qr: q.qr, pairingCode: q.pairingCode };
}

/** Confere se o canal está de fato conectado e atualiza o status mostrado na tela. */
export async function checkChannel(channelId: string): Promise<CheckResult> {
  const r = await adminChannel(channelId);
  if ("error" in r) return { error: r.error };
  const ch = r.channel;
  let status: CheckResult["status"];
  let detail: string | undefined;
  let phone: string | null = null;

  if (ch.provider === "cloud") {
    if (!ch.external_id || !ch.secrets.access_token) {
      status = "error";
      detail = "Falta o ID do número ou o token de acesso.";
    } else {
      const c = await cloud.checkNumber(ch.external_id, ch.secrets.access_token);
      if (c.ok) {
        status = "connected";
        phone = c.phone;
        detail = c.name ? `Nome verificado: ${c.name}` : undefined;
      } else {
        status = "error";
        detail = c.error;
      }
    }
  } else {
    const cfg = evo.evolutionConfig(ch.secrets);
    if ("error" in cfg || !ch.external_id) {
      status = "error";
      detail = "error" in cfg ? cfg.error : "Canal sem instância.";
    } else {
      const s = await evo.connectionState(cfg, ch.external_id);
      status = s === "open" ? "connected" : s === "connecting" ? "connecting" : "disconnected";
      if (s === "unknown") {
        status = "error";
        detail = "Não foi possível falar com o servidor de QR Code.";
      }
      if (s === "open") phone = await evo.instanceNumber(cfg, ch.external_id);
    }
  }
  await internalRpc("wa_set_channel_status", { p_channel: ch.id, p_status: status, p_detail: detail ?? null, p_phone: phone });
  revalidatePath("/whatsapp");
  return { status, detail };
}

export async function disconnectChannel(channelId: string): Promise<WaState> {
  const r = await adminChannel(channelId);
  if ("error" in r) return { error: r.error };
  const ch = r.channel;
  if (ch.provider === "qr" && ch.external_id) {
    const cfg = evo.evolutionConfig(ch.secrets);
    if (!("error" in cfg)) await evo.logout(cfg, ch.external_id);
  }
  await internalRpc("wa_set_channel_status", { p_channel: ch.id, p_status: "disconnected", p_detail: null, p_phone: null });
  revalidatePath("/whatsapp");
  return { ok: true };
}

export async function deleteChannel(channelId: string): Promise<WaState> {
  const r = await adminChannel(channelId);
  if ("error" in r) return { error: r.error };
  const ch = r.channel;
  if (ch.provider === "qr" && ch.external_id) {
    const cfg = evo.evolutionConfig(ch.secrets);
    if (!("error" in cfg)) await evo.removeInstance(cfg, ch.external_id);
  }
  const supabase = await createClient();
  const session = await requireSession();
  const { error } = await supabase.from("whatsapp_channels").delete().eq("id", ch.id).eq("org_id", session.org.id);
  if (error) return { error: friendly(error.message) };
  revalidatePath("/whatsapp");
  revalidatePath("/conversas");
  return { ok: true };
}
