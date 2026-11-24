import { describe, expect, it } from "vitest";
import { fillVariables, matchQuickReplies, normalizeShortcut, slashQuery, type QuickReply } from "./quick-replies";

describe("normalizeShortcut", () => {
  it("tira acento, barra, espaço e símbolos", () => {
    expect(normalizeShortcut("/Preço Consulta!")).toBe("preco-consulta");
    expect(normalizeShortcut("  horário_sábado ")).toBe("horario_sabado");
  });
  it("corta em 30 caracteres", () => {
    expect(normalizeShortcut("a".repeat(40))).toHaveLength(30);
  });
});

describe("fillVariables", () => {
  it("preenche nome e primeiro nome", () => {
    expect(fillVariables("Olá {{primeiro_nome}}, tudo bem? ({{nome}})", "Maria Souza")).toBe("Olá Maria, tudo bem? (Maria Souza)");
  });
  it("aceita espaços e maiúsculas dentro da chave", () => {
    expect(fillVariables("Oi {{ Primeiro_Nome }}", "João")).toBe("Oi João");
  });
  it("sem nome de verdade (só número), a variável some com o espaço", () => {
    expect(fillVariables("Olá {{primeiro_nome}}!", "5511912345678")).toBe("Olá!");
    expect(fillVariables("Olá {{nome}}, tudo bem?", null)).toBe("Olá, tudo bem?");
  });
  it("não mexe em outras chaves", () => {
    expect(fillVariables("Valor: {{preco}}", "Ana")).toBe("Valor: {{preco}}");
  });
});

describe("slashQuery", () => {
  it("reconhece o comando só no começo e antes do espaço", () => {
    expect(slashQuery("/")).toBe("");
    expect(slashQuery("/Pre")).toBe("pre");
    expect(slashQuery("/preco depois")).toBeNull();
    expect(slashQuery("texto /preco")).toBeNull();
    expect(slashQuery("")).toBeNull();
  });
});

describe("matchQuickReplies", () => {
  const list: QuickReply[] = [
    { id: "1", shortcut: "ola", title: "Saudação", body: "" },
    { id: "2", shortcut: "preco", title: "Tabela de preços", body: "" },
    { id: "3", shortcut: "endereco", title: "Como chegar", body: "" },
    { id: "4", shortcut: "pre-consulta", title: "Orientações pré-consulta", body: "" },
  ];
  it("sem termo, devolve todas", () => {
    expect(matchQuickReplies(list, "").map((r) => r.id)).toEqual(["1", "2", "3", "4"]);
  });
  it("atalho que começa com o termo vem antes do que só contém", () => {
    expect(matchQuickReplies(list, "pre").map((r) => r.id)).toEqual(["2", "4"]);
  });
  it("busca também no título, sem acento", () => {
    expect(matchQuickReplies(list, "chegar").map((r) => r.id)).toEqual(["3"]);
    expect(matchQuickReplies(list, "saudacao").map((r) => r.id)).toEqual(["1"]);
  });
});
