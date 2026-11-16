export type DueBucket = "overdue" | "today" | "upcoming" | "none" | "done";

export const TZ = "America/Sao_Paulo";

/** Data (AAAA-MM-DD) de um instante, no fuso de Brasília. */
export function localDate(d: Date | string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(d));
}

export function dueBucket(task: { dueAt: string | null; doneAt: string | null }, now: Date = new Date()): DueBucket {
  if (task.doneAt) return "done";
  if (!task.dueAt) return "none";
  const due = localDate(task.dueAt);
  const today = localDate(now);
  if (due < today) return "overdue";
  if (due === today) return "today";
  return "upcoming";
}

export function formatDue(dueAt: string | null, now: Date = new Date()): string {
  if (!dueAt) return "Sem prazo";
  const d = new Date(dueAt);
  const day = localDate(d);
  const today = localDate(now);
  const tomorrow = localDate(new Date(now.getTime() + 86_400_000));
  const yesterday = localDate(new Date(now.getTime() - 86_400_000));
  const time = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d);
  const hasTime = time !== "00:00";
  const label =
    day === today ? "Hoje" : day === tomorrow ? "Amanhã" : day === yesterday ? "Ontem" : new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "short" }).format(d).replace(".", "");
  return hasTime ? `${label}, ${time}` : label;
}

/** "2026-11-20" + "14:30" (horário de Brasília, UTC-3 sem horário de verão) → ISO em UTC. */
export function toDueIso(date: string, time?: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const t = time && /^\d{2}:\d{2}$/.test(time) ? time : "00:00";
  const iso = new Date(`${date}T${t}:00-03:00`);
  return Number.isNaN(iso.getTime()) ? null : iso.toISOString();
}

/** Inverso: ISO → { date, time } no horário de Brasília, para preencher o formulário. */
export function fromDueIso(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  const time = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  return { date: localDate(d), time: time === "00:00" ? "" : time };
}

export interface TaskInput {
  title: string;
  notes: string | null;
  dueAt: string | null;
}

export function validateTask(raw: Record<string, unknown>): { ok: true; value: TaskInput } | { ok: false; error: string } {
  const title = String(raw.title ?? "").trim().slice(0, 200);
  if (!title) return { ok: false, error: "Informe o que precisa ser feito." };
  const date = String(raw.dueDate ?? "").trim();
  let dueAt: string | null = null;
  if (date) {
    dueAt = toDueIso(date, String(raw.dueTime ?? ""));
    if (!dueAt) return { ok: false, error: "Data inválida." };
  }
  const notes = String(raw.notes ?? "").trim().slice(0, 5000) || null;
  return { ok: true, value: { title, notes, dueAt } };
}
