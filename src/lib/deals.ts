import { parseMoney } from "./money";

export interface DealInput {
  title: string;
  value: number;
  expectedClose: string | null;
  notes: string | null;
  company: string | null;
}

export function validateDeal(raw: Record<string, unknown>): { ok: true; value: DealInput } | { ok: false; error: string } {
  const title = String(raw.title ?? "").trim().slice(0, 160);
  if (!title) return { ok: false, error: "Dê um nome ao negócio." };
  const value = parseMoney(raw.value);
  if (value === null) return { ok: false, error: "Valor inválido. Use números, por exemplo 12.500,00." };
  const date = String(raw.expectedClose ?? "").trim();
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "Data de previsão inválida." };
  return {
    ok: true,
    value: {
      title,
      value,
      expectedClose: date || null,
      notes: String(raw.notes ?? "").trim().slice(0, 5000) || null,
      company: String(raw.company ?? "").trim().slice(0, 120) || null,
    },
  };
}

export interface StageLite {
  id: string;
  name: string;
  kind: "open" | "won" | "lost";
  probability: number;
}

export const STALLED_DAYS = 7;

export function isStalled(stageChangedAt: string, kind: StageLite["kind"], now: Date = new Date()): boolean {
  if (kind !== "open") return false;
  return now.getTime() - new Date(stageChangedAt).getTime() > STALLED_DAYS * 86_400_000;
}

export function daysIn(stageChangedAt: string, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(stageChangedAt).getTime()) / 86_400_000));
}

export function weighted(value: number, probability: number): number {
  return (value * probability) / 100;
}

export const ACTIVITY_LABEL: Record<string, string> = {
  note: "Nota",
  call: "Ligação",
  meeting: "Reunião",
  email: "E-mail",
  stage_change: "Mudou de etapa",
  won: "Negócio ganho",
  lost: "Negócio perdido",
};
