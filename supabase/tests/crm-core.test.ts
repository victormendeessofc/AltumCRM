// @vitest-environment node
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { createDb, emailOf, helpers } from "./harness";

let db: PGlite;
let as: ReturnType<typeof helpers>["as"];
let rows: ReturnType<typeof helpers>["rows"];
let fails: ReturnType<typeof helpers>["fails"];

const V = {
  adm: "00000000-0000-0000-0000-0000000000f1",
  mgr: "00000000-0000-0000-0000-0000000000f2",
  sel: "00000000-0000-0000-0000-0000000000f3",
  out: "00000000-0000-0000-0000-0000000000f4",
};
let x: string; // organização X (admin, gerente, vendedor)
let y: string; // organização Y (outra empresa)
let pipeX: string;
let pipeY: string;
let st: Record<string, string> = {};
let stY: Record<string, string> = {};
let contactX: string;
let contactY: string;

const stagesOf = async (pipe: string) => {
  const r = await rows("select id, name from stages where pipeline_id = $1", [pipe]);
  return Object.fromEntries(r.map((s) => [s.name as string, s.id as string]));
};

async function newDeal(user: string, org: string, pipe: string, stage: string, title: string, value = 1000, extraCol = "", extraVal: unknown[] = []) {
  const cols = `org_id, pipeline_id, stage_id, title, value, created_by${extraCol ? ", " + extraCol : ""}`;
  const marks = ["$1", "$2", "$3", "$4", "$5", "$6", ...extraVal.map((_, i) => "$" + (i + 7))].join(", ");
  const r = await as(user, () => rows(`insert into deals (${cols}) values (${marks}) returning id`, [org, pipe, stage, title, value, user, ...extraVal]));
  return r[0].id as string;
}

beforeAll(async () => {
  db = await createDb();
  ({ as, rows, fails } = helpers(db));
  for (const id of Object.values(V)) {
    await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{}')", [id, emailOf(id)]);
  }
  x = await as(V.adm, async () => (await rows("select public.create_organization('Org X') as id"))[0].id);
  y = await as(V.out, async () => (await rows("select public.create_organization('Org Y') as id"))[0].id);
  await db.query("insert into memberships (org_id, user_id, role) values ($1, $2, 'manager'), ($1, $3, 'seller')", [x, V.mgr, V.sel]);
  pipeX = (await rows("select id from pipelines where org_id = $1", [x]))[0].id;
  pipeY = (await rows("select id from pipelines where org_id = $1", [y]))[0].id;
  st = await stagesOf(pipeX);
  stY = await stagesOf(pipeY);
  contactX = (await rows("insert into contacts (org_id, name, created_by) values ($1, 'Cliente X', $2) returning id", [x, V.adm]))[0].id;
  contactY = (await rows("insert into contacts (org_id, name, created_by) values ($1, 'Cliente Y', $2) returning id", [y, V.out]))[0].id;
});

