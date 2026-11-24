// @vitest-environment node
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { createDb, emailOf, helpers } from "./harness";

let db: PGlite;
let as: ReturnType<typeof helpers>["as"];
let rows: ReturnType<typeof helpers>["rows"];
let fails: ReturnType<typeof helpers>["fails"];

const V = {
  adm: "00000000-0000-0000-0000-0000000000b1",
  man: "00000000-0000-0000-0000-0000000000b2",
  sel: "00000000-0000-0000-0000-0000000000b3",
  out: "00000000-0000-0000-0000-0000000000b4",
};
let x: string;
let y: string;

const create = (user: string, org: string, shortcut: string, body = "Olá {{primeiro_nome}}!") =>
  as(user, () => rows("insert into quick_replies (org_id, shortcut, title, body, created_by) values ($1, $2, 'Saudação', $3, $4) returning id", [org, shortcut, body, user]));

beforeAll(async () => {
  db = await createDb();
  ({ as, rows, fails } = helpers(db));
  for (const id of Object.values(V)) {
    await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{}')", [id, emailOf(id)]);
  }
  x = await as(V.adm, async () => (await rows("select public.create_organization('Org X') as id"))[0].id);
  y = await as(V.out, async () => (await rows("select public.create_organization('Org Y') as id"))[0].id);
  await db.query("insert into memberships (org_id, user_id, role) values ($1, $2, 'manager'), ($1, $3, 'seller')", [x, V.man, V.sel]);
});

describe("respostas rápidas", () => {
  it("administrador e gerente cadastram; vendedor não", async () => {
    expect((await create(V.adm, x, "ola")).length).toBe(1);
    expect((await create(V.man, x, "preco")).length).toBe(1);
    expect(await fails(() => create(V.sel, x, "hack"))).toBe(true);
  });

  it("toda a equipe enxerga as da própria organização, e só elas", async () => {
    await create(V.out, y, "outra");
    const sel = await as(V.sel, () => rows("select shortcut from quick_replies order by shortcut"));
    expect(sel.map((r) => r.shortcut)).toEqual(["ola", "preco"]);
    const out = await as(V.out, () => rows("select shortcut from quick_replies"));
    expect(out.map((r) => r.shortcut)).toEqual(["outra"]);
  });

  it("ninguém cadastra em organização alheia nem em nome de outra pessoa", async () => {
    expect(await fails(() => create(V.out, x, "invasao"))).toBe(true);
    expect(await as(V.adm, () => fails(() => rows("insert into quick_replies (org_id, shortcut, title, body, created_by) values ($1, 'falso', 't', 'b', $2)", [x, V.man])))).toBe(true);
  });

  it("atalho é único por organização e só aceita minúsculas, números, - e _", async () => {
    expect(await fails(() => create(V.adm, x, "ola"))).toBe(true);
    expect(await fails(() => create(V.adm, x, "Com Espaço"))).toBe(true);
    expect((await create(V.out, y, "ola")).length).toBe(1); // mesmo atalho em outra organização pode
  });

  it("vendedor não edita nem apaga; gerente edita", async () => {
    const upd = await as(V.sel, () => rows("update quick_replies set body = 'x' where shortcut = 'ola' and org_id = $1 returning id", [x]));
    expect(upd.length).toBe(0);
    const del = await as(V.sel, () => rows("delete from quick_replies where org_id = $1 returning id", [x]));
    expect(del.length).toBe(0);
    const ok = await as(V.man, () => rows("update quick_replies set body = 'Bom dia, {{nome}}' where shortcut = 'ola' and org_id = $1 returning body", [x]));
    expect(ok[0].body).toBe("Bom dia, {{nome}}");
  });

  it("não dá para mudar a organização nem o autor de uma resposta", async () => {
    expect(await as(V.adm, () => fails(() => rows("update quick_replies set org_id = $1 where org_id = $2", [y, x])))).toBe(true);
    expect(await as(V.adm, () => fails(() => rows("update quick_replies set created_by = $1 where org_id = $2", [V.sel, x])))).toBe(true);
  });

  it("alterações entram na auditoria", async () => {
    const n = await rows("select count(*)::int as n from audit_log where table_name = 'quick_replies' and org_id = $1", [x]);
    expect(n[0].n).toBeGreaterThanOrEqual(3);
  });
});
