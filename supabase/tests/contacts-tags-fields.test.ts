// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { emailOf, helpers } from "./harness";

const MIGRATION = "20261124000200_contacts_tags_fields.sql";
const V = {
  adm: "00000000-0000-0000-0000-0000000000d1",
  sel: "00000000-0000-0000-0000-0000000000d2",
  out: "00000000-0000-0000-0000-0000000000d3",
};

let db: PGlite;
let as: ReturnType<typeof helpers>["as"];
let rows: ReturnType<typeof helpers>["rows"];
let fails: ReturnType<typeof helpers>["fails"];
let x: string;
let y: string;
let keeper: string;
let dupDeal: string;
let dupTask: string;

/**
 * Banco com as migrações ATÉ ANTES da de contatos, dados duplicados inseridos, e só então a migração:
 * assim o teste prova a junção automática do jeito que vai rodar na produção.
 */
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    grant usage on schema public to anon, authenticated;
    create schema auth; grant usage on schema auth to anon, authenticated;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.email() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.email', true), '') $$;
    grant execute on function auth.uid(), auth.email() to anon, authenticated;
  `);
  const dir = path.join(__dirname, "../migrations");
  const files = readdirSync(dir).filter((n) => n.endsWith(".sql")).sort();
  const before = files.filter((f) => f < MIGRATION);
  const after = files.filter((f) => f >= MIGRATION);
  for (const f of before) await db.exec(readFileSync(path.join(dir, f), "utf8"));
  ({ as, rows, fails } = helpers(db));

  for (const id of Object.values(V)) await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{}')", [id, emailOf(id)]);
  x = await as(V.adm, async () => (await rows("select public.create_organization('Org X') as id"))[0].id);
  y = await as(V.out, async () => (await rows("select public.create_organization('Org Y') as id"))[0].id);
  await db.query("insert into memberships (org_id, user_id, role) values ($1, $2, 'seller')", [x, V.sel]);

  // Mesmo celular, com e sem o 9, e com máscara diferente: três cadastros da mesma pessoa.
  const ins = (org: string, name: string, phone: string, email: string | null, notes: string | null, at: string) =>
    rows("insert into contacts (org_id, name, phone, email, notes, created_by, created_at) values ($1, $2, $3, $4, $5, $6, $7) returning id", [org, name, phone, email, notes, V.adm, at]);
  keeper = (await ins(x, "Maria Souza", "(11) 91234-5678", null, "Cliente antiga", "2026-01-01"))[0].id;
  const d1 = (await ins(x, "Maria", "+55 11 1234-5678", "maria@ex.com", "Veio do Instagram", "2026-02-01"))[0].id;
  const d2 = (await ins(x, "Maria S.", "5511912345678", "outra@ex.com", null, "2026-03-01"))[0].id;
  await ins(x, "Outra pessoa", "(11) 98888-7777", null, null, "2026-01-05");
  await ins(y, "Maria em outra empresa", "(11) 91234-5678", null, null, "2026-01-01"); // outra organização: não junta

  const pipe = (await rows("select id from pipelines where org_id = $1 limit 1", [x]))[0].id;
  const stage = (await rows("select id from stages where pipeline_id = $1 order by position limit 1", [pipe]))[0].id;
  dupDeal = (await rows("insert into deals (org_id, pipeline_id, stage_id, title, contact_id, created_by) values ($1, $2, $3, 'Implante', $4, $5) returning id", [x, pipe, stage, d1, V.adm]))[0].id;
  dupTask = (await rows("insert into tasks (org_id, title, contact_id, created_by) values ($1, 'Ligar', $2, $3) returning id", [x, d2, V.adm]))[0].id;

  for (const f of after) await db.exec(readFileSync(path.join(dir, f), "utf8"));
});

describe("junção automática dos duplicados por telefone", () => {
  it("fica só o contato mais antigo daquela pessoa", async () => {
    const r = await rows("select id, name from contacts where org_id = $1 order by created_at", [x]);
    expect(r.map((c) => c.name)).toEqual(["Maria Souza", "Outra pessoa"]);
    expect(r[0].id).toBe(keeper);
  });

  it("negócios e tarefas dos duplicados passam para ele", async () => {
    expect((await rows("select contact_id from deals where id = $1", [dupDeal]))[0].contact_id).toBe(keeper);
    expect((await rows("select contact_id from tasks where id = $1", [dupTask]))[0].contact_id).toBe(keeper);
  });

  it("campos vazios são preenchidos e o resto vai para as observações, sem perder nada", async () => {
    const c = (await rows("select email, notes from contacts where id = $1", [keeper]))[0];
    expect(c.email).toBe("maria@ex.com");
    expect(c.notes).toContain("Cliente antiga");
    expect(c.notes).toContain("[Unificado automaticamente por telefone]");
    expect(c.notes).toContain("Outro e-mail: outra@ex.com");
    expect(c.notes).toContain("Veio do Instagram");
    expect(c.notes).toContain("Também cadastrado como: Maria S.");
  });

  it("outra organização não é afetada", async () => {
    expect((await rows("select count(*)::int as n from contacts where org_id = $1", [y]))[0].n).toBe(1);
  });
});

describe("telefone único", () => {
  it("o mesmo celular com ou sem o 9, em qualquer formato, é recusado", async () => {
    for (const p of ["11912345678", "+55 (11) 1234-5678", "0055 11 91234 5678"]) {
      expect(await as(V.adm, () => fails(() => rows("insert into contacts (org_id, name, phone, created_by) values ($1, 'Dup', $2, $3)", [x, p, V.adm])))).toBe(true);
    }
  });
  it("número estrangeiro com + é respeitado e telefone vazio não conta", async () => {
    await as(V.adm, () => rows("insert into contacts (org_id, name, phone, created_by) values ($1, 'EUA', '+1 415 555 0100', $2)", [x, V.adm]));
    await as(V.adm, () => rows("insert into contacts (org_id, name, phone, created_by) values ($1, 'Sem 1', null, $2), ($1, 'Sem 2', '', $2)", [x, V.adm]));
    expect((await rows("select phone_key from contacts where name = 'EUA'"))[0].phone_key).toBe("14155550100");
  });
  it("chave igual à do servidor (TypeScript)", async () => {
    const k = async (p: string) => (await rows("select public.phone_key($1) as k", [p]))[0].k;
    expect(await k("(11) 91234-5678")).toBe("551112345678");
    expect(await k("551112345678")).toBe("551112345678");
    expect(await k("123")).toBeNull();
  });
});

describe("conversas ligadas ao contato pelo telefone", () => {
  it("mensagem nova de um número sem o 9 encontra o contato que tem o 9", async () => {
    const KEY = "z".repeat(48);
    await db.query("select public.set_internal_key($1)", [KEY]);
    const ch = await as(V.adm, async () => (await rows("select public.create_whatsapp_channel($1, 'qr', 'Canal', 'inst-x', '{}'::jsonb) as id", [x]))[0].id);
    const conv = (await rows("select public.wa_ingest($1, $2, '551112345678', 'Maria', 'Oi', 'w1') as id", [KEY, ch]))[0].id;
    expect((await rows("select contact_id from conversations where id = $1", [conv]))[0].contact_id).toBe(keeper);
  });
  it("contato criado depois é ligado às conversas do mesmo número", async () => {
    const KEY = "z".repeat(48);
    const ch = (await rows("select id from whatsapp_channels where org_id = $1 limit 1", [x]))[0].id;
    const conv = (await rows("select public.wa_ingest($1, $2, '5521987654321', 'João', 'Oi', 'w2') as id", [KEY, ch]))[0].id;
    expect((await rows("select contact_id from conversations where id = $1", [conv]))[0].contact_id).toBeNull();
    const joao = await as(V.sel, async () => (await rows("insert into contacts (org_id, name, phone, created_by) values ($1, 'João', '(21) 98765-4321', $2) returning id", [x, V.sel]))[0].id);
    expect((await rows("select contact_id from conversations where id = $1", [conv]))[0].contact_id).toBe(joao);
  });
});

describe("etiquetas", () => {
  it("vendedor cria e aplica; só gerente/admin apaga; nome único sem diferenciar maiúsculas", async () => {
    const tag = await as(V.sel, async () => (await rows("insert into tags (org_id, name, color, created_by) values ($1, 'Implante', 'blue', $2) returning id", [x, V.sel]))[0].id);
    expect(await as(V.adm, () => fails(() => rows("insert into tags (org_id, name, created_by) values ($1, ' implante ', $2)", [x, V.adm])))).toBe(true);
    await as(V.sel, () => rows("insert into contact_tags (org_id, contact_id, tag_id) values ($1, $2, $3)", [x, keeper, tag]));
    expect((await as(V.sel, () => rows("delete from tags where id = $1 returning id", [tag]))).length).toBe(0);
    expect((await as(V.adm, () => rows("update tags set name = 'Implantes' where id = $1 returning id", [tag]))).length).toBe(1);
  });
  it("outra organização não vê nem aplica", async () => {
    expect((await as(V.out, () => rows("select * from tags"))).length).toBe(0);
    const tag = (await rows("select id from tags where org_id = $1 limit 1", [x]))[0].id;
    const other = (await rows("select id from contacts where org_id = $1 limit 1", [y]))[0].id;
    expect(await as(V.out, () => fails(() => rows("insert into contact_tags (org_id, contact_id, tag_id) values ($1, $2, $3)", [y, other, tag])))).toBe(true);
  });
});

describe("campos personalizados", () => {
  let num: string;
  let sel: string;
  let date: string;
  it("só o administrador cria campos", async () => {
    expect(await as(V.sel, () => fails(() => rows("insert into custom_fields (org_id, label, kind) values ($1, 'Convênio', 'text')", [x])))).toBe(true);
    num = await as(V.adm, async () => (await rows("insert into custom_fields (org_id, label, kind) values ($1, 'Orçamento', 'number') returning id", [x]))[0].id);
    sel = await as(V.adm, async () => (await rows("insert into custom_fields (org_id, label, kind, options) values ($1, 'Interesse', 'select', '{Implante,Clareamento}') returning id", [x]))[0].id);
    date = await as(V.adm, async () => (await rows("insert into custom_fields (org_id, label, kind) values ($1, 'Aniversário', 'date') returning id", [x]))[0].id);
  });
  it("lista de opções só existe no tipo 'lista'", async () => {
    expect(await as(V.adm, () => fails(() => rows("insert into custom_fields (org_id, label, kind) values ($1, 'Vazia', 'select')", [x])))).toBe(true);
    expect(await as(V.adm, () => fails(() => rows("insert into custom_fields (org_id, label, kind, options) values ($1, 'Texto', 'text', '{a}')", [x])))).toBe(true);
  });
  it("vendedor preenche, e o valor precisa combinar com o tipo", async () => {
    const put = (field: string, value: string) => as(V.sel, () => rows("insert into contact_field_values (org_id, contact_id, field_id, value) values ($1, $2, $3, $4) on conflict (contact_id, field_id) do update set value = excluded.value", [x, keeper, field, value]));
    await put(num, "1500,50");
    await put(sel, "Implante");
    await put(date, "1990-05-20");
    expect(await fails(() => put(num, "mil"))).toBe(true);
    expect(await fails(() => put(sel, "Botox"))).toBe(true);
    expect(await fails(() => put(date, "2026-02-31"))).toBe(true);
    expect(await fails(() => put(date, "20/05/1990"))).toBe(true);
  });
});
