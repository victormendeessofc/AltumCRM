// @vitest-environment node
import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { phoneNumberIds, verifySignatureAny } from "./cloud";
import { agencyAppMissing, appSecrets, explainMetaError, MetaError, metaRef } from "./meta";

describe("explainMetaError", () => {
  it("token expirado aponta o campo do token", () => {
    const x = explainMetaError(new MetaError("Session has expired", 190, 463, "TRACE1"), "verify_number", { phoneNumberId: "1" });
    expect(x.field).toBe("access_token");
    expect(x.side).toBe("user");
    expect(x.summary).toContain("expirou");
    expect(metaRef(x)).toBe("Etapa: verify_number · Código Meta: 190/463 · Trace ID: TRACE1");
  });
  it("número não registrado pede o PIN", () => {
    expect(explainMetaError(new MetaError("not registered", 133010), "subscribe_waba").field).toBe("pin");
  });
  it("PIN errado aponta o PIN", () => {
    expect(explainMetaError(new MetaError("wrong pin", 133005), "register").field).toBe("pin");
  });
  it("ID inexistente aponta o campo certo conforme a etapa", () => {
    const e = new MetaError("Unsupported get request. Object with ID '9' does not exist", 100, 33);
    expect(explainMetaError(e, "verify_number", { phoneNumberId: "9" }).field).toBe("phone_number_id");
    const w = explainMetaError(e, "waba_phone_numbers", { wabaId: "9" });
    expect(w.field).toBe("waba_id");
    expect(w.summary).toContain("ID da conta WhatsApp Business 9");
  });
  it("falta de permissão aponta o token", () => {
    expect(explainMetaError(new MetaError("no permission", 200), "subscribe_waba").field).toBe("access_token");
  });
  it("limite, bloqueio e rede são do lado da Meta", () => {
    expect(explainMetaError(new MetaError("rate", 80007), "register").side).toBe("meta");
    expect(explainMetaError(new MetaError("locked", 368), "register").field).toBe("meta_account");
    expect(explainMetaError(new Error("fetch failed"), "verify_number").side).toBe("meta");
  });
});

describe("webhook único: ajudantes", () => {
  it("lê os phone_number_id do aviso, sem repetir e só do campo messages", () => {
    const body = {
      entry: [
        { changes: [{ field: "messages", value: { metadata: { phone_number_id: "100000000000111" } } }] },
        { changes: [{ field: "messages", value: { metadata: { phone_number_id: "100000000000111" } } }, { field: "account_update", value: { metadata: { phone_number_id: "100000000000222" } } }] },
        { changes: [{ field: "messages", value: { metadata: { phone_number_id: "100000000000333" } } }] },
      ],
    };
    expect(phoneNumberIds(body)).toEqual(["100000000000111", "100000000000333"]);
    expect(phoneNumberIds(null)).toEqual([]);
  });
  it("assinatura vale se bater com qualquer um dos segredos", () => {
    const raw = '{"a":1}';
    const sig = "sha256=" + createHmac("sha256", "segredo-2").update(raw).digest("hex");
    expect(verifySignatureAny(raw, sig, ["segredo-1", "segredo-2"])).toBe(true);
    expect(verifySignatureAny(raw, sig, ["segredo-1"])).toBe(false);
    expect(verifySignatureAny(raw, sig, [])).toBe(false);
  });
});

describe("configuração do app da Agência", () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });
  it("aceita vários segredos separados por vírgula e ignora vazios", () => {
    process.env.META_APP_SECRET = " a , b,, ";
    expect(appSecrets()).toEqual(["a", "b"]);
  });
  it("aponta o que falta", () => {
    delete process.env.META_APP_SECRET;
    process.env.META_VERIFY_TOKEN = "curto";
    expect(agencyAppMissing()).toEqual(["META_APP_SECRET", "META_VERIFY_TOKEN"]);
    process.env.META_APP_SECRET = "x";
    process.env.META_VERIFY_TOKEN = "v".repeat(20);
    expect(agencyAppMissing()).toEqual([]);
  });
});
