import { describe, expect, it } from "vitest";
import { describeAudit } from "./audit-labels";

describe("describeAudit", () => {
  it("descreve criação e exclusão", () => {
    expect(describeAudit({ table_name: "contacts", op: "INSERT", changed: null })).toBe("Contato criado");
    expect(describeAudit({ table_name: "deals", op: "DELETE", changed: null })).toBe("Negócio excluído");
  });
  it("lista os campos alterados em português", () => {
    expect(describeAudit({ table_name: "deals", op: "UPDATE", changed: ["stage_id", "value"] })).toBe("Negócio alterado (etapa, valor)");
  });
  it("não quebra com tabela ou campo desconhecido", () => {
    expect(describeAudit({ table_name: "x", op: "UPDATE", changed: ["y"] })).toBe("x alterado (y)");
  });
});
