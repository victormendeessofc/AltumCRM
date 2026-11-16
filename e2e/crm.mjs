// Fluxo do núcleo do CRM: meta, funis, negócios (arrastar, ganhar, perder), tarefas, Central,
// busca global, notificações, perfil, auditoria e exclusão da organização.
// Exige as 4 migrações aplicadas no Supabase.
import { BASE, done, inviteAndJoin, launch, newUserWithOrg, ok, text } from "./lib.mjs";

const browser = await launch();
const a = await newUserWithOrg(browser, "crm", "Empresa Núcleo");
const q = (s) => a.locator(s);

// ------------------------------------------------------------ Central vazia + meta
ok((await text(a)).includes("Comece por aqui"), "Central nova mostra o guia de começo");
await a.goto(BASE + "/admin?tab=organizacao");
await q("input[name=monthlyGoal]").fill("10.000");
await a.getByRole("button", { name: "Salvar" }).click();
await a.waitForSelector("text=Organização atualizada");
await a.goto(BASE + "/painel");
ok((await text(a)).includes("R$ 10.000"), "meta mensal aparece na Central");

// ------------------------------------------------------------ editar funil
await a.goto(BASE + "/admin?tab=funis");
await q("input[aria-label='Nova etapa']").fill("Reunião");
await a.getByRole("button", { name: "Adicionar etapa" }).click();
await a.waitForSelector("input[value='Reunião']");
await a.goto(BASE + "/funis");
await a.waitForSelector("section[aria-label='Etapa Reunião']");
const order = await a.locator("section[aria-label^='Etapa ']").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label").replace("Etapa ", "")));
ok(order.join(",") === "Prospecção,Qualificação,Proposta,Negociação,Reunião,Ganho,Perdido", "etapa nova entra antes de Ganho: " + order.join(", "));

// ------------------------------------------------------------ contato + negócio
await a.goto(BASE + "/contatos?novo=1");
await a.getByRole("dialog").locator("input[name=name]").fill("Marcelo Viana");
await a.getByRole("dialog").locator("input[name=email]").fill("marcelo@alicerce.com");
await a.getByRole("dialog").getByRole("button", { name: "Salvar" }).click();
await a.waitForSelector("text=Marcelo Viana");

await a.goto(BASE + "/funis?novo=1");
const d = a.getByRole("dialog");
await d.locator("input[name=title]").fill("Obra Alicerce");
await d.locator("input[name=value]").fill("5.000,00");
await d.locator("input[role=combobox]").first().fill("Marc");
await a.getByRole("option", { name: /Marcelo Viana/ }).click();
await d.locator("input[name=company]").fill("Construtora Alicerce");
await d.getByRole("button", { name: "Salvar" }).click();
await a.waitForSelector("section[aria-label='Etapa Prospecção'] >> text=Obra Alicerce");
ok(true, "negócio criado na etapa Prospecção com contato e empresa");
ok((await text(a, "section[aria-label='Etapa Prospecção']")).includes("R$ 5.000"), "coluna soma o valor");

// ------------------------------------------------------------ arrastar
async function drag(title, toStage) {
  const card = a.locator(`[role=button]:has-text("${title}")`).first();
  const target = a.locator(`section[aria-label='Etapa ${toStage}']`);
  const cb = await card.boundingBox();
  const tb = await target.boundingBox();
  await a.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2);
  await a.mouse.down();
  await a.mouse.move(cb.x + cb.width / 2 + 12, cb.y + cb.height / 2 + 12, { steps: 4 });
  await a.mouse.move(tb.x + tb.width / 2, tb.y + 140, { steps: 14 });
  await a.mouse.up();
}
await drag("Obra Alicerce", "Qualificação");
await a.waitForSelector("section[aria-label='Etapa Qualificação'] >> text=Obra Alicerce");
ok(true, "arrastar move o negócio de etapa (e persiste ao recarregar)");
await a.reload();
await a.waitForSelector("section[aria-label='Etapa Qualificação'] >> text=Obra Alicerce");

