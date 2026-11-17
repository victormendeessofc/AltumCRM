import { NextResponse, type NextRequest } from "next/server";
import * as cloud from "@/lib/whatsapp/cloud";
import * as evo from "@/lib/whatsapp/evolution";
import { internalRpc, loadChannel, safeEqual } from "@/lib/whatsapp/server";

/**
 * Recebe os avisos do WhatsApp (mensagens novas, entrega/leitura, estado da conexão).
 * Chamado pela Meta (API oficial) ou pelo servidor de QR Code, sem usuário logado. Proteções:
 *  - o endereço leva um segredo por canal (?s=...) comparado em tempo constante;
 *  - na API oficial, a assinatura HMAC (X-Hub-Signature-256) é conferida quando o App Secret está configurado;
 *  - gravar no banco exige a chave interna do servidor.
 */
type Ctx = { params: Promise<{ channelId: string }> };
const UUID = /^[0-9a-f-]{36}$/i;
const MAX_BODY = 1_000_000;

/** Verificação do webhook pela Meta (feita uma vez, ao cadastrar o endereço no painel). */
export async function GET(request: NextRequest, { params }: Ctx) {
  const { channelId } = await params;
  if (!UUID.test(channelId)) return new NextResponse("not found", { status: 404 });
  const sp = request.nextUrl.searchParams;
  const ch = await loadChannel(channelId);
  if (!ch || ch.provider !== "cloud") return new NextResponse("not found", { status: 404 });
  if (sp.get("hub.mode") !== "subscribe" || !safeEqual(sp.get("hub.verify_token"), ch.secrets.webhook_secret)) {
    return new NextResponse("forbidden", { status: 403 });
  }
  return new NextResponse(sp.get("hub.challenge") ?? "", { status: 200, headers: { "content-type": "text/plain" } });
}

export async function POST(request: NextRequest, { params }: Ctx) {
  const { channelId } = await params;
  if (!UUID.test(channelId)) return new NextResponse("not found", { status: 404 });

  const raw = await request.text();
  if (raw.length > MAX_BODY) return new NextResponse("too large", { status: 413 });

  const ch = await loadChannel(channelId);
  if (!ch) return new NextResponse("not found", { status: 404 });
  if (!safeEqual(request.nextUrl.searchParams.get("s"), ch.secrets.webhook_secret)) return new NextResponse("unauthorized", { status: 401 });
  if (ch.provider === "cloud" && ch.secrets.app_secret && !cloud.verifySignature(raw, request.headers.get("x-hub-signature-256"), ch.secrets.app_secret)) {
    return new NextResponse("bad signature", { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true, ignored: true });
  }

  let failed = false;
  const ingest = async (m: { phone: string; name: string; body: string; id: string; at: Date }) => {
    const r = await internalRpc("wa_ingest", { p_channel: ch.id, p_phone: m.phone, p_name: m.name, p_body: m.body, p_external_id: m.id, p_at: m.at.toISOString() });
    if (r.error) failed = true;
  };

  if (ch.provider === "cloud") {
    const { messages, statuses } = cloud.parseWebhook(body, ch.external_id);
    for (const m of messages) await ingest(m);
    for (const s of statuses) {
      const r = await internalRpc("wa_message_status", { p_channel: ch.id, p_external_id: s.id, p_status: s.status });
      if (r.error) failed = true;
    }
  } else {
    const ev = evo.parseWebhook(body);
    if (ev.kind === "message") await ingest(ev.message);
    if (ev.kind === "connection") {
      const status = ev.state === "open" ? "connected" : ev.state === "connecting" ? "connecting" : "disconnected";
      const r = await internalRpc("wa_set_channel_status", { p_channel: ch.id, p_status: status, p_detail: null, p_phone: null });
      if (r.error) failed = true;
    }
  }

  // 500 faz a operadora tentar de novo; mensagens repetidas são descartadas pelo banco (id externo único).
  return failed ? new NextResponse("error", { status: 500 }) : NextResponse.json({ ok: true });
}
