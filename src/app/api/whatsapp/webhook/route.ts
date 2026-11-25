import { NextResponse, type NextRequest } from "next/server";
import * as cloud from "@/lib/whatsapp/cloud";
import { appSecrets } from "@/lib/whatsapp/meta";
import { internalRpc, safeEqual } from "@/lib/whatsapp/server";

/**
 * Webhook ÚNICO do app da Meta da Agência (modelo do wacrm). Configurado uma vez no painel do app:
 *   URL de callback: https://<domínio>/api/whatsapp/webhook   ·   Token de verificação: META_VERIFY_TOKEN
 * A Meta manda o phone_number_id em cada aviso; o canal (e a organização) são achados por ele.
 * Proteções: assinatura X-Hub-Signature-256 obrigatória (META_APP_SECRET; sem ele, tudo é recusado) e gravação no
 * banco só com a chave interna. Canais antigos, com webhook próprio, continuam em /api/whatsapp/<canal>.
 */
const MAX_BODY = 1_000_000;

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const token = process.env.META_VERIFY_TOKEN ?? "";
  if (token.length < 16 || sp.get("hub.mode") !== "subscribe" || !safeEqual(sp.get("hub.verify_token"), token)) {
    return new NextResponse("forbidden", { status: 403 });
  }
  return new NextResponse(sp.get("hub.challenge") ?? "", { status: 200, headers: { "content-type": "text/plain" } });
}

export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (raw.length > MAX_BODY) return new NextResponse("too large", { status: 413 });
  const secrets = appSecrets();
  if (secrets.length === 0 || !cloud.verifySignatureAny(raw, request.headers.get("x-hub-signature-256"), secrets)) {
    return new NextResponse("bad signature", { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true, ignored: true });
  }

  let failed = false;
  for (const numberId of cloud.phoneNumberIds(body)) {
    const { data: channelId, error } = await internalRpc<string>("wa_channel_by_number", { p_phone_number_id: numberId });
    if (error) {
      failed = true;
      continue;
    }
    if (!channelId) continue; // número que não está em nenhuma organização: ignora (a Meta não deve reenviar)
    const { messages, statuses } = cloud.parseWebhook(body, numberId);
    for (const m of messages) {
      const r = await internalRpc("wa_ingest", { p_channel: channelId, p_phone: m.phone, p_name: m.name, p_body: m.body, p_external_id: m.id, p_at: m.at.toISOString() });
      if (r.error) failed = true;
    }
    for (const s of statuses) {
      const r = await internalRpc("wa_message_status", { p_channel: channelId, p_external_id: s.id, p_status: s.status });
      if (r.error) failed = true;
      // motivo da falha: melhor esforço (se a migração 11 ainda não foi aplicada, só não grava o texto)
      else if (s.error) await internalRpc("wa_message_error", { p_channel: channelId, p_external_id: s.id, p_error: s.error });
    }
  }
  // 500 faz a Meta tentar de novo; mensagens repetidas são descartadas pelo banco (id externo único).
  return failed ? new NextResponse("error", { status: 500 }) : NextResponse.json({ ok: true });
}
