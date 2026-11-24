import { describe, expect, it } from "vitest";
import { phoneKey } from "./phone";

// Mesmos casos do teste do banco (supabase/tests/contacts-tags-fields.test.ts): as duas chaves precisam bater.
describe("phoneKey", () => {
  it("celular com e sem o 9, em qualquer formato, dá a mesma chave", () => {
    for (const p of ["(11) 91234-5678", "11912345678", "+55 (11) 1234-5678", "0055 11 91234 5678", "551112345678", "5511912345678"]) {
      expect(phoneKey(p)).toBe("551112345678");
    }
  });
  it("estrangeiro com + fica com o DDI dele", () => {
    expect(phoneKey("+1 415 555 0100")).toBe("14155550100");
  });
  it("inválido ou vazio dá null", () => {
    expect(phoneKey("123")).toBeNull();
    expect(phoneKey("")).toBeNull();
    expect(phoneKey(null)).toBeNull();
  });
});

describe("withNinthDigit (celular brasileiro sem o 9)", () => {
  it("coloca o 9 de volta no celular", async () => {
    const { withNinthDigit, formatPhone } = await import("./phone");
    expect(withNinthDigit("553193992305")).toBe("5531993992305");
    expect(formatPhone("553193992305")).toBe("+55 (31) 99399-2305");
  });
  it("não mexe em fixo, em número que já tem o 9 nem em outro país", async () => {
    const { withNinthDigit } = await import("./phone");
    expect(withNinthDigit("551132345678")).toBe("551132345678");
    expect(withNinthDigit("5531993992305")).toBe("5531993992305");
    expect(withNinthDigit("14155550100")).toBe("14155550100");
  });
});
