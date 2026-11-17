// @vitest-environment node
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { createDb, emailOf, helpers } from "./harness";

let db: PGlite;
let as: ReturnType<typeof helpers>["as"];
let rows: ReturnType<typeof helpers>["rows"];

const V = {
  adm: "00000000-0000-0000-0000-0000000000b1",
  sel: "00000000-0000-0000-0000-0000000000b2",
  out: "00000000-0000-0000-0000-0000000000b3",
};
const KEY = "k".repeat(48);
let x: string;
let y: string;
let st: Record<string, string>;
let ch: string;

const stagesOf = async (org: string) => {
  const r = await rows("select s.id, s.name from stages s join pipelines p on p.id = s.pipeline_id where s.org_id = $1", [org]);
  return Object.fromEntries(r.map((s) => [s.name as string, s.id as string]));
};
const deal = async (org: string, stage: string, title: string, value: number, owner: string | null, extra: { source?: string; lost?: string; createdDaysAgo?: number; closedDaysAgo?: number } = {}) => {
  const pipe = (await rows("select pipeline_id from stages where id = $1", [stage]))[0].pipeline_id;
  let contact: string | null = null;
  if (extra.source) contact = (await rows("insert into contacts (org_id, name, source, created_by) values ($1, $2, $3, $4) returning id", [org, "C " + title, extra.source, V.adm]))[0].id;
  const id = (await rows("insert into deals (org_id, pipeline_id, stage_id, title, value, owner_id, contact_id, lost_reason, created_by) values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id", [org, pipe, stage, title, value, owner, contact, extra.lost ?? null, V.adm]))[0].id;
  if (extra.createdDaysAgo !== undefined) await db.query("update deals set created_at = now() - make_interval(days => $2) where id = $1", [id, extra.createdDaysAgo]);
  if (extra.closedDaysAgo !== undefined) await db.query("update deals set closed_at = now() - make_interval(days => $2) where id = $1", [id, extra.closedDaysAgo]);
  return id;
};
const overview = (user: string, org: string, days = 90) => as(user, async () => (await rows("select public.analytics_overview($1, $2) as o", [org, days]))[0].o);

beforeAll(async () => {
  db = await createDb();
  ({ as, rows } = helpers(db));
  for (const id of Object.values(V)) {
    await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{}')", [id, emailOf(id)]);
  }
  await db.query("select public.set_internal_key($1)", [KEY]);
  x = await as(V.adm, async () => (await rows("select public.create_organization('Org X') as id"))[0].id);
  y = await as(V.out, async () => (await rows("select public.create_organization('Org Y') as id"))[0].id);
  await db.query("insert into memberships (org_id, user_id, role) values ($1, $2, 'seller')", [x, V.sel]);
  st = await stagesOf(x);

  // Org X: 2 ganhos (adm 1000 e 3000; ciclo 10 e 20 dias), 1 ganho antigo (fora de 30 dias), 1 perdido, 2 abertos
  await deal(x, st["Ganho"], "G1", 1000, V.adm, { source: "Instagram", createdDaysAgo: 12, closedDaysAgo: 2 });
  await deal(x, st["Ganho"], "G2", 3000, V.sel, { source: "Indicação", createdDaysAgo: 25, closedDaysAgo: 5 });
  await deal(x, st["Ganho"], "G-antigo", 9999, V.adm, { createdDaysAgo: 200, closedDaysAgo: 150 });
  await deal(x, st["Perdido"], "P1", 500, V.sel, { lost: "Preço", source: "Instagram", createdDaysAgo: 20, closedDaysAgo: 3 });
  await deal(x, st["Proposta"], "A1", 2000, V.adm);
  await deal(x, st["Negociação"], "A2", 4000, V.sel);
  await deal(y, (await stagesOf(y))["Ganho"], "Y-ganho", 777777, V.out);

  // atendimento
  ch = await as(V.adm, async () => (await rows("select public.create_whatsapp_channel($1, 'qr', 'Canal', 'i', '{}'::jsonb) as id", [x]))[0].id);
  const conv = (await rows("select public.wa_ingest($1, $2, '5511999990000', 'Ana', 'Oi', 'w1') as id", [KEY, ch]))[0].id;
  await db.query("update messages set created_at = now() - interval '10 minutes' where conversation_id = $1", [conv]);
  await as(V.sel, () => db.query("insert into messages (org_id, conversation_id, direction, body, status, sender_id) values ($1, $2, 'out', 'Olá!', 'queued', $3)", [x, conv, V.sel]));
  await db.query("update messages set created_at = now() - interval '4 minutes' where conversation_id = $1 and direction = 'out'", [conv]);
  await as(V.sel, () => db.query("insert into tickets (org_id, title, requester_id) values ($1, 'Chamado', $2)", [x, V.sel]));
});

