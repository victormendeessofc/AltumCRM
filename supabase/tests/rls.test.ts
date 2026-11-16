// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * Roda a migração real num Postgres embutido e prova o isolamento entre organizações.
 * O schema "auth" é um stub mínimo do Supabase (uid/email lidos de variáveis de sessão).
 */
let db: PGlite;

const A = "00000000-0000-0000-0000-00000000000a"; // admin da Org 1
const B = "00000000-0000-0000-0000-00000000000b"; // admin da Org 2
const C = "00000000-0000-0000-0000-00000000000c"; // vendedor da Org 1
const D = "00000000-0000-0000-0000-00000000000d"; // convidado (sem organização)
const email = (id: string) => `${id.slice(-1)}@teste.com`;

async function as<T>(user: string | null, fn: () => Promise<T>): Promise<T> {
  await db.query("select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claim.email', $2, false)", [
    user ?? "",
    user ? email(user) : "",
  ]);
  await db.exec(user ? "set role authenticated" : "set role anon");
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}
const rows = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows as Record<string, unknown>[];
const fails = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
  } catch {
    return true;
  }
  return false;
};

let org1: string;
let org2: string;

beforeAll(async () => {
  db = new PGlite();
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
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".sql")).sort()) await db.exec(readFileSync(path.join(dir, f), "utf8"));
  for (const id of [A, B, C, D]) {
    await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)", [id, email(id), JSON.stringify({ full_name: "Usuário " + id.slice(-1) })]);
  }
  org1 = await as(A, async () => (await rows("select public.create_organization('Vértice Soluções') as id"))[0].id as string);
  org2 = await as(B, async () => (await rows("select public.create_organization('Nimbus Educação') as id"))[0].id as string);
  // C entra na Org 1 como vendedor (via convite, como na vida real)
  await as(A, () => db.query("insert into invitations (org_id, email, role, invited_by) values ($1, $2, 'seller', $3)", [org1, email(C), A]));
  const token = (await rows("select token from invitations where org_id = $1", [org1]))[0].token as string;
  await as(C, () => db.query("select public.accept_invitation($1)", [token]));
});

describe("perfis", () => {
  it("guarda o e-mail no perfil e só mostra a quem divide organização", async () => {
    expect((await rows("select email from profiles where id = $1", [A]))[0].email).toBe(email(A));
    const seen = await as(B, async () => (await rows("select email from profiles")).map((r) => r.email));
    expect(seen).toEqual([email(B)]);
  });
  it("o gatilho cria o perfil ao cadastrar o usuário", async () => {
    const r = await rows("select full_name from profiles where id = $1", [A]);
    expect(r[0].full_name).toBe("Usuário a");
  });
  it("vê o próprio perfil e o de quem divide organização, mas não o de estranhos", async () => {
    const ids = await as(A, async () => (await rows("select id from profiles")).map((r) => r.id));
    expect(ids).toContain(A);
    expect(ids).toContain(C);
    expect(ids).not.toContain(B);
  });
  it("não edita o perfil de outra pessoa", async () => {
    await as(A, () => db.query("update profiles set full_name = 'hack' where id = $1", [C]));
    expect((await rows("select full_name from profiles where id = $1", [C]))[0].full_name).toBe("Usuário c");
  });
});

describe("isolamento entre organizações", () => {
  it("cada admin vê só a própria organização", async () => {
    expect(await as(A, async () => (await rows("select id from organizations")).map((r) => r.id))).toEqual([org1]);
    expect(await as(B, async () => (await rows("select id from organizations")).map((r) => r.id))).toEqual([org2]);
  });
  it("não enxerga membros de outra organização", async () => {
    const r = await as(B, () => rows("select user_id from memberships where org_id = $1", [org1]));
    expect(r).toHaveLength(0);
  });
  it("anônimo não lê nada nem cria organização", async () => {
    expect(await fails(() => as(null, () => rows("select * from organizations")))).toBe(true);
    expect(await fails(() => as(null, () => db.query("select public.create_organization('X Y')")))).toBe(true);
  });
  it("não cria organização nem membro por INSERT direto", async () => {
    expect(await fails(() => as(A, () => db.query("insert into organizations (name) values ('Fraude')")))).toBe(true);
    expect(await fails(() => as(B, () => db.query("insert into memberships (org_id, user_id, role) values ($1, $2, 'admin')", [org1, B])))).toBe(true);
  });
  it("admin de uma org não altera outra", async () => {
    await as(B, () => db.query("update organizations set name = 'Invadida' where id = $1", [org1]));
    expect((await rows("select name from organizations where id = $1", [org1]))[0].name).toBe("Vértice Soluções");
  });
});

