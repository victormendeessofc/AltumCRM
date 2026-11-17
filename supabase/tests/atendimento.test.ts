// @vitest-environment node
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { createDb, emailOf, helpers } from "./harness";

let db: PGlite;
let as: ReturnType<typeof helpers>["as"];
let rows: ReturnType<typeof helpers>["rows"];
let fails: ReturnType<typeof helpers>["fails"];

const V = {
  adm: "00000000-0000-0000-0000-0000000000a1",
  sel: "00000000-0000-0000-0000-0000000000a2",
  out: "00000000-0000-0000-0000-0000000000a3",
};
const KEY = "k".repeat(48);
let x: string;
let y: string;
let chX: string; // canal da organização X (API oficial)
let chY: string;
let contactX: string;

const ingest = (ch: string, phone: string, body: string, ext: string | null = null, name = "Maria", key = KEY) =>
  rows("select public.wa_ingest($1, $2, $3, $4, $5, $6) as id", [key, ch, phone, name, body, ext]);

beforeAll(async () => {
  db = await createDb();
  ({ as, rows, fails } = helpers(db));
  for (const id of Object.values(V)) {
    await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{}')", [id, emailOf(id)]);
  }
  await db.query("select public.set_internal_key($1)", [KEY]);
  x = await as(V.adm, async () => (await rows("select public.create_organization('Org X') as id"))[0].id);
  y = await as(V.out, async () => (await rows("select public.create_organization('Org Y') as id"))[0].id);
  await db.query("insert into memberships (org_id, user_id, role) values ($1, $2, 'seller')", [x, V.sel]);
  contactX = (await rows("insert into contacts (org_id, name, phone, created_by) values ($1, 'Cliente X', '(11) 91234-5678', $2) returning id", [x, V.adm]))[0].id;
  chX = await as(V.adm, async () => (await rows("select public.create_whatsapp_channel($1, 'cloud', 'Vendas', '1234567890', $2::jsonb) as id", [x, JSON.stringify({ access_token: "TOKEN_SECRETO" })]))[0].id);
  chY = await as(V.out, async () => (await rows("select public.create_whatsapp_channel($1, 'qr', 'Y', 'inst-y', '{}'::jsonb) as id", [y]))[0].id);
});

describe("chave interna", () => {
  it("ninguém, nem logado, consegue definir ou testar a chave", async () => {
    expect(await as(V.adm, () => fails(() => db.query("select public.set_internal_key($1)", ["z".repeat(40)])))).toBe(true);
    expect(await as(V.adm, () => fails(() => db.query("select public.internal_ok($1)", [KEY])))).toBe(true);
    expect(await as(null, () => fails(() => db.query("select public.set_internal_key($1)", ["z".repeat(40)])))).toBe(true);
  });
  it("chave curta é recusada", async () => {
    expect(await fails(() => db.query("select public.set_internal_key('curta')"))).toBe(true);
  });
  it("tabela de configuração não é legível", async () => {
    expect(await as(V.adm, () => fails(() => db.query("select * from internal_config")))).toBe(true);
  });
  it("funções de servidor recusam chave errada, mesmo sem login", async () => {
    expect(await as(null, () => fails(() => ingest(chX, "5511999990000", "oi", null, "Maria", "errada")))).toBe(true);
    expect(await as(null, () => fails(() => db.query("select public.wa_channel_for_server('errada', $1)", [chX])))).toBe(true);
  });
});

