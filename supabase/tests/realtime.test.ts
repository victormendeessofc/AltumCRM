import { readFileSync } from "node:fs";
import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { createDb } from "./harness";

let db: PGlite;
beforeAll(async () => {
  db = await createDb();
});

const published = async () =>
  (
    await db.query<{ tablename: string }>(
      "select tablename from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' order by tablename",
    )
  ).rows.map((r) => r.tablename);

describe("tempo real", () => {
  it("publica conversas, mensagens e notificações (e nada além disso)", async () => {
    expect(await published()).toEqual(["conversations", "messages", "notifications"]);
  });

  it("a migração pode rodar de novo sem erro nem duplicar", async () => {
    const sql = readFileSync(path.join(__dirname, "../migrations/20261124000000_realtime.sql"), "utf8");
    await db.exec(sql);
    expect(await published()).toEqual(["conversations", "messages", "notifications"]);
  });
});