describe("analytics_overview", () => {
  it("fechamentos do período (30 dias) ignoram o que é antigo", async () => {
    const o = await overview(V.adm, x, 30);
    expect(o.won_count).toBe(2);
    expect(Number(o.won_value)).toBe(4000);
    expect(o.lost_count).toBe(1);
    expect(Number(o.lost_value)).toBe(500);
    expect(Number(o.win_rate)).toBeCloseTo(66.7, 1);
    expect(Number(o.avg_deal_value)).toBe(2000);
    expect(Number(o.avg_cycle_days)).toBeCloseTo(15, 0); // (10 + 20) / 2
  });
  it("período maior inclui o ganho antigo", async () => {
    const o = await overview(V.adm, x, 365);
    expect(o.won_count).toBe(3);
    expect(Number(o.won_value)).toBe(13999);
  });
  it("funil aberto: contagem, valor e ponderado", async () => {
    const o = await overview(V.adm, x, 30);
    expect(o.open_count).toBe(2);
    expect(Number(o.open_value)).toBe(6000);
    expect(Number(o.open_weighted)).toBe(2000 * 0.5 + 4000 * 0.75);
    const prop = o.stages.find((s: { name: string }) => s.name === "Proposta");
    expect(prop.count).toBe(1);
    expect(o.stages.map((s: { name: string }) => s.name)).toEqual(["Prospecção", "Qualificação", "Proposta", "Negociação"]);
  });
  it("receita por mês devolve 6 meses e soma o que foi ganho", async () => {
    const o = await overview(V.adm, x, 30);
    expect(o.by_month).toHaveLength(6);
    const total = o.by_month.reduce((s: number, m: { value: number }) => s + Number(m.value), 0);
    expect(total).toBe(13999); // inclui o ganho de 150 dias atrás (dentro dos 6 meses)
  });
  it("ranking por responsável", async () => {
    const o = await overview(V.adm, x, 30);
    const a = o.by_owner.find((r: { owner_id: string }) => r.owner_id === V.adm);
    const s = o.by_owner.find((r: { owner_id: string }) => r.owner_id === V.sel);
    expect(Number(a.won_value)).toBe(1000);
    expect(Number(s.won_value)).toBe(3000);
    expect(s.lost_count).toBe(1);
    expect(o.by_owner[0].owner_id).toBe(V.sel); // maior valor primeiro
  });
  it("motivos de perda e origem dos negócios", async () => {
    const o = await overview(V.adm, x, 30);
    expect(o.lost_reasons).toEqual([{ reason: "Preço", count: 1 }]);
    const insta = o.by_source.find((r: { source: string }) => r.source === "Instagram");
    expect(insta.won_count).toBe(1);
    expect(insta.created).toBe(2);
    expect(o.by_source[0].source).toBe("Indicação"); // maior valor ganho
  });
  it("atendimento: conversas, mensagens e tempo da primeira resposta", async () => {
    const o = await overview(V.adm, x, 30);
    expect(o.atendimento.conversations_open).toBe(1);
    expect(o.atendimento.conversations_new).toBe(1);
    expect(o.atendimento.messages_in).toBe(1);
    expect(o.atendimento.messages_out).toBe(1);
    expect(o.atendimento.answered_conversations).toBe(1);
    expect(Number(o.atendimento.avg_first_response_seconds)).toBeCloseTo(360, -1); // 6 minutos
    expect(o.atendimento.tickets_open).toBe(1);
  });
  it("outra organização não enxerga nada da nossa (RLS)", async () => {
    const o = await overview(V.out, x, 365);
    expect(o.won_count).toBe(0);
    expect(o.open_count).toBe(0);
    expect(o.by_owner).toEqual([]);
    expect(o.atendimento.messages_in).toBe(0);
    expect(o.win_rate).toBeNull();
  });
  it("organização vazia devolve zeros e nulos, sem erro", async () => {
    const e = await as(V.out, async () => (await rows("select public.create_organization('Vazia') as id"))[0].id);
    const o = await overview(V.out, e, 30);
    expect(o.won_count).toBe(0);
    expect(o.win_rate).toBeNull();
    expect(o.avg_cycle_days).toBeNull();
    expect(o.atendimento.avg_first_response_seconds).toBeNull();
  });
  it("período fora do intervalo é ajustado (1 a 730 dias)", async () => {
    expect((await overview(V.adm, x, 0)).days).toBe(1);
    expect((await overview(V.adm, x, 99999)).days).toBe(730);
  });
});