describe("canais e segredos", () => {
  it("só administrador cria canal", async () => {
    expect(await as(V.sel, () => fails(() => db.query("select public.create_whatsapp_channel($1, 'qr', 'Hack', null, '{}'::jsonb)", [x])))).toBe(true);
    expect(await as(V.out, () => fails(() => db.query("select public.create_whatsapp_channel($1, 'qr', 'Hack', null, '{}'::jsonb)", [x])))).toBe(true);
  });
  it("provedor inválido é recusado", async () => {
    expect(await as(V.adm, () => fails(() => db.query("select public.create_whatsapp_channel($1, 'sms', 'X', null, '{}'::jsonb)", [x])))).toBe(true);
  });
  it("segredos não são legíveis por ninguém", async () => {
    expect(await as(V.adm, () => fails(() => db.query("select * from channel_secrets")))).toBe(true);
    expect(await as(V.sel, () => fails(() => db.query("select * from channel_secrets")))).toBe(true);
  });
  it("admin vê só o nome dos segredos preenchidos e o segredo do webhook", async () => {
    const info = (await as(V.adm, () => rows("select public.channel_setup_info($1) as i", [chX])))[0].i;
    expect(info.configured).toEqual(["access_token"]);
    expect(info.webhook_secret).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(info)).not.toContain("TOKEN_SECRETO");
  });
  it("vendedor e outra organização não leem a configuração", async () => {
    expect(await as(V.sel, () => fails(() => db.query("select public.channel_setup_info($1)", [chX])))).toBe(true);
    expect(await as(V.out, () => fails(() => db.query("select public.channel_setup_info($1)", [chX])))).toBe(true);
  });
  it("salvar segredos: só admin; valor vazio mantém o anterior", async () => {
    expect(await as(V.sel, () => fails(() => db.query("select public.save_channel_secrets($1, '{\"access_token\":\"x\"}'::jsonb)", [chX])))).toBe(true);
    await as(V.adm, () => db.query("select public.save_channel_secrets($1, $2::jsonb)", [chX, JSON.stringify({ app_secret: "APP", access_token: "" })]));
    const srv = (await rows("select public.wa_channel_for_server($1, $2) as c", [KEY, chX]))[0].c;
    expect(srv.secrets.access_token).toBe("TOKEN_SECRETO");
    expect(srv.secrets.app_secret).toBe("APP");
  });
  it("membros veem o canal, outra organização não", async () => {
    expect(await as(V.sel, async () => (await rows("select id from whatsapp_channels")).map((r) => r.id))).toEqual([chX]);
    expect(await as(V.out, async () => (await rows("select id from whatsapp_channels")).map((r) => r.id))).toEqual([chY]);
  });
  it("vendedor não renomeia nem apaga canal", async () => {
    await as(V.sel, () => db.query("update whatsapp_channels set name = 'Hack' where id = $1", [chX]));
    await as(V.sel, () => db.query("delete from whatsapp_channels where id = $1", [chX]));
    expect((await rows("select name from whatsapp_channels where id = $1", [chX]))[0].name).toBe("Vendas");
  });
});

