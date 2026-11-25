// @vitest-environment node
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { createDb, emailOf, helpers } from "./harness";

let db: PGlite;
let as: ReturnType<typeof helpers>["as"];
let rows: ReturnType<typeof helpers>["rows"];
let fails: ReturnType<typeof helpers>["fails"];

const V = { a: "00000000-0000-0000-0000-0000000000c1", b: "00000000-0000-0000-0000-0000000000c2" };
const KEY = "m".repeat(48);
let x: string;
let y: string;

const channel = (user: string, org: string, provider: string, ext: string | null) =>
  as(user, async () => (await rows("select public.create_whatsapp_channel($1, $2, 'Canal', $3, '{}'::jsonb) as id", [org, provider, ext]))[0].id as string);

beforeAll(async () => {
  db = await createDb();
  ({ as, rows, fails } = helpers(db));
  for (const id of Object.values(V)) await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{}')", [id, emailOf(id)]);
  await db.query("select public.set_internal_key($1)", [KEY]);
  x = await as(V.a, async () => (await rows("select public.create_organization('Org X') as id"))[0].id);
  y = await as(V.b, async () => (await rows("select public.create_organization('Org Y') as id"))[0].id);
});

describe("WhatsApp pelo app da Agência", () => {
  it("o mesmo número da API oficial não pode ser ligado a duas organizações", async () => {
    await channel(V.a, x, "cloud", "111222333");
    expect(await fails(() => channel(V.b, y, "cloud", "111222333"))).toBe(true);
    expect(await fails(() => channel(V.a, x, "cloud", "111222333"))).toBe(true);
  });

  it("canais de QR Code não entram na regra", async () => {
    await channel(V.a, x, "qr", "inst-1");
    await channel(V.b, y, "qr", "inst-2");
  });

  it("motivo de falha avisado depois: grava só em mensagem que falhou, e só com a chave interna", async () => {
    const ch = (await rows("select id from whatsapp_channels where external_id = '111222333'"))[0].id;
    const conv = (await rows("insert into conversations (org_id, channel_id, phone) values ($1, $2, '5511900000000') returning id", [x, ch]))[0].id;
    const ok = (await rows("insert into messages (org_id, conversation_id, direction, body, status, external_id) values ($1, $2, 'out', 'oi', 'sent', 'w-ok') returning id", [x, conv]))[0].id;
    const bad = (await rows("insert into messages (org_id, conversation_id, direction, body, status, external_id) values ($1, $2, 'out', 'oi', 'failed', 'w-bad') returning id", [x, conv]))[0].id;
    await as(null, () => rows("select public.wa_message_error($1, $2, 'w-bad', 'Não entregue (código 131026)')", [KEY, ch]));
    await as(null, () => rows("select public.wa_message_error($1, $2, 'w-ok', 'não deveria gravar')", [KEY, ch]));
    expect((await rows("select error from messages where id = $1", [bad]))[0].error).toBe("Não entregue (código 131026)");
    expect((await rows("select error from messages where id = $1", [ok]))[0].error).toBeNull();
    expect(await as(null, () => fails(() => rows("select public.wa_message_error('errada', $1, 'w-bad', 'x')", [ch])))).toBe(true);
  });

  it("o webhook único acha o canal pelo phone_number_id, só com a chave interna", async () => {
    const r = await as(null, () => rows("select public.wa_channel_by_number($1, '111222333') as id", [KEY]));
    expect(r[0].id).toBeTruthy();
    const none = await as(null, () => rows("select public.wa_channel_by_number($1, '999') as id", [KEY]));
    expect(none[0].id).toBeNull();
    expect(await as(null, () => fails(() => rows("select public.wa_channel_by_number('errada', '111222333')")))).toBe(true);
  });
});