// ------------------------------------------------------------ ganhar (pela caixa do negócio)
await q("[role=button]:has-text('Obra Alicerce')").first().click();
await a.getByRole("dialog").locator("select[aria-label=Etapa]").selectOption({ label: "Ganho" });
await a.waitForSelector("section[aria-label='Etapa Ganho'] >> text=Obra Alicerce");
ok(true, "ganhar pela caixa do negócio");
await a.goto(BASE + "/painel");
ok((await text(a)).includes("R$ 5.000 / R$ 10.000") && (await text(a)).includes("50%"), "Central: meta em 50% após ganhar R$ 5.000");
ok((await text(a)).includes("1 negócio ganho"), "Central: contagem de ganhos");

// ------------------------------------------------------------ perder com motivo
await a.goto(BASE + "/funis?novo=1");
await a.getByRole("dialog").locator("input[name=title]").fill("Negócio Perdido");
await a.getByRole("dialog").locator("input[name=value]").fill("800");
await a.getByRole("dialog").getByRole("button", { name: "Salvar" }).click();
await a.waitForSelector("section[aria-label='Etapa Prospecção'] >> text=Negócio Perdido");
await drag("Negócio Perdido", "Perdido");
await a.getByRole("dialog").locator("input").first().fill("Preço");
await a.getByRole("button", { name: "Marcar como perdido" }).click();
await a.waitForSelector("section[aria-label='Etapa Perdido'] >> text=Negócio Perdido");
ok(true, "perder pergunta o motivo e move para Perdido");
await a.goto(BASE + "/funis?v=lista");
ok((await text(a)).includes("Negócio Perdido") && (await text(a)).includes("Perdido"), "visão em lista mostra a etapa");

// ------------------------------------------------------------ histórico do negócio
await q("button:has-text('Negócio Perdido')").first().click();
await a.getByRole("dialog").getByText("Motivo da perda: Preço").waitFor();
await a.getByRole("dialog").locator("input[aria-label=Registro]").fill("Cliente optou por concorrente");
await a.getByRole("dialog").getByRole("button", { name: "Registrar" }).click();
await a.getByRole("dialog").getByText("Cliente optou por concorrente").waitFor();
ok((await text(a, "[role=dialog]")).includes("Negócio perdido"), "histórico registra a perda e a nota");
await a.keyboard.press("Escape");

// ------------------------------------------------------------ tarefas
const iso = (days) => new Date(Date.now() + days * 86400000).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
async function newTask(title, date) {
  await a.goto(BASE + "/tarefas?novo=1");
  await a.getByRole("dialog").locator("input[name=title]").fill(title);
  if (date) await a.getByRole("dialog").locator("input[name=dueDate]").fill(date);
  await a.getByRole("dialog").getByRole("button", { name: "Salvar" }).click();
  await a.waitForSelector("[role=dialog]", { state: "detached" });
}
await newTask("Ligar hoje", iso(0));
await newTask("Atrasada", iso(-2));
await newTask("Futura", iso(5));
await a.goto(BASE + "/tarefas");
ok((await text(a, "nav[aria-label='Período']")).includes("Hoje 1") && (await text(a, "nav[aria-label='Período']")).includes("Atrasadas 1"), "contadores por prazo (hoje 1, atrasadas 1)");
await q("[role=checkbox][aria-label='Concluir: Ligar hoje']").click();
await a.waitForSelector("text=Tudo em dia");
await a.goto(BASE + "/tarefas?v=concluidas");
ok((await text(a)).includes("Ligar hoje"), "tarefa concluída vai para Concluídas");
await a.goto(BASE + "/painel");
ok((await text(a)).includes("1 atrasadas"), "Central mostra a tarefa atrasada");

// ------------------------------------------------------------ busca global
await a.goto(BASE + "/painel");
await a.keyboard.press("Control+k");
await a.getByLabel("Buscar", { exact: true }).fill("Alicerce");
await a.getByRole("option", { name: /Obra Alicerce/ }).waitFor();
await a.keyboard.press("Enter");
await a.waitForURL(/\/funis\?deal=/);
await a.getByRole("dialog").getByText("Editar negócio").waitFor();
ok(true, "Ctrl+K encontra o negócio e abre direto no painel dele");
await a.keyboard.press("Escape");