describe("mensagens recebidas", () => {
  let conv: string;
  it("cria a conversa, vincula ao contato pelo telefone e guarda a mensagem", async () => {
    conv = (await ingest(chX, "+55 (11) 91234-5678", "Olá, quero um orçamento", "wamid.1"))[0].id;
    const c = (await rows("select phone, display_name, contact_id, unread_count, status, last_message_preview from conversations where id = $1", [conv]))[0];
    expect(c.phone).toBe("5511912345678");
    expect(c.display_name).toBe("Maria");
    expect(c.contact_id).toBe(contactX);
    expect(c.unread_count).toBe(1);
    expect(c.status).toBe("open");
    expect(c.last_message_preview).toBe("Olá, quero um orçamento");
  });
  it("mensagem repetida (reenvio do webhook) é ignorada", async () => {
    const again = (await ingest(chX, "5511912345678", "Olá, quero um orçamento", "wamid.1"))[0].id;
    expect(again).toBeNull();
    expect((await rows("select count(*)::int n from messages where conversation_id = $1", [conv]))[0].n).toBe(1);
  });
  it("segunda mensagem soma não lidas; número desconhecido não cria contato", async () => {
    await ingest(chX, "5511912345678", "Alguém aí?", "wamid.2");
    expect((await rows("select unread_count from conversations where id = $1", [conv]))[0].unread_count).toBe(2);
    await ingest(chX, "5521988887777", "Oi", "wamid.3", "");
    expect((await rows("select count(*)::int n from contacts where org_id = $1", [x]))[0].n).toBe(1);
  });
  it("telefone e canal inválidos são recusados", async () => {
    expect(await fails(() => ingest(chX, "abc", "x"))).toBe(true);
    expect(await fails(() => ingest("00000000-0000-0000-0000-000000000999", "5511999999999", "x"))).toBe(true);
  });
  it("só membros da organização enxergam a conversa", async () => {
    expect(await as(V.sel, async () => (await rows("select id from conversations")).length)).toBe(2);
    expect(await as(V.out, async () => (await rows("select id from conversations")).length)).toBe(0);
    expect(await as(V.out, async () => (await rows("select id from messages")).length)).toBe(0);
  });
  it("avisa o responsável e reabre conversa encerrada", async () => {
    await as(V.adm, () => db.query("update conversations set assignee_id = $2, status = 'closed' where id = $1", [conv, V.sel]));
    await ingest(chX, "5511912345678", "Voltei!", "wamid.4");
    expect((await rows("select status from conversations where id = $1", [conv]))[0].status).toBe("open");
    const n = await rows("select title, link from notifications where user_id = $1 and kind = 'message_in'", [V.sel]);
    expect(n).toHaveLength(1);
    expect(n[0].link).toBe(`/conversas?c=${conv}`);
  });
  it("membro muda status e responsável, mas não o telefone", async () => {
    await as(V.sel, () => db.query("update conversations set status = 'pending' where id = $1", [conv]));
    expect((await rows("select status from conversations where id = $1", [conv]))[0].status).toBe("pending");
    expect(await as(V.sel, () => fails(() => db.query("update conversations set phone = '5511000000000' where id = $1", [conv])))).toBe(true);
  });
  it("não atribui a alguém de outra organização", async () => {
    expect(await as(V.adm, () => fails(() => db.query("update conversations set assignee_id = $2 where id = $1", [conv, V.out])))).toBe(true);
  });
});

