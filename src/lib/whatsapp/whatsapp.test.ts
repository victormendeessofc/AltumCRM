// @vitest-environment node
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import * as cloud from "./cloud";
import * as evo from "./evolution";
import { publicHttpsUrl } from "./net";
import { formatPhone, normalizePhone, phoneFromJid } from "./phone";

describe("telefone", () => {
  it("normaliza para dígitos com DDI", () => {
    expect(normalizePhone("(11) 91234-5678")).toBe("5511912345678");
    expect(normalizePhone("11 3456-7890")).toBe("551134567890");
    expect(normalizePhone("+55 11 91234-5678")).toBe("5511912345678");
    expect(normalizePhone("0055 11 91234-5678")).toBe("5511912345678");
    expect(normalizePhone("+1 415 555 2671")).toBe("14155552671");
  });
  it("recusa o que não é telefone", () => {
    expect(normalizePhone("abc")).toBeNull();
    expect(normalizePhone("123")).toBeNull();
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("1".repeat(20))).toBeNull();
  });
  it("formata números brasileiros", () => {
    expect(formatPhone("5511912345678")).toBe("+55 (11) 91234-5678");
    expect(formatPhone("551134567890")).toBe("+55 (11) 3456-7890");
    expect(formatPhone("14155552671")).toBe("+14155552671");
  });
  it("lê o número do identificador do WhatsApp e ignora grupos", () => {
    expect(phoneFromJid("5511912345678@s.whatsapp.net")).toBe("5511912345678");
    expect(phoneFromJid("5511912345678:12@s.whatsapp.net")).toBe("5511912345678");
    expect(phoneFromJid("120363025@g.us")).toBeNull();
    expect(phoneFromJid("abc@lid")).toBeNull();
    expect(phoneFromJid(undefined)).toBeNull();
  });
});

describe("endereço do servidor de QR Code", () => {
  it("aceita https público", () => {
    expect(publicHttpsUrl("https://evo.minhaempresa.com.br")?.hostname).toBe("evo.minhaempresa.com.br");
    expect(publicHttpsUrl("https://203.0.113.10:8443/api")?.port).toBe("8443");
  });
  it("recusa http, locais, redes privadas e credenciais embutidas", () => {
    for (const u of [
      "http://evo.exemplo.com",
      "https://localhost",
      "https://127.0.0.1",
      "https://10.0.0.5",
      "https://192.168.1.10",
      "https://172.20.0.1",
      "https://169.254.169.254",
      "https://100.64.0.1",
      "https://servidor.local",
      "https://[::1]",
      "https://user:pass@evo.exemplo.com",
      "ftp://evo.exemplo.com",
      "não é url",
    ]) {
      expect(publicHttpsUrl(u), u).toBeNull();
    }
  });
});

