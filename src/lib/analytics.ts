/** Formato devolvido por public.analytics_overview (valores numéricos podem vir como string do Postgres). */
export interface Overview {
  days: number;
  created_count: number;
  created_value: number | string;
  won_count: number;
  won_value: number | string;
  lost_count: number;
  lost_value: number | string;
  win_rate: number | string | null;
  avg_deal_value: number | string | null;
  avg_cycle_days: number | string | null;
  open_count: number;
  open_value: number | string;
  open_weighted: number | string;
  by_month: { month: string; value: number | string; count: number }[];
  by_owner: { owner_id: string | null; won_count: number; won_value: number | string; lost_count: number; open_count: number; open_value: number | string }[];
  lost_reasons: { reason: string; count: number }[];
  by_source: { source: string; created: number; won_count: number; won_value: number | string }[];
  stages: { id: string; name: string; count: number; value: number | string; avg_days: number | string | null }[];
  tasks: { done_period: number; open: number; overdue: number };
  atendimento: {
    conversations_open: number;
    conversations_pending: number;
    conversations_closed: number;
    conversations_new: number;
    unread: number | string;
    messages_in: number;
    messages_out: number;
    avg_first_response_seconds: number | string | null;
    answered_conversations: number;
    tickets_open: number;
  };
}

export const PERIODS = [30, 90, 180, 365] as const;
export type Period = (typeof PERIODS)[number];

export function parsePeriod(v: unknown): Period {
  const n = Number(v);
  return (PERIODS as readonly number[]).includes(n) ? (n as Period) : 90;
}

/** 360 → "6 min"; 4800 → "1 h 20 min"; 200000 → "2 d 7 h". Nulo vira "—". */
export function formatDuration(seconds: number | string | null | undefined): string {
  if (seconds === null || seconds === undefined) return "—";
  const s = Number(seconds);
  if (!Number.isFinite(s) || s < 0) return "—";
  if (s < 60) return "menos de 1 min";
  const min = Math.round(s / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) {
    const m = min % 60;
    return m ? `${h} h ${m} min` : `${h} h`;
  }
  const d = Math.floor(h / 24);
  const hh = h % 24;
  return hh ? `${d} d ${hh} h` : `${d} d`;
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "2026-11" → "nov/26". */
export function monthLabel(ym: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return ym;
  return `${MONTHS[Number(m[2]) - 1] ?? m[2]}/${m[1].slice(2)}`;
}

/** 66.666 → "66,7%". Nulo vira "—". */
export function formatPct(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const n = Number(v);
  return Number.isFinite(n) ? `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—";
}

/** Dias com uma casa: 15 → "15 dias", 1 → "1 dia", 7.5 → "7,5 dias". */
export function formatDays(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${n === 1 ? "dia" : "dias"}`;
}

/** Largura (0-100) de uma barra, com mínimo visível para valores positivos. */
export function barWidth(value: number, max: number): number {
  if (!(max > 0) || !(value > 0)) return 0;
  return Math.max(3, Math.min(100, (value / max) * 100));
}