describe("mensagens enviadas", () => {
  let conv: string;
  let msg: string;
  beforeAll(async () => {
    conv = (await rows("select id from conversations where org_id = $1 and phone = '5511912345678'", [x]))[0].id;
  });
  it("membro enfileira mensagem em nome próprio", async () => {
    msg = (await as(V.sel, () => rows("insert into messages (org_id, conversation_id, direction, body, status, sender_id) values ($1, $2, 'out', 'Claro! Segue o orçamento.', 'queued', $3) returning id", [x, conv, V.sel])))[0].id;
    expect(msg).toBeTruthy();
    const c = (await rows("select unread_count, last_message_preview from conversations where id = $1", [conv]))[0];
    expect(c.unread_count).toBe(0);
    expect(c.last_message_preview).toBe("Claro! Segue o orçamento.");
  });
  it("não finge ser cliente, outro remetente nem status já enviado", async () => {
    const ins = (dir: string, status: string, sender: string) => () =>
      db.query("insert into messages (org_id, conversation_id, direction, body, status, sender_id) values ($1, $2, $3, 'x', $4, $5)", [x, conv, dir, status, sender]);
    expect(await as(V.sel, () => fails(ins("in", "queued", V.sel)))).toBe(true);
    expect(await as(V.sel, () => fails(ins("out", "sent", V.sel)))).toBe(true);
    expect(await as(V.sel, () => fails(ins("out", "queued", V.adm)))).toBe(true);
  });
  it("outra organização não escreve na conversa", async () => {
    expect(await as(V.out, () => fails(() => db.query("insert into messages (org_id, conversation_id, direction, body, status, sender_id) values ($1, $2, 'out', 'x', 'queued', $3)", [x, conv, V.out])))).toBe(true);
    expect(await as(V.out, () => fails(() => db.query("insert into messages (org_id, conversation_id, direction, body, status, sender_id) values ($1, $2, 'out', 'x', 'queued', $3)", [y, conv, V.out])))).toBe(true);
  });
  it("ninguém edita ou apaga mensagens", async () => {
    expect(await as(V.sel, () => fails(() => db.query("update messages set body = 'adulterada' where id = $1", [msg])))).toBe(true);
    expect(await as(V.adm, () => fails(() => db.query("delete from messages where id = $1", [msg])))).toBe(true);
    expect((await rows("select body from messages where id = $1", [msg]))[0].body).toBe("Claro! Segue o orçamento.");
  });
  it("o servidor lê a mensagem da fila e registra o resultado", async () => {
    const p = (await rows("select public.wa_message_for_send($1, $2) as p", [KEY, msg]))[0].p;
    expect(p.body).toBe("Claro! Segue o orçamento.");
    expect(p.phone).toBe("5511912345678");
    expect(p.channel.provider).toBe("cloud");
    expect(p.channel.secrets.access_token).toBe("TOKEN_SECRETO");
    await rows("select public.wa_message_result($1, $2, 'sent', 'wamid.out1', null)", [KEY, msg]);
    expect((await rows("select status, external_id from messages where id = $1", [msg]))[0]).toEqual({ status: "sent", external_id: "wamid.out1" });
    // já não está mais na fila
    expect((await rows("select public.wa_message_for_send($1, $2) as p", [KEY, msg]))[0].p).toBeNull();
  });
  it("status de entrega só avança", async () => {
    await rows("select public.wa_message_status($1, $2, 'wamid.out1', 'read')", [KEY, chX]);
    await rows("select public.wa_message_status($1, $2, 'wamid.out1', 'delivered')", [KEY, chX]);
    expect((await rows("select status from messages where id = $1", [msg]))[0].status).toBe("read");
  });
  it("falha de envio guarda o motivo", async () => {
    const m2 = (await as(V.sel, () => rows("insert into messages (org_id, conversation_id, direction, body, status, sender_id) values ($1, $2, 'out', 'Teste', 'queued', $3) returning id", [x, conv, V.sel])))[0].id;
    await rows("select public.wa_message_result($1, $2, 'failed', null, 'Fora da janela de 24h')", [KEY, m2]);
    expect((await rows("select status, error from messages where id = $1", [m2]))[0]).toEqual({ status: "failed", error: "Fora da janela de 24h" });
  });
});

describe("iniciar conversa e status do canal", () => {
  it("membro inicia conversa e vira o responsável; repetir reaproveita", async () => {
    const id1 = (await as(V.sel, () => rows("select public.start_conversation($1, '(11) 95555-4444', 'Novo Lead', $2) as id", [chX, contactX])))[0].id;
    const id2 = (await as(V.sel, () => rows("select public.start_conversation($1, '11 95555-4444') as id", [chX])))[0].id;
    expect(id2).toBe(id1);
    const c = (await rows("select assignee_id, phone, contact_id from conversations where id = $1", [id1]))[0];
    expect(c).toEqual({ assignee_id: V.sel, phone: "11955554444", contact_id: contactX });
  });
  it("outra organização não inicia conversa no canal", async () => {
    expect(await as(V.out, () => fails(() => db.query("select public.start_conversation($1, '5511900000000')", [chX])))).toBe(true);
  });
  it("não vincula contato de outra organização", async () => {
    const other = (await rows("insert into contacts (org_id, name, created_by) values ($1, 'Cliente Y', $2) returning id", [y, V.out]))[0].id;
    expect(await as(V.sel, () => fails(() => db.query("select public.start_conversation($1, '5511933332222', 'X', $2)", [chX, other])))).toBe(true);
  });
  it("servidor atualiza o status do canal; membros leem", async () => {
    await rows("select public.wa_set_channel_status($1, $2, 'connected', null, '+55 11 90000-1111')", [KEY, chX]);
    const c = await as(V.sel, () => rows("select status, phone from whatsapp_channels where id = $1", [chX]));
    expect(c[0]).toEqual({ status: "connected", phone: "5511900001111" });
  });
});

