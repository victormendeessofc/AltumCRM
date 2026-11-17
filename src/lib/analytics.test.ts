import { describe, expect, it } from "vitest";
import { barWidth, formatDays, formatDuration, formatPct, monthLabel, parsePeriod } from "./analytics";

describe("analytics", () => {
  it("período aceita só os valores do seletor", () => {
    expect(parsePeriod("30")).toBe(30);
    expect(parsePeriod("365")).toBe(365);
    expect(parsePeriod("7")).toBe(90);
    expect(parsePeriod(undefined)).toBe(90);
    expect(parsePeriod("abc")).toBe(90);
  });
  it("formata durações", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(30)).toBe("menos de 1 min");
    expect(formatDuration(360)).toBe("6 min");
    expect(formatDuration("360")).toBe("6 min");
    expect(formatDuration(4800)).toBe("1 h 20 min");
    expect(formatDuration(7200)).toBe("2 h");
    expect(formatDuration(200_000)).toBe("2 d 7 h");
    expect(formatDuration(86_400)).toBe("1 d");
    expect(formatDuration(-5)).toBe("—");
  });
  it("formata mês, percentual e dias", () => {
    expect(monthLabel("2026-11")).toBe("nov/26");
    expect(monthLabel("2027-01")).toBe("jan/27");
    expect(monthLabel("xx")).toBe("xx");
    expect(formatPct(66.67)).toBe("66,7%");
    expect(formatPct("100")).toBe("100%");
    expect(formatPct(null)).toBe("—");
    expect(formatDays(1)).toBe("1 dia");
    expect(formatDays("7.5")).toBe("7,5 dias");
    expect(formatDays(null)).toBe("—");
  });
  it("largura de barra", () => {
    expect(barWidth(50, 100)).toBe(50);
    expect(barWidth(1, 1000)).toBe(3);
    expect(barWidth(0, 100)).toBe(0);
    expect(barWidth(5, 0)).toBe(0);
    expect(barWidth(500, 100)).toBe(100);
  });
});
