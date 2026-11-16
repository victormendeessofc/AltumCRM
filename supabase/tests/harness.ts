import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/** Postgres embutido com um stub mínimo do schema "auth" do Supabase + todas as migrações reais, em ordem. */
export async function createDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    grant usage on schema public to anon, authenticated;
    create schema auth;
    grant usage on schema auth to anon, authenticated;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.email() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.email', true), '') $$;
    grant execute on function auth.uid(), auth.email() to anon, authenticated;
  `);
  const dir = path.join(__dirname, "../migrations");
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(path.join(dir, f), "utf8"));
  }
  return db;
}

export const emailOf = (id: string) => `${id.slice(-1)}@teste.com`;

export function helpers(db: PGlite) {
  /** Executa fn com o papel "authenticated" (ou "anon") e o usuário informado, como o Supabase faria. */
  async function as<T>(user: string | null, fn: () => Promise<T>): Promise<T> {
    await db.query("select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claim.email', $2, false)", [
      user ?? "",
      user ? emailOf(user) : "",
    ]);
    await db.exec(user ? "set role authenticated" : "set role anon");
    try {
      return await fn();
    } finally {
      await db.exec("reset role");
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows as Record<string, any>[];
  const fails = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch {
      return true;
    }
    return false;
  };
  return { as, rows, fails };
}