describe("funis e etapas", () => {
  it("organização nova nasce com funil e 6 etapas", async () => {
    expect(Object.keys(st).sort()).toEqual(["Ganho", "Negociação", "Perdido", "Proposta", "Prospecção", "Qualificação"]);
    expect((await rows("select count(*)::int n from stages where pipeline_id = $1 and kind = 'won'", [pipeX]))[0].n).toBe(1);
    expect((await rows("select count(*)::int n from stages where pipeline_id = $1 and kind = 'lost'", [pipeX]))[0].n).toBe(1);
  });
  it("todos leem o funil, só admin edita funis e etapas", async () => {
    expect(await as(V.sel, async () => (await rows("select id from stages")).length)).toBe(6);
    await as(V.sel, () => db.query("update stages set name = 'Hack' where pipeline_id = $1", [pipeX]));
    await as(V.mgr, () => db.query("update pipelines set name = 'Hack' where id = $1", [pipeX]));
    expect((await rows("select name from pipelines where id = $1", [pipeX]))[0].name).toBe("Vendas");
    expect((await rows("select count(*)::int n from stages where name = 'Hack'"))[0].n).toBe(0);
    await as(V.adm, () => db.query("update stages set probability = 30 where id = $1", [st["Qualificação"]]));
    expect((await rows("select probability from stages where id = $1", [st["Qualificação"]]))[0].probability).toBe(30);
    await as(V.adm, () => db.query("update stages set probability = 25 where id = $1", [st["Qualificação"]]));
  });
  it("admin cria funil novo com etapas padrão; gerente e vendedor não", async () => {
    const id = await as(V.adm, async () => (await rows("select public.create_pipeline($1, 'Renovações') as id", [x]))[0].id);
    expect((await rows("select count(*)::int n from stages where pipeline_id = $1", [id]))[0].n).toBe(6);
    expect((await rows("select position from pipelines where id = $1", [id]))[0].position).toBe(1);
    expect(await fails(() => as(V.mgr, () => db.query("select public.create_pipeline($1, 'X')", [x])))).toBe(true);
    expect(await fails(() => as(V.out, () => db.query("select public.create_pipeline($1, 'X')", [x])))).toBe(true);
    await as(V.adm, () => db.query("delete from pipelines where id = $1", [id]));
  });
  it("etapas têm posições espaçadas para permitir inserir novas", async () => {
    const pos = (await rows("select position from stages where pipeline_id = $1 order by position", [pipeX])).map((r) => r.position);
    expect(pos).toEqual([0, 10, 20, 30, 40, 50]);
  });
  it("não vê funis de outra organização", async () => {
    expect(await as(V.out, async () => (await rows("select id from pipelines")).map((r) => r.id))).toEqual([pipeY]);
  });
});

describe("negócios", () => {
  it("vendedor cria negócio, mas created_by tem de ser ele mesmo", async () => {
    await newDeal(V.sel, x, pipeX, st["Prospecção"], "Neg 1");
    expect(
      await fails(() => as(V.sel, () => db.query("insert into deals (org_id, pipeline_id, stage_id, title, created_by) values ($1,$2,$3,'Fraude',$4)", [x, pipeX, st["Prospecção"], V.adm]))),
    ).toBe(true);
  });
  it("não aceita etapa de outro funil, org alheia nem contato de outra organização", async () => {
    expect(await fails(() => newDeal(V.sel, x, pipeX, stY["Prospecção"], "Etapa alheia"))).toBe(true);
    expect(await fails(() => newDeal(V.sel, y, pipeY, stY["Prospecção"], "Org alheia"))).toBe(true);
    expect(await fails(() => newDeal(V.sel, x, pipeX, st["Prospecção"], "Contato alheio", 1, "contact_id", [contactY]))).toBe(true);
    await newDeal(V.sel, x, pipeX, st["Prospecção"], "Contato ok", 1, "contact_id", [contactX]);
  });
  it("não define responsável de fora da organização", async () => {
    expect(await fails(() => newDeal(V.sel, x, pipeX, st["Prospecção"], "Dono errado", 1, "owner_id", [V.out]))).toBe(true);
  });
  it("ganhar fecha o negócio e registra atividade; reabrir limpa o fechamento", async () => {
    const id = await newDeal(V.sel, x, pipeX, st["Negociação"], "Fechar", 5000, "owner_id", [V.sel]);
    await as(V.sel, () => db.query("update deals set stage_id = $1 where id = $2", [st["Ganho"], id]));
    expect((await rows("select closed_at is not null as c from deals where id = $1", [id]))[0].c).toBe(true);
    expect((await rows("select kind from activities where deal_id = $1", [id])).map((r) => r.kind)).toEqual(["won"]);
    await as(V.sel, () => db.query("update deals set stage_id = $1 where id = $2", [st["Proposta"], id]));
    expect((await rows("select closed_at is null as o from deals where id = $1", [id]))[0].o).toBe(true);
  });
  it("motivo de perda só permanece em negócios perdidos", async () => {
    const id = await newDeal(V.sel, x, pipeX, st["Proposta"], "Perder", 100);
    await as(V.sel, () => db.query("update deals set stage_id = $1, lost_reason = 'Preço' where id = $2", [st["Perdido"], id]));
    expect((await rows("select lost_reason from deals where id = $1", [id]))[0].lost_reason).toBe("Preço");
    expect((await rows("select body from activities where deal_id = $1 and kind = 'lost'", [id]))[0].body).toBe("Preço");
    await as(V.sel, () => db.query("update deals set stage_id = $1 where id = $2", [st["Proposta"], id]));
    expect((await rows("select lost_reason from deals where id = $1", [id]))[0].lost_reason).toBeNull();
  });
  it("vendedor não forja atividade de ganho, mas registra nota; outra org não vê", async () => {
    const id = await newDeal(V.sel, x, pipeX, st["Prospecção"], "Notas");
    expect(await fails(() => as(V.sel, () => db.query("insert into activities (org_id, deal_id, kind, actor_id) values ($1,$2,'won',$3)", [x, id, V.sel])))).toBe(true);
    await as(V.sel, () => db.query("insert into activities (org_id, deal_id, kind, body, actor_id) values ($1,$2,'note','Ligar amanhã',$3)", [x, id, V.sel]));
    expect(await as(V.out, async () => (await rows("select * from activities")).length)).toBe(0);
  });
  it("vendedor não exclui; gerente exclui", async () => {
    const id = await newDeal(V.sel, x, pipeX, st["Prospecção"], "Excluir");
    await as(V.sel, () => db.query("delete from deals where id = $1", [id]));
    expect((await rows("select count(*)::int n from deals where id = $1", [id]))[0].n).toBe(1);
    await as(V.mgr, () => db.query("delete from deals where id = $1", [id]));
    expect((await rows("select count(*)::int n from deals where id = $1", [id]))[0].n).toBe(0);
  });
  it("não apaga etapa nem funil que têm negócios", async () => {
    expect(await fails(() => as(V.adm, () => db.query("delete from stages where id = $1", [st["Prospecção"]])))).toBe(true);
    expect(await fails(() => as(V.adm, () => db.query("delete from pipelines where id = $1", [pipeX])))).toBe(true);
  });
});