describe("papéis", () => {
  it("vendedor lê a organização mas não a renomeia", async () => {
    expect(await as(C, async () => (await rows("select id from organizations")).length)).toBe(1);
    await as(C, () => db.query("update organizations set name = 'Mudou' where id = $1", [org1]));
    expect((await rows("select name from organizations where id = $1", [org1]))[0].name).toBe("Vértice Soluções");
  });
  it("vendedor não convida nem promove a si mesmo", async () => {
    expect(await fails(() => as(C, () => db.query("insert into invitations (org_id, email, invited_by) values ($1, 'x@y.com', $2)", [org1, C])))).toBe(true);
    await as(C, () => db.query("update memberships set role = 'admin' where user_id = $1", [C]));
    expect((await rows("select role from memberships where user_id = $1 and org_id = $2", [C, org1]))[0].role).toBe("seller");
  });
  it("admin muda o papel de um membro", async () => {
    await as(A, () => db.query("update memberships set role = 'manager' where user_id = $1 and org_id = $2", [C, org1]));
    expect((await rows("select role from memberships where user_id = $1 and org_id = $2", [C, org1]))[0].role).toBe("manager");
    await as(A, () => db.query("update memberships set role = 'seller' where user_id = $1 and org_id = $2", [C, org1]));
  });
  it("campos protegidos: admin não troca org_id nem user_id de um membro", async () => {
    expect(await fails(() => as(A, () => db.query("update memberships set org_id = $1 where user_id = $2", [org2, C])))).toBe(true);
  });
});

describe("convites", () => {
  it("só o e-mail convidado aceita", async () => {
    await as(A, () => db.query("insert into invitations (org_id, email, role, invited_by) values ($1, $2, 'seller', $3)", [org1, email(D), A]));
    const token = (await rows("select token from invitations where lower(email) = $1", [email(D)]))[0].token as string;
    expect(await fails(() => as(B, () => db.query("select public.accept_invitation($1)", [token])))).toBe(true);
    await as(D, () => db.query("select public.accept_invitation($1)", [token]));
    expect((await rows("select role from memberships where user_id = $1 and org_id = $2", [D, org1]))[0].role).toBe("seller");
  });
  it("convite usado não vale de novo", async () => {
    const token = (await rows("select token from invitations where lower(email) = $1", [email(D)]))[0].token as string;
    expect(await fails(() => as(D, () => db.query("select public.accept_invitation($1)", [token])))).toBe(true);
  });
  it("convite expirado é recusado", async () => {
    await db.query("insert into invitations (org_id, email, invited_by, expires_at) values ($1, 'b@teste.com', $2, now() - interval '1 day')", [org1, A]);
    const token = (await rows("select token from invitations where lower(email) = 'b@teste.com' and accepted_at is null"))[0].token as string;
    expect(await fails(() => as(B, () => db.query("select public.accept_invitation($1)", [token])))).toBe(true);
  });
  it("vendedor não lista convites", async () => {
    expect(await as(C, async () => (await rows("select * from invitations")).length)).toBe(0);
  });
});

describe("última administração", () => {
  it("impede rebaixar ou remover o único admin", async () => {
    expect(await fails(() => as(A, () => db.query("update memberships set role = 'seller' where user_id = $1 and org_id = $2", [A, org1])))).toBe(true);
    expect(await fails(() => as(A, () => db.query("delete from memberships where user_id = $1 and org_id = $2", [A, org1])))).toBe(true);
  });
  it("permite sair quando há outro admin", async () => {
    await as(A, () => db.query("update memberships set role = 'admin' where user_id = $1 and org_id = $2", [C, org1]));
    await as(A, () => db.query("delete from memberships where user_id = $1 and org_id = $2", [A, org1]));
    expect(await as(A, async () => (await rows("select id from organizations")).length)).toBe(0);
  });
  it("apagar a organização inteira não é bloqueado pela regra", async () => {
    await db.query("delete from organizations where id = $1", [org2]);
    expect(await rows("select 1 from memberships where org_id = $1", [org2])).toHaveLength(0);
  });
});

