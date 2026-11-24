"use server";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getOrigin } from "@/lib/origin";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import * as cloud from "@/lib/whatsapp/cloud";
import * as evo from "@/lib/whatsapp/evolution";
import * as meta from "@/lib/whatsapp/meta";
import { NOT_CONFIGURED, internalKey, internalRpc, loadChannel, webhookUrl, type ServerChannel } from "@/lib/whatsapp/server";

export interface WaState {
  ok?: boolean;
  error?: string;
  channelId?: string;
  /** Campo do formulário a corrigir. */
  field?: string;
  /** Linha técnica (etapa, código e trace id da Meta) para levar ao suporte. */
  detail?: string;
  /** Canal salvo, mas uma etapa (registro ou inscrição) falhou. */
  warning?: string;
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
  let pin = "";
  if (provider === "cloud") {
    const phoneId = text(fd, "phone_number_id");
    const wabaId = text(fd, "waba_id");
    const token = text(fd, "access_token");
    pin = text(fd, "pin");
    if (!/^\d{5,30}$/.test(phoneId)) return { error: "O ID do número tem só dígitos: é o número de identificação que aparece em Meta → WhatsApp → Configuração da API, não o telefone em si.", field: "phone_number_id" };
    if (!/^\d{5,30}$/.test(wabaId)) return { error: "O ID da conta do WhatsApp Business tem só dígitos. Copie em Meta → WhatsApp → Configuração da API.", field: "waba_id" };
    if (token.length < 20) return { error: "Cole o token de acesso permanente gerado na Meta.", field: "access_token" };
    if (pin && !/^\d{6}$/.test(pin)) return { error: "O PIN de verificação em duas etapas tem 6 dígitos.", field: "pin" };
    const missing = meta.agencyAppMissing();
    if (missing.length) return { error: `O app da Meta da Agência ainda não foi configurado no servidor (falta ${missing.join(" e ")} na Vercel).` };

    // 1. o token lê o número?  2. o número é mesmo dessa WABA?  (nada é salvo se falhar)
    try {
      await meta.verifyNumber(phoneId, token);
    } catch (e) {
      return metaFail(e, "verify_number", { phoneNumberId: phoneId, wabaId });
    }
    try {
      const numbers = await meta.wabaNumbers(wabaId, token);
      if (!numbers.some((n) => n.id === phoneId)) {
        const list = numbers.map((n) => `${n.display_phone_number ?? "?"} (${n.id})`).join(", ");
        return {
          error: `O número ${phoneId} não pertence à conta WhatsApp Business ${wabaId}. ${list ? `Essa conta tem: ${list}. ` : "Essa conta não tem números. "}Confira os dois IDs em Meta → WhatsApp → Configuração da API.`,
          field: "waba_id",
          detail: "Etapa: waba_phone_numbers",
        };
      }
    } catch (e) {
      return metaFail(e, "waba_phone_numbers", { phoneNumberId: phoneId, wabaId });
    }
    externalId = phoneId;
    secrets.access_token = token;
    secrets.waba_id = wabaId;
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
  if (error) {
    if (error.message.includes("whatsapp_channels_cloud_number_uniq")) return { error: "Esse número já está conectado no Altum (nesta ou em outra organização). Cada número só pode estar em um lugar.", field: "phone_number_id" };
    return { error: friendly(error.message) };
  }
  const channelId = String(data);
  revalidatePath("/whatsapp");
  if (provider !== "cloud") return { ok: true, channelId };

  // 3. registrar (com PIN) e 4. inscrever a WABA no app. O canal já fica salvo: dá para corrigir só o PIN depois.
  const ch = await loadChannel(channelId);
  if (!ch) return { ok: true, channelId };
  const setup = await setupCloud(ch, pin);
  return setup.ok ? { ok: true, channelId } : { ok: true, channelId, warning: setup.error, detail: setup.detail };
}

/** Registra (se veio PIN) e inscreve a WABA no app da Agência; grava o status do canal. */
async function setupCloud(ch: ServerChannel, pin: string): Promise<{ ok: true } | { ok: false; error: string; detail?: string }> {
  const token = ch.secrets.access_token;
  const wabaId = ch.secrets.waba_id;
  const phoneId = ch.external_id ?? "";
  const ctx = { phoneNumberId: phoneId, wabaId };
  const fail = async (step: meta.MetaStep, e: unknown) => {
    const x = meta.explainMetaError(e, step, ctx);
    await internalRpc("wa_set_channel_status", { p_channel: ch.id, p_status: "error", p_detail: x.summary.slice(0, 300), p_phone: null });
    revalidatePath("/whatsapp");
    return { ok: false as const, error: x.summary, detail: meta.metaRef(x) };
  };
  if (!token || !wabaId) return { ok: false, error: "Falta o token ou o ID da conta do WhatsApp Business. Edite o canal." };

  let info: meta.PhoneInfo;
  try {
    info = await meta.verifyNumber(phoneId, token);
  } catch (e) {
    return fail("verify_number", e);
  }
  if (pin) {
    try {
      await meta.registerNumber(phoneId, token, pin);
    } catch (e) {
      return fail("register", e);
    }
  }
  try {
    await meta.subscribeWaba(wabaId, token);
  } catch (e) {
    return fail("subscribe_waba", e);
  }
  const name = info.verified_name ? `Nome verificado: ${info.verified_name}` : null;
  await internalRpc("wa_set_channel_status", { p_channel: ch.id, p_status: "connected", p_detail: name, p_phone: info.display_phone_number ?? null });
  revalidatePath("/whatsapp");
  return { ok: true };
}

function metaFail(e: unknown, step: meta.MetaStep, ctx: { phoneNumberId?: string; wabaId?: string }): WaState {
  const x = meta.explainMetaError(e, step, ctx);
  return { error: x.summary, field: x.field ?? undefined, detail: meta.metaRef(x) };
}

/** Refaz registro (com PIN, se informado) e inscrição no app. Para o botão "Reconectar". */
export async function reconnectCloud(channelId: string, pin: string): Promise<WaState> {
  const r = await adminChannel(channelId);
  if ("error" in r) return { error: r.error };
  if (r.channel.provider !== "cloud") return { error: "Este canal não usa a API oficial." };
  const p = String(pin ?? "").trim();
  if (p && !/^\d{6}$/.test(p)) return { error: "O PIN de verificação em duas etapas tem 6 dígitos.", field: "pin" };
  const s = await setupCloud(r.channel, p);
  return s.ok ? { ok: true } : { error: s.error, detail: s.detail };
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
  for (const k of ["access_token", "app_secret", "waba_id", "api_url", "api_key"]) if (text(fd, k)) secrets[k] = text(fd, k);
  if (secrets.waba_id && !/^\d{5,30}$/.test(secrets.waba_id)) return { error: "O ID da conta do WhatsApp Business tem só dígitos.", field: "waba_id" };
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
        // Credenciais válidas + WABA sem app inscrito = "conectado, mas as mensagens não chegam".
        if (ch.secrets.waba_id) {
          try {
            const apps = await meta.subscribedApps(ch.secrets.waba_id, ch.secrets.access_token);
            const appId = process.env.META_APP_ID;
            if (apps.length === 0) {
              status = "error";
              detail = "A conta WhatsApp Business não está inscrita no app da Agência, então as mensagens não chegam. Clique em Reconectar.";
            } else if (appId && !apps.some((a) => a.id === appId)) {
              status = "error";
              detail = `A conta está inscrita em outro app (${apps.map((a) => a.name ?? a.id).join(", ")}), não no app da Agência. Clique em Reconectar.`;
            }
          } catch {
            // o token pode não ter whatsapp_business_management e ainda assim enviar: não derruba o status
          }
        }
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
