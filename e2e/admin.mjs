// Administração: convites, papéis, permissões e remoção de usuários.
import { BASE, done, inviteAndJoin, launch, newUserWithOrg, ok } from "./lib.mjs";

const browser = await launch();
const admin = await newUserWithOrg(browser, "adm", "Org Convites");

// convite duplicado
await admin.goto(BASE + "/admin");
await admin.locator("input[name=email]").fill("repetido@teste.com");
await admin.getByRole("button", { name: "Gerar convite" }).click();
await admin.locator("code").first().waitFor();
await admin.locator("input[name=email]").fill("repetido@teste.com");
await admin.getByRole("button", { name: "Gerar convite" }).click();
await admin.waitForSelector("p[role=alert]");
ok((await admin.locator("p[role=alert]").innerText()).includes("pendente"), "convite duplicado é recusado");

const guest = await inviteAndJoin(browser, admin, "conv", "seller");
ok(true, "convidado criou conta pelo link e entrou");
await guest.goto(BASE + "/admin");
await guest.waitForSelector("text=Somente administradores");
ok((await guest.locator("select[aria-label^='Papel de']").count()) === 0, "vendedor não vê controles de edição");

await admin.reload();
ok((await admin.locator("li:has-text('Convidado conv')").count()) === 1, "admin vê o novo usuário");
await admin.locator("select[aria-label='Papel de Convidado conv']").selectOption("manager");
await admin.waitForTimeout(1500);
await admin.reload();
ok((await admin.locator("select[aria-label='Papel de Convidado conv']").inputValue()) === "manager", "papel alterado persiste");

await admin.locator("select[aria-label='Papel de Usuário adm']").selectOption("seller");
await admin.waitForSelector("text=pelo menos um administrador");
ok(true, "impede rebaixar o único administrador");

await admin.getByRole("button", { name: "Remover Convidado conv" }).click();
await admin.getByRole("dialog").getByRole("button", { name: "Remover" }).click();
await admin.waitForTimeout(1500);
await admin.reload();
ok((await admin.locator("li:has-text('Convidado conv')").count()) === 0, "usuário removido");
await guest.goto(BASE + "/painel");
await guest.waitForURL("**/onboarding");
ok(true, "usuário removido perde o acesso");
ok(admin.errors.length === 0 && guest.errors.length === 0, "sem erros de JavaScript");
console.log("Usuários de teste:", admin.email, guest.email);
await browser.close();
done();
