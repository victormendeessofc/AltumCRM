const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const brlCents = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatBRL(value: number | string | null | undefined, cents = false): string {
  const n = Number(value ?? 0);
  return (cents ? brlCents : brl).format(Number.isFinite(n) ? n : 0);
}

/** Versão compacta para cartões: R$ 1,2 mil, R$ 3,4 mi. */
export function formatBRLCompact(value: number): string {
  const n = Number(value) || 0;
  if (Math.abs(n) >= 1_000_000) return `R$ ${(n / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (Math.abs(n) >= 10_000) return `R$ ${(n / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
  return formatBRL(n);
}

/**
 * Lê valores digitados por brasileiros: "1.234,56", "1234,56", "R$ 1.234", "1234.56", "1,5".
 * Retorna null quando não for um número válido e não negativo.
 */
export function parseMoney(input: unknown): number | null {
  let s = String(input ?? "").replace(/[R$\s]/g, "");
  if (s === "") return 0;
  if (!/^[\d.,]+$/.test(s)) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    // o último separador é o decimal
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma > -1) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > -1) {
    // só pontos: "1.234" (milhar) vs "12.5" (decimal)
    const parts = s.split(".");
    s = parts.length > 2 || parts[parts.length - 1].length === 3 ? s.replace(/\./g, "") : s;
  }
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > 999_999_999_999) return null;
  return Math.round(n * 100) / 100;
}
