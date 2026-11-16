import { describe, expect, it } from "vitest";
import { daysIn, isStalled, validateDeal, weighted } from "./deals";
import { formatBRL, formatBRLCompact, parseMoney } from "./money";
import { dueBucket, formatDue, fromDueIso, localDate, toDueIso, validateTask } from "./tasks";

describe("parseMoney", () => {
  it.each([
    ["1.234,56", 1234.56],
    ["1234,56", 1234.56],
    ["R$ 1.234", 1234],
    ["1234.56", 1234.56],
    ["1,5", 1.5],
    ["12.500", 12500],
    ["1.234.567,89", 1234567.89],
    ["", 0],
    ["0", 0],
  ])("lê %s como %s", (input, expected) => {
    expect(parseMoney(input)).toBe(expected);
  });
  it("recusa lixo, negativos e valores absurdos", () => {
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("-10")).toBeNull();
    expect(parseMoney("1e9")).toBeNull();
    expect(parseMoney("9999999999999")).toBeNull();
  });
});

describe("formatação", () => {
  it("formata em reais", () => {
    expect(formatBRL(1234.5).replace(/\s/g, " ")).toBe("R$ 1.235");
    expect(formatBRL(1234.5, true).replace(/\s/g, " ")).toBe("R$ 1.234,50");
    expect(formatBRL(null)).toContain("0");
  });
  it("compacta valores grandes", () => {
    expect(formatBRLCompact(2_500_000)).toBe("R$ 2,5 mi");
    expect(formatBRLCompact(48_000)).toBe("R$ 48 mil");
  });
});

describe("tarefas e datas (fuso de Brasília)", () => {
  const now = new Date("2026-11-16T15:00:00Z"); // 12:00 em Brasília
  it("classifica prazos", () => {
    expect(dueBucket({ dueAt: "2026-11-15T20:00:00Z", doneAt: null }, now)).toBe("overdue");
    expect(dueBucket({ dueAt: "2026-11-16T22:00:00Z", doneAt: null }, now)).toBe("today");
    expect(dueBucket({ dueAt: "2026-11-17T12:00:00Z", doneAt: null }, now)).toBe("upcoming");
    expect(dueBucket({ dueAt: null, doneAt: null }, now)).toBe("none");
    expect(dueBucket({ dueAt: "2026-11-01T12:00:00Z", doneAt: "2026-11-02T12:00:00Z" }, now)).toBe("done");
  });
  it("23h30 de Brasília ainda é hoje, mesmo já sendo o dia seguinte em UTC", () => {
    expect(localDate("2026-11-17T02:30:00Z")).toBe("2026-11-16");
  });
  it("converte data+hora de Brasília para UTC e de volta", () => {
    expect(toDueIso("2026-11-20", "14:30")).toBe("2026-11-20T17:30:00.000Z");
    expect(fromDueIso("2026-11-20T17:30:00.000Z")).toEqual({ date: "2026-11-20", time: "14:30" });
    expect(toDueIso("20/11/2026")).toBeNull();
  });
  it("rotula prazos de forma humana", () => {
    expect(formatDue("2026-11-16T22:00:00Z", now)).toBe("Hoje, 19:00");
    expect(formatDue("2026-11-17T03:00:00Z", now)).toBe("Amanhã"); // 00:00 em Brasília = sem horário
    expect(formatDue(null, now)).toBe("Sem prazo");
  });
  it("valida tarefa", () => {
    expect(validateTask({ title: "  " }).ok).toBe(false);
    const ok = validateTask({ title: "Ligar", dueDate: "2026-11-20", dueTime: "09:00" });
    expect(ok.ok && ok.value.dueAt).toBe("2026-11-20T12:00:00.000Z");
    expect(validateTask({ title: "x", dueDate: "ontem" }).ok).toBe(false);
  });
});

describe("negócios", () => {
  it("valida título e valor", () => {
    expect(validateDeal({ title: "" }).ok).toBe(false);
    expect(validateDeal({ title: "A", value: "abc" }).ok).toBe(false);
    const r = validateDeal({ title: " ERP ", value: "86.500,00", expectedClose: "2026-12-01" });
    expect(r.ok && r.value).toMatchObject({ title: "ERP", value: 86500, expectedClose: "2026-12-01" });
  });
  it("detecta negócio parado (>7 dias, só em etapa aberta)", () => {
    const now = new Date("2026-11-16T12:00:00Z");
    expect(isStalled("2026-11-05T12:00:00Z", "open", now)).toBe(true);
    expect(isStalled("2026-11-12T12:00:00Z", "open", now)).toBe(false);
    expect(isStalled("2026-11-01T12:00:00Z", "won", now)).toBe(false);
    expect(daysIn("2026-11-10T12:00:00Z", now)).toBe(6);
  });
  it("pondera pelo percentual da etapa", () => {
    expect(weighted(2000, 75)).toBe(1500);
  });
});
