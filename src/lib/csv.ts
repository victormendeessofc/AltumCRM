/** CSV (RFC 4180): aspas, vírgula/ponto e vírgula dentro de campos, quebras de linha em campos. */

/** Detecta o separador (Excel em português salva com ponto e vírgula). */
export function detectDelimiter(text: string): "," | ";" | "\t" {
  const firstLine = text.replace(/^﻿/, "").split(/\r?\n/, 1)[0] ?? "";
  const count = (c: string) => (firstLine.match(new RegExp(c === "\t" ? "\t" : `\\${c}`, "g")) ?? []).length;
  const best = ([";", ",", "\t"] as const).reduce((a, b) => (count(b) > count(a) ? b : a), ",");
  return best;
}

export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const delim = detectDelimiter(src);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"' && field === "") {
      inQuotes = true;
    } else if (ch === delim) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // descarta linhas totalmente vazias
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/**
 * Protege contra injeção de fórmula ao abrir no Excel/Sheets: células que começam com
 * = + - @ (ou tab/CR) ganham um apóstrofo na frente.
 */
export function safeCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? "'" + value : value;
}

export function toCsv(rows: (string | null | undefined)[][], delimiter = ";"): string {
  const esc = (v: string | null | undefined) => {
    const s = safeCell(v ?? "");
    return /["\n\r;,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // BOM para o Excel reconhecer UTF-8 (acentos).
  return "﻿" + rows.map((r) => r.map(esc).join(delimiter)).join("\r\n") + "\r\n";
}