describe("tarefas", () => {
  it("responsável precisa ser membro da organização", async () => {
    expect(await fails(() => as(V.sel, () => db.query("insert into tasks (org_id, title, assignee_id, created_by) values ($1,'x',$2,$3)", [x, V.out, V.sel])))).toBe(true);
  });
  it("vendedor só apaga tarefas próprias ou atribuídas a ele", async () => {
    await as(V.adm, () => db.query("insert into tasks (org_id, title, created_by) values ($1,'Do admin',$2)", [x, V.adm]));
    await as(V.sel, () => db.query("delete from tasks where title = 'Do admin'"));
    expect((await rows("select count(*)::int n from tasks where title = 'Do admin'"))[0].n).toBe(1);
    await as(V.sel, () => db.query("insert into tasks (org_id, title, created_by) values ($1,'Minha',$2)", [x, V.sel]));
    await as(V.sel, () => db.query("delete from tasks where title = 'Minha'"));
    expect((await rows("select count(*)::int n from tasks where title = 'Minha'"))[0].n).toBe(0);
  });
  it("só vincula a contato da mesma organização", async () => {
    expect(await fails(() => as(V.sel, () => db.query("insert into tasks (org_id, title, contact_id, created_by) values ($1,'x',$2,$3)", [x, contactY, V.sel])))).toBe(true);
  });
});

describe("notificações", () => {
  it("avisa quem recebe negócio/tarefa de outra pessoa, e não a si mesmo", async () => {
    await newDeal(V.adm, x, pipeX, st["Prospecção"], "Para o vendedor", 1, "owner_id", [V.sel]);
    await newDeal(V.sel, x, pipeX, st["Prospecção"], "Para mim", 1, "owner_id", [V.sel]);
    await as(V.adm, () => db.query("insert into tasks (org_id, title, assignee_id, created_by) values ($1,'Ligar',$2,$3)", [x, V.sel, V.adm]));
    const kinds = await as(V.sel, async () => (await rows("select kind from notifications")).map((r) => r.kind));
    expect(kinds.filter((k) => k === "deal_assigned")).toHaveLength(1);
    expect(kinds).toContain("task_assigned");
    expect(await as(V.mgr, async () => (await rows("select * from notifications")).length)).toBe(0);
  });
  it("são privadas: só o dono lê e marca como lida", async () => {
    const n = await as(V.sel, async () => (await rows("select id from notifications limit 1"))[0].id);
    await as(V.mgr, () => db.query("update notifications set read_at = now() where id = $1", [n]));
    expect((await rows("select read_at from notifications where id = $1", [n]))[0].read_at).toBeNull();
    await as(V.sel, () => db.query("update notifications set read_at = now() where id = $1", [n]));
    expect((await rows("select read_at is not null as r from notifications where id = $1", [n]))[0].r).toBe(true);
  });
  it("não permite criar notificação direto", async () => {
    expect(await fails(() => as(V.sel, () => db.query("insert into notifications (org_id, user_id, kind, title) values ($1,$2,'x','x')", [x, V.mgr])))).toBe(true);
  });
});

