export interface QuickReply {
  id: string;
  shortcut: string;
  title: string;
  body: string;
}

/** "Preço Consulta" → "preco-consulta". Mesmo formato que o banco aceita: a-z, 0-9, - e _, até 30. */
export function normalizeShortcut(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/^\/+/, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 30);
}

export const SHORTCUT_RE = /^[a-z0-9_-]{1,30}$/;

/**
 * Preenche {{nome}} e {{primeiro_nome}}. Se não há nome de verdade (só o número), a variável some
 * junto com o espaço antes dela: "Olá {{primeiro_nome}}!" vira "Olá!".
 */
export function fillVariables(body: string, name: string | null | undefined): string {
  const real = name && /\p{L}/u.test(name) ? name.trim() : "";
  const first = real.split(/\s+/)[0] ?? "";
  const values: Record<string, string> = { nome: real, primeiro_nome: first };
  return body.replace(/( ?)\{\{\s*(nome|primeiro_nome)\s*\}\}/gi, (_, space: string, key: string) => {
    const v = values[key.toLowerCase()];
    return v ? space + v : "";
  });
}

/**
 * Se o rascunho é um comando "/algo" (sem espaço ainda), devolve o termo buscado; senão null.
 * "/" sozinho devolve "" (mostra todas).
 */
export function slashQuery(draft: string): string | null {
  const m = /^\/([^\s/]*)$/.exec(draft);
  return m ? m[1].toLowerCase() : null;
}

/** Atalho que começa com o termo vem primeiro; depois atalho ou título que contém o termo. */
export function matchQuickReplies(list: QuickReply[], query: string, limit = 8): QuickReply[] {
  const q = normalizeShortcut(query);
  if (!q) return list.slice(0, limit);
  const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const starts = list.filter((r) => r.shortcut.startsWith(q));
  const contains = list.filter((r) => !r.shortcut.startsWith(q) && (r.shortcut.includes(q) || plain(r.title).includes(q.replace(/-/g, " "))));
  return [...starts, ...contains].slice(0, limit);
}