describe("API oficial (Meta)", () => {
  const secret = "segredo-do-app";
  const body = JSON.stringify({ entry: [] });
  const sig = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");

  it("confere a assinatura do webhook", () => {
    expect(cloud.verifySignature(body, sig, secret)).toBe(true);
    expect(cloud.verifySignature(body + " ", sig, secret)).toBe(false);
    expect(cloud.verifySignature(body, sig, "outro")).toBe(false);
    expect(cloud.verifySignature(body, null, secret)).toBe(false);
    expect(cloud.verifySignature(body, "sha256=", secret)).toBe(false);
    expect(cloud.verifySignature(body, "md5=abc", secret)).toBe(false);
  });

  const webhook = (value: Record<string, unknown>) => ({ entry: [{ changes: [{ field: "messages", value }] }] });

  it("extrai mensagens de texto e o nome do contato", () => {
    const r = cloud.parseWebhook(
      webhook({
        metadata: { phone_number_id: "111" },
        contacts: [{ wa_id: "5511912345678", profile: { name: "Maria" } }],
        messages: [{ from: "5511912345678", id: "wamid.A", timestamp: "1700000000", type: "text", text: { body: "Olá" } }],
      }),
      "111",
    );
    expect(r.messages).toHaveLength(1);
    expect(r.messages[0]).toMatchObject({ phone: "5511912345678", name: "Maria", body: "Olá", id: "wamid.A" });
    expect(r.messages[0].at.getTime()).toBe(1700000000 * 1000);
  });
  it("descreve mídias e respostas de botão", () => {
    const r = cloud.parseWebhook(
      webhook({
        messages: [
          { from: "5511900000001", id: "1", type: "image", image: { caption: "foto do imóvel" } },
          { from: "5511900000001", id: "2", type: "audio" },
          { from: "5511900000001", id: "3", type: "interactive", interactive: { button_reply: { title: "Quero visitar" } } },
          { from: "5511900000001", id: "4", type: "reaction" },
        ],
      }),
      null,
    );
    expect(r.messages.map((m) => m.body)).toEqual(["[imagem] foto do imóvel", "[áudio]", "Quero visitar", "[mensagem não suportada]"]);
  });
  it("ignora avisos de outro número e campos que não são mensagens", () => {
    const other = cloud.parseWebhook(webhook({ metadata: { phone_number_id: "999" }, messages: [{ from: "5511900000001", id: "x", type: "text", text: { body: "oi" } }] }), "111");
    expect(other.messages).toHaveLength(0);
    expect(cloud.parseWebhook({ entry: [{ changes: [{ field: "account_update", value: {} }] }] }, null).messages).toHaveLength(0);
    expect(cloud.parseWebhook(null, null)).toEqual({ messages: [], statuses: [] });
    expect(cloud.parseWebhook({ entry: "x" }, null)).toEqual({ messages: [], statuses: [] });
  });
  it("extrai atualizações de entrega e leitura", () => {
    const r = cloud.parseWebhook(webhook({ statuses: [{ id: "wamid.B", status: "delivered" }, { id: "wamid.C", status: "read" }, { id: "wamid.D", status: "banana" }] }), null);
    expect(r.statuses).toEqual([
      { id: "wamid.B", status: "delivered" },
      { id: "wamid.C", status: "read" },
    ]);
  });
});

describe("servidor de QR Code (Evolution API)", () => {
  it("lê mensagem de texto recebida", () => {
    const e = evo.parseWebhook({
      event: "messages.upsert",
      data: { key: { remoteJid: "5511912345678@s.whatsapp.net", fromMe: false, id: "ABC" }, pushName: "João", message: { conversation: "Bom dia" }, messageTimestamp: 1700000000 },
    });
    expect(e.kind).toBe("message");
    if (e.kind === "message") expect(e.message).toMatchObject({ phone: "5511912345678", name: "João", body: "Bom dia", id: "ABC" });
  });
  it("aceita o nome do evento em MAIÚSCULAS com sublinhado", () => {
    const e = evo.parseWebhook({ event: "MESSAGES_UPSERT", data: { key: { remoteJid: "5511912345678@s.whatsapp.net", id: "Z" }, message: { extendedTextMessage: { text: "link" } } } });
    expect(e.kind).toBe("message");
  });
  it("ignora mensagens enviadas pelo próprio número, grupos e eventos desconhecidos", () => {
    expect(evo.parseWebhook({ event: "messages.upsert", data: { key: { remoteJid: "5511912345678@s.whatsapp.net", fromMe: true, id: "1" }, message: { conversation: "x" } } }).kind).toBe("ignore");
    expect(evo.parseWebhook({ event: "messages.upsert", data: { key: { remoteJid: "1203@g.us", id: "2" }, message: { conversation: "x" } } }).kind).toBe("ignore");
    expect(evo.parseWebhook({ event: "presence.update", data: {} }).kind).toBe("ignore");
    expect(evo.parseWebhook(null).kind).toBe("ignore");
  });
  it("lê mudança de conexão", () => {
    expect(evo.parseWebhook({ event: "connection.update", data: { state: "open" } })).toEqual({ kind: "connection", state: "open" });
    expect(evo.parseWebhook({ event: "CONNECTION_UPDATE", data: { state: "close" } })).toEqual({ kind: "connection", state: "close" });
    expect(evo.parseWebhook({ event: "connection.update", data: { state: "???" } }).kind).toBe("ignore");
  });
  it("sem credenciais ou com endereço inseguro, pede ajuste", () => {
    delete process.env.EVOLUTION_API_URL;
    delete process.env.EVOLUTION_API_KEY;
    expect(evo.evolutionConfig({})).toHaveProperty("error");
    expect(evo.evolutionConfig({ api_url: "http://10.0.0.1", api_key: "k" })).toHaveProperty("error");
    expect(evo.evolutionConfig({ api_url: "https://evo.exemplo.com/", api_key: "k" })).toEqual({ url: "https://evo.exemplo.com", key: "k" });
  });
});