describe("auditoria", () => {
  it("só admin lê; guarda nomes dos campos e nunca os valores", async () => {
    const id = await newDeal(V.sel, x, pipeX, st["Prospecção"], "Auditado", 777);
    await as(V.sel, () => db.query("update deals set title = 'Segredo Pessoal', value = 888 where id = $1", [id]));
    expect(await as(V.sel, async () => (await rows("select * from audit_log")).length)).toBe(0);
    const all = await as(V.adm, () => rows("select op, changed from audit_log where row_key = $1 order by id", [id]));
    expect(all.map((r) => r.op)).toEqual(["INSERT", "UPDATE"]);
    expect(all[1].changed).toEqual(["title", "value"]);
    expect(JSON.stringify(all)).not.toContain("Segredo Pessoal");
  });
  it("outra organização não vê o log", async () => {
    expect(await as(V.out, async () => (await rows("select * from audit_log where org_id = $1", [x])).length)).toBe(0);
  });
  it("ninguém grava nem apaga no log", async () => {
    expect(await fails(() => as(V.adm, () => db.query("insert into audit_log (org_id, table_name, op) values ($1,'x','x')", [x])))).toBe(true);
    expect(await fails(() => as(V.adm, () => db.query("delete from audit_log")))).toBe(true);
  });
});

describe("indicadores da Central", () => {
  it("somam certo", async () => {
    await db.query("delete from deals where org_id = $1", [x]);
    await db.query("update organizations set monthly_goal = 10000 where id = $1", [x]);
    await newDeal(V.sel, x, pipeX, st["Proposta"], "A", 1000);
    await newDeal(V.sel, x, pipeX, st["Negociação"], "B", 2000);
    const w = await newDeal(V.sel, x, pipeX, st["Negociação"], "C", 4000);
    await as(V.sel, () => db.query("update deals set stage_id = $1 where id = $2", [st["Ganho"], w]));
    const old = await newDeal(V.sel, x, pipeX, st["Prospecção"], "Parado", 500);
    await db.query("update deals set stage_changed_at = now() - interval '10 days' where id = $1", [old]);
    const s = await as(V.mgr, async () => (await rows("select public.dashboard_stats($1) as s", [x]))[0].s);
    expect(Number(s.open_count)).toBe(3);
    expect(Number(s.open_value)).toBe(3500);
    expect(Number(s.weighted_value)).toBeCloseTo(1000 * 0.5 + 2000 * 0.75 + 500 * 0.1, 2);
    expect(Number(s.won_month_value)).toBe(4000);
    expect(Number(s.goal)).toBe(10000);
    expect(Number(s.stalled_count)).toBe(1);
    expect(s.by_stage.map((b: { name: string }) => b.name)).toEqual(["Prospecção", "Qualificação", "Proposta", "Negociação", "Ganho"]);
  });
  it("outra organização enxerga zeros", async () => {
    const s = await as(V.out, async () => (await rows("select public.dashboard_stats($1) as s", [x]))[0].s);
    expect(Number(s.open_count)).toBe(0);
    expect(Number(s.won_month_value)).toBe(0);
  });
});

describe("exclusão da organização", () => {
  it("só admin exclui, e tudo some em cascata", async () => {
    await as(V.mgr, () => db.query("delete from organizations where id = $1", [x]));
    expect((await rows("select count(*)::int n from organizations where id = $1", [x]))[0].n).toBe(1);
    await as(V.adm, () => db.query("delete from organizations where id = $1", [x]));
    for (const t of ["deals", "tasks", "contacts", "pipelines", "stages", "activities", "audit_log", "notifications"]) {
      expect((await rows(`select count(*)::int n from ${t} where org_id = $1`, [x]))[0].n).toBe(0);
    }
  });
});
