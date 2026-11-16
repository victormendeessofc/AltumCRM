// Junta todas as migrações em um único arquivo para colar no SQL Editor de um projeto Supabase NOVO
// (por exemplo, o de produção): npm run db:bundle  →  supabase/schema-completo.sql
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const dir = path.join(import.meta.dirname, "..", "supabase", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const out = [
  "-- Altum CRM — esquema completo (todas as migrações em ordem).",
  "-- Cole TUDO no SQL Editor de um projeto Supabase NOVO e clique em Run. Não rode em um projeto que já tem as migrações.",
  "",
  ...files.flatMap((f) => [`-- ====================================================================`, `-- ${f}`, `-- ====================================================================`, readFileSync(path.join(dir, f), "utf8").trim(), ""]),
].join("\n");
writeFileSync(path.join(import.meta.dirname, "..", "supabase", "schema-completo.sql"), out);
console.log(`${files.length} migrações → supabase/schema-completo.sql (${out.length} caracteres)`);
