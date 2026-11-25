// @vitest-environment node
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/whatsapp/server", async (orig) => ({ ...(await orig<typeof import("@/lib/whatsapp/server")>()), internalRpc: (...a: unknown[]) => rpc(...a) }));

const { GET, POST } = await import("./route");

const SECRET = "segredo-do-app";
const sign = (raw: string) => "sha256=" + createHmac("sha256", SECRET).update(raw).digest("hex");
const URL_ = "https://altum.test/api/whatsapp/webhook";

const inbound = (numberId: string) =>
  JSON.stringify({
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              metadata: { phone_number_id: numberId },
              contacts: [{ wa_id: "5511912345678", profile: { name: "Maria" } }],
              messages: [{ from: "5511912345678", id: "wamid.1", timestamp: "1700000000", type: "text", text: { body: "Oi" } }],
              statuses: [{ id: "wamid.out", status: "read" }],
            },
          },
        ],
      },
    ],
  });

const post = (raw: string, sig: string | null = sign(raw)) => POST(new NextRequest(URL_, { method: "POST", body: raw, headers: sig ? { "x-hub-signature-256": sig } : {} }));

const env = { ...process.env };
beforeEach(() => {
  process.env.META_APP_SECRET = SECRET;
  process.env.META_VERIFY_TOKEN = "token-de-verificacao-123";
  rpc.mockReset();
});
afterEach(() => {
  process.env = { ...env };
});

describe("GET (verificação do webhook pela Meta)", () => {
  it("devolve o challenge com o token certo", async () => {
    const r = await GET(new NextRequest(`${URL_}?hub.mode=subscribe&hub.verify_token=token-de-verificacao-123&hub.challenge=42`));
    expect(r.status).toBe(200);
    expect(await r.text()).toBe("42");
  });
  it("recusa token errado ou servidor sem token", async () => {
    expect((await GET(new NextRequest(`${URL_}?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=42`))).status).toBe(403);
    delete process.env.META_VERIFY_TOKEN;
    expect((await GET(new NextRequest(`${URL_}?hub.mode=subscribe&hub.verify_token=&hub.challenge=42`))).status).toBe(403);
  });
});

describe("POST (avisos da Meta)", () => {
  it("sem assinatura, assinatura errada ou servidor sem segredo: recusa e não toca no banco", async () => {
    const raw = inbound("100000000000111");
    expect((await post(raw, null)).status).toBe(401);
    expect((await post(raw, "sha256=" + "0".repeat(64))).status).toBe(401);
    delete process.env.META_APP_SECRET;
    expect((await post(raw)).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("acha o canal pelo phone_number_id e grava mensagem e status nele", async () => {
    rpc.mockImplementation(async (fn: string) => (fn === "wa_channel_by_number" ? { data: "canal-1", error: null } : { data: "conv", error: null }));
    const r = await post(inbound("100000000000111"));
    expect(r.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("wa_channel_by_number", { p_phone_number_id: "100000000000111" });
    expect(rpc).toHaveBeenCalledWith("wa_ingest", expect.objectContaining({ p_channel: "canal-1", p_phone: "5511912345678", p_name: "Maria", p_body: "Oi", p_external_id: "wamid.1" }));
    expect(rpc).toHaveBeenCalledWith("wa_message_status", { p_channel: "canal-1", p_external_id: "wamid.out", p_status: "read" });
  });

  it("número sem canal no Altum é ignorado com 200 (a Meta não reenvia)", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const r = await post(inbound("100000000000999"));
    expect(r.status).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  const failedStatus = (numberId: string) =>
    JSON.stringify({
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                metadata: { phone_number_id: numberId },
                statuses: [{ id: "wamid.out", status: "failed", errors: [{ code: 131026, title: "Message undeliverable", error_data: { details: "recipient unavailable" } }] }],
              },
            },
          ],
        },
      ],
    });

  it("falha avisada depois pela Meta grava o motivo", async () => {
    rpc.mockImplementation(async (fn: string) => (fn === "wa_channel_by_number" ? { data: "canal-1", error: null } : { data: null, error: null }));
    expect((await post(failedStatus("100000000000111"))).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("wa_message_status", { p_channel: "canal-1", p_external_id: "wamid.out", p_status: "failed" });
    expect(rpc).toHaveBeenCalledWith("wa_message_error", { p_channel: "canal-1", p_external_id: "wamid.out", p_error: expect.stringContaining("código 131026") });
  });

  it("se o banco ainda não tem a função do motivo, segue normal (200)", async () => {
    rpc.mockImplementation(async (fn: string) =>
      fn === "wa_channel_by_number" ? { data: "canal-1", error: null } : fn === "wa_message_error" ? { data: null, error: "function does not exist" } : { data: null, error: null },
    );
    expect((await post(failedStatus("100000000000111"))).status).toBe(200);
  });

  it("erro no banco devolve 500 para a Meta tentar de novo", async () => {
    rpc.mockImplementation(async (fn: string) => (fn === "wa_channel_by_number" ? { data: "canal-1", error: null } : { data: null, error: "falhou" }));
    expect((await post(inbound("100000000000111"))).status).toBe(500);
  });
});