describe("contatos e empresas", () => {
  // Estado neste ponto: org1 tem C (agora admin) e D (vendedor); A saiu. org2 foi apagada. Recriamos o cenário.
  let o1: string;
  let o2: string;
  let co1: string;
  let co2: string;
  const U = {
    adm: "00000000-0000-0000-0000-0000000000e1",
    mgr: "00000000-0000-0000-0000-0000000000e2",
    sel: "00000000-0000-0000-0000-0000000000e3",
    out: "00000000-0000-0000-0000-0000000000e4",
  };

  beforeAll(async () => {
    for (const id of Object.values(U)) {
      await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{}')", [id, email(id)]);
    }
    o1 = await as(U.adm, async () => (await rows("select public.create_organization('Org Contatos 1') as id"))[0].id as string);
    o2 = await as(U.out, async () => (await rows("select public.create_organization('Org Contatos 2') as id"))[0].id as string);
    await db.query("insert into memberships (org_id, user_id, role) values ($1, $2, 'manager'), ($1, $3, 'seller')", [o1, U.mgr, U.sel]);
    co1 = (await rows("insert into companies (org_id, name, created_by) values ($1, 'Alicerce', $2) returning id", [o1, U.adm]))[0].id as string;
    co2 = (await rows("insert into companies (org_id, name, created_by) values ($1, 'Solaris', $2) returning id", [o2, U.out]))[0].id as string;
  });

  const insertContact = (user: string, org: string, name: string, extra = "", params: unknown[] = []) =>
    as(user, () => db.query(`insert into contacts (org_id, name, created_by${extra ? ", " + extra.split("=")[0] : ""}) values ($1, $2, $3${extra ? ", $4" : ""})`, [org, name, user, ...params]));

  it("vendedor cria contato e todos da organização o veem", async () => {
    await insertContact(U.sel, o1, "Marcelo Viana");
    const names = await as(U.adm, async () => (await rows("select name from contacts")).map((r) => r.name));
    expect(names).toEqual(["Marcelo Viana"]);
  });
  it("outra organização não enxerga o contato", async () => {
    expect(await as(U.out, async () => (await rows("select * from contacts")).length)).toBe(0);
  });
  it("não cria contato em organização alheia nem em nome de outro usuário", async () => {
    expect(await fails(() => insertContact(U.out, o1, "Invasor"))).toBe(true);
    expect(await fails(() => as(U.sel, () => db.query("insert into contacts (org_id, name, created_by) values ($1, 'Falso', $2)", [o1, U.adm])))).toBe(true);
  });
  it("não vincula contato a empresa de outra organização (FK composta)", async () => {
    expect(await fails(() => insertContact(U.sel, o1, "Cruzado", "company_id=x", [co2]))).toBe(true);
    await insertContact(U.sel, o1, "Da Alicerce", "company_id=x", [co1]);
  });
  it("não define como responsável alguém de fora da organização", async () => {
    expect(await fails(() => insertContact(U.sel, o1, "Dono errado", "owner_id=x", [U.out]))).toBe(true);
    await insertContact(U.sel, o1, "Dono certo", "owner_id=x", [U.mgr]);
  });
  it("e-mail é único por organização, mas pode repetir entre organizações", async () => {
    await insertContact(U.sel, o1, "Com email", "email=x", ["dup@x.com"]);
    expect(await fails(() => insertContact(U.mgr, o1, "Copia", "email=x", ["DUP@x.com"]))).toBe(true);
    await insertContact(U.out, o2, "Outra org", "email=x", ["dup@x.com"]);
  });
  it("vários contatos sem e-mail (NULL) não conflitam", async () => {
    await insertContact(U.sel, o1, "Sem email 1");
    await insertContact(U.sel, o1, "Sem email 2");
    expect((await rows("select count(*)::int as n from contacts where email is null and name like $1", ["Sem email%"]))[0].n).toBe(2);
  });
  it("vendedor edita nome, mas não troca org_id nem created_by", async () => {
    await as(U.sel, () => db.query("update contacts set name = 'Marcelo V.' where name = 'Marcelo Viana'"));
    expect((await rows("select count(*)::int as n from contacts where name = 'Marcelo V.'"))[0].n).toBe(1);
    expect(await fails(() => as(U.sel, () => db.query("update contacts set org_id = $1", [o2])))).toBe(true);
    expect(await fails(() => as(U.sel, () => db.query("update contacts set created_by = $1", [U.adm])))).toBe(true);
  });
  it("updated_at muda ao editar", async () => {
    await db.query("update contacts set updated_at = now() - interval '1 day' where name = 'Marcelo V.'");
    await as(U.sel, () => db.query("update contacts set phone = '11999999999' where name = 'Marcelo V.'"));
    expect((await rows("select updated_at > now() - interval '1 hour' as fresh from contacts where name = 'Marcelo V.'"))[0].fresh).toBe(true);
  });
  it("vendedor não exclui; gerente exclui; ninguém exclui de outra organização", async () => {
    await as(U.sel, () => db.query("delete from contacts where name = 'Dono certo'"));
    expect((await rows("select count(*)::int as n from contacts where name = 'Dono certo'"))[0].n).toBe(1);
    await as(U.out, () => db.query("delete from contacts where name = 'Dono certo'"));
    expect((await rows("select count(*)::int as n from contacts where name = 'Dono certo'"))[0].n).toBe(1);
    await as(U.mgr, () => db.query("delete from contacts where name = 'Dono certo'"));
    expect((await rows("select count(*)::int as n from contacts where name = 'Dono certo'"))[0].n).toBe(0);
  });
  it("ao remover o responsável da organização, o contato fica sem dono (e não é apagado)", async () => {
    await insertContact(U.sel, o1, "Órfão", "owner_id=x", [U.sel]);
    await as(U.adm, () => db.query("delete from memberships where user_id = $1 and org_id = $2", [U.sel, o1]));
    const r = await rows("select owner_id, org_id from contacts where name = 'Órfão'");
    expect(r[0].owner_id).toBeNull();
    expect(r[0].org_id).toBe(o1);
  });
  it("anônimo não lê contatos", async () => {
    expect(await fails(() => as(null, () => rows("select * from contacts")))).toBe(true);
  });
});