// ------------------------------------------------------------ equipe: notificação de atribuição
const g = await inviteAndJoin(browser, a, "vend", "seller");
ok((await text(g, "header")).includes("Convidado vend"), "convidado entrou como vendedor");
await a.goto(BASE + "/funis?novo=1");
await a.getByRole("dialog").locator("input[name=title]").fill("Para o vendedor");
await a.getByRole("dialog").locator("select[name=ownerId]").selectOption({ label: "Convidado vend" });
await a.getByRole("dialog").getByRole("button", { name: "Salvar" }).click();
await a.waitForSelector("text=Para o vendedor");
await g.reload();
await g.getByRole("button", { name: /Notificações, 1 não lida/ }).waitFor({ timeout: 15000 });
await g.getByRole("button", { name: /Notificações/ }).click();
await g.getByText("Negócio atribuído a você").waitFor();
ok(true, "vendedor é notificado quando recebe um negócio");
await g.getByText("Negócio atribuído a você").click();
await g.waitForURL(/\/funis\?deal=/);
ok(true, "clicar na notificação abre o negócio");
await g.goto(BASE + "/admin");
ok(!(await text(g, "nav[aria-label='Seções']")).includes("Funis"), "vendedor não vê as abas de configuração");
await g.goto(BASE + "/admin?tab=auditoria");
ok(!(await text(g)).includes("Registro de atividades"), "vendedor não acessa a auditoria");

// ------------------------------------------------------------ auditoria (admin)
await a.goto(BASE + "/admin?tab=auditoria");
const audit = await text(a);
ok(audit.includes("Negócio criado") && audit.includes("Contato criado") && audit.includes("Usuário crm"), "auditoria lista as ações com o autor");

// ------------------------------------------------------------ perfil
await a.goto(BASE + "/perfil");
await q("input[name=name]").fill("Nome Novo");
await a.getByRole("button", { name: "Salvar" }).click();
await a.waitForSelector("text=Nome atualizado");
await a.getByRole("radio", { name: "Claro" }).click();
ok((await a.evaluate(() => document.documentElement.getAttribute("data-theme"))) === "light", "tema claro aplicado");
await a.reload();
ok((await a.evaluate(() => document.documentElement.getAttribute("data-theme"))) === "light", "tema persiste após recarregar");
ok((await text(a, "header")).includes("Nome Novo"), "novo nome aparece na topbar");
await q("input[name=password]").fill("NovaSenha#2027");
await q("input[name=again]").fill("NovaSenha#2027");
await a.getByRole("button", { name: "Alterar senha" }).click();
await a.waitForSelector("text=Senha alterada");
await a.getByRole("button", { name: "Sair" }).click();
await a.waitForURL("**/entrar");
await a.locator("input[name=email]:visible").fill(a.email);
await a.locator("input[name=password]:visible").fill("NovaSenha#2027");
await a.getByRole("button", { name: "Entrar", exact: true }).click();
await a.waitForURL("**/painel");
ok(true, "senha alterada e login com a nova senha");

// ------------------------------------------------------------ excluir organização
await a.goto(BASE + "/admin?tab=organizacao");
await a.getByRole("button", { name: "Excluir organização" }).click();
const del = a.getByRole("dialog");
ok(await del.getByRole("button", { name: "Excluir tudo" }).isDisabled(), "exclusão exige digitar o nome");
await del.locator("input").fill("Empresa Núcleo");
await del.getByRole("button", { name: "Excluir tudo" }).click();
await a.waitForURL("**/onboarding", { timeout: 15000 });
ok(true, "organização excluída; usuário volta ao onboarding");
await g.goto(BASE + "/painel");
await g.waitForURL("**/onboarding");
ok(true, "membros perdem o acesso quando a organização é excluída");

ok(a.errors.length === 0 && g.errors.length === 0, "sem erros de JavaScript: " + [...a.errors, ...g.errors].join(" | "));
console.log("Usuários de teste criados:", a.email, g.email, "— apague em Authentication → Users");
await browser.close();
done();
