import { parseCsv } from "./csv";

export interface ContactInput {
  name: string;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  company: string | null;
  source: string | null;
  notes: string | null;
}

export type Validation = { ok: true; value: ContactInput } | { ok: false; error: string };

const clean = (v: unknown, max: number): string | null => {
  const s = String(v ?? "").trim();
  return s === "" ? null : s.slice(0, max);
};
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateContact(raw: Record<string, unknown>): Validation {
  const name = clean(raw.name, 120);
  if (!name) return { ok: false, error: "Informe o nome do contato." };
  const email = clean(raw.email, 254)?.toLowerCase() ?? null;
  if (email && !EMAIL.test(email)) return { ok: false, error: `E-mail inválido: ${email}` };
  return {
    ok: true,
    value: {
      name,
      email,
      phone: clean(raw.phone, 40),
      jobTitle: clean(raw.jobTitle, 120),
      company: clean(raw.company, 120),
      source: clean(raw.source, 60),
      notes: clean(raw.notes, 5000),
    },
  };
}

// ---------------------------------------------------------------- importação
const HEADERS: Record<string, keyof ContactInput> = {
  nome: "name",
  name: "name",
  "nome completo": "name",
  email: "email",
  "e-mail": "email",
  telefone: "phone",
  celular: "phone",
  whatsapp: "phone",
  phone: "phone",
  empresa: "company",
  company: "company",
  cargo: "jobTitle",
  "job title": "jobTitle",
  origem: "source",
  source: "source",
  observações: "notes",
  observacoes: "notes",
  notas: "notes",
  notes: "notes",
};

const norm = (s: string) => s.normalize("NFC").trim().toLowerCase();

export interface ImportPreview {
  valid: ContactInput[];
  errors: { line: number; error: string }[];
  /** Colunas do arquivo que não foram reconhecidas (ignoradas). */
  ignoredColumns: string[];
  tooLarge?: boolean;
}

export const IMPORT_MAX_ROWS = 2000;
export const IMPORT_MAX_BYTES = 1_000_000;

export function parseContactsCsv(text: string): ImportPreview {
  if (text.length > IMPORT_MAX_BYTES) return { valid: [], errors: [], ignoredColumns: [], tooLarge: true };
  const rows = parseCsv(text);
  if (rows.length === 0) return { valid: [], errors: [{ line: 1, error: "O arquivo está vazio." }], ignoredColumns: [] };

  const [head, ...body] = rows;
  const map = head.map((h) => HEADERS[norm(h)] ?? null);
  const ignoredColumns = head.filter((_, i) => map[i] === null).map((h) => h.trim()).filter(Boolean);
  if (!map.includes("name")) {
    return { valid: [], errors: [{ line: 1, error: 'Não encontrei a coluna "Nome". A primeira linha precisa ser o cabeçalho.' }], ignoredColumns };
  }
  if (body.length > IMPORT_MAX_ROWS) return { valid: [], errors: [], ignoredColumns, tooLarge: true };

  const valid: ContactInput[] = [];
  const errors: { line: number; error: string }[] = [];
  const seen = new Set<string>();
  body.forEach((cells, idx) => {
    const raw: Record<string, unknown> = {};
    map.forEach((key, i) => {
      if (key) raw[key] = cells[i] ?? "";
    });
    const v = validateContact(raw);
    if (!v.ok) return void errors.push({ line: idx + 2, error: v.error });
    if (v.value.email) {
      if (seen.has(v.value.email)) return void errors.push({ line: idx + 2, error: `E-mail repetido no arquivo: ${v.value.email}` });
      seen.add(v.value.email);
    }
    valid.push(v.value);
  });
  return { valid, errors, ignoredColumns };
}
