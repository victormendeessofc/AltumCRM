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