describe("suporte interno (chamados)", () => {
  let t: string;
  it("membro abre chamado em nome próprio, não de outro", async () => {
    t = (await as(V.sel, () => rows("insert into tickets (org_id, title, body, requester_id) values ($1, 'Erro ao exportar', 'Detalhes', $2) returning id", [x, V.sel])))[0].id;
    expect(t).toBeTruthy();
    expect(await as(V.sel, () => fails(() => db.query("insert into tickets (org_id, title, requester_id) values ($1, 'Falso', $2)", [x, V.adm])))).toBe(true);
  });
  it("outra organização não vê nem abre chamado na nossa", async () => {
    expect(await as(V.out, async () => (await rows("select id from tickets")).length)).toBe(0);
    expect(await as(V.out, () => fails(() => db.query("insert into tickets (org_id, title, requester_id) values ($1, 'Invasão', $2)", [x, V.out])))).toBe(true);
  });
  it("resolver preenche a data; reabrir limpa", async () => {
    await as(V.adm, () => db.query("update tickets set status = 'resolved' where id = $1", [t]));
    expect((await rows("select resolved_at is not null as r from tickets where id = $1", [t]))[0].r).toBe(true);
    await as(V.adm, () => db.query("update tickets set status = 'open' where id = $1", [t]));
    expect((await rows("select resolved_at from tickets where id = $1", [t]))[0].resolved_at).toBeNull();
  });
  it("vendedor não mexe em chamado de outra pessoa", async () => {
    const other = (await as(V.adm, () => rows("insert into tickets (org_id, title, requester_id) values ($1, 'Do admin', $2) returning id", [x, V.adm])))[0].id;
    await as(V.sel, () => db.query("update tickets set status = 'resolved' where id = $1", [other]));
    await as(V.sel, () => db.query("delete from tickets where id = $1", [other]));
    expect((await rows("select status from tickets where id = $1", [other]))[0].status).toBe("open");
  });
  it("atribuir avisa o responsável", async () => {
    await as(V.adm, () => db.query("update tickets set assignee_id = $2 where id = $1", [t, V.sel]));
    expect((await rows("select count(*)::int n from notifications where user_id = $1 and kind = 'ticket_assigned'", [V.sel]))[0].n).toBe(1);
  });
  it("comentários: membros comentam em nome próprio; outra organização não", async () => {
    await as(V.sel, () => db.query("insert into ticket_comments (org_id, ticket_id, body, author_id) values ($1, $2, 'Já olhei', $3)", [x, t, V.sel]));
    expect(await as(V.sel, () => fails(() => db.query("insert into ticket_comments (org_id, ticket_id, body, author_id) values ($1, $2, 'x', $3)", [x, t, V.adm])))).toBe(true);
    expect(await as(V.out, () => fails(() => db.query("insert into ticket_comments (org_id, ticket_id, body, author_id) values ($1, $2, 'x', $3)", [x, t, V.out])))).toBe(true);
    expect(await as(V.out, async () => (await rows("select id from ticket_comments")).length)).toBe(0);
  });
});

describe("auditoria", () => {
  it("registra criação de canal e chamado, sem guardar valores", async () => {
    const a = await rows("select table_name, op, changed from audit_log where org_id = $1 and table_name in ('whatsapp_channels', 'tickets')", [x]);
    expect(a.some((r) => r.table_name === "whatsapp_channels" && r.op === "INSERT")).toBe(true);
    expect(a.some((r) => r.table_name === "tickets" && r.op === "INSERT")).toBe(true);
    expect(JSON.stringify(a)).not.toContain("TOKEN_SECRETO");
  });
});
