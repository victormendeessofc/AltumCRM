// Contatos: criar, duplicado, importar CSV (com linhas ruins), buscar, editar, exportar, excluir e isolamento.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BASE, done, launch, newUserWithOrg, ok } from "./lib.mjs";

const browser = await launch();
const a = await newUserWithOrg(browser, "ca");
await a.goto(BASE + "/contatos");
await a.waitForSelector("text=Nenhum contato ainda");
ok(true, "estado vazio exibido");

await a.getByRole("button", { name: "Novo contato" }).first().click();
const dlg = a.getByRole("dialog");
await dlg.locator("input[name=name]").fill("Marcelo Viana");
await dlg.locator("input[name=email]").fill("Marcelo@Alicerce.com");
await dlg.locator("input[name=company]").fill("Construtora Alicerce");
await dlg.locator("input[name=jobTitle]").fill("Diretor");
await dlg.getByRole("button", { name: "Salvar" }).click();
await a.waitForSelector("text=Diretor · Construtora Alicerce");
ok(true, "contato criado com empresa e cargo");

await a.getByRole("button", { name: "Novo contato" }).first().click();
await dlg.locator("input[name=name]").fill("Outro Marcelo");
await dlg.locator("input[name=email]").fill("marcelo@alicerce.com");
await dlg.getByRole("button", { name: "Salvar" }).click();
await a.waitForSelector("p[role=alert]");
ok((await a.locator("p[role=alert]").innerText()).includes("Já existe um contato com esse e-mail"), "e-mail duplicado recusado (ignora maiúsculas)");
await dlg.getByRole("button", { name: "Cancelar" }).click();

const csv = "Nome;E-mail;Telefone;Empresa;CPF\nAna Souza;ana@solaris.com;1199;Grupo Solaris;111\nBruno Lima;bruno@solaris.com;;Grupo Solaris;222\n;semnome@x.com;;;\nCarla;carla@;;;\nMarcelo Repetido;marcelo@alicerce.com;;;\nDiego Reis;;1177;Construtora Alicerce;333\n";
const file = path.join(os.tmpdir(), "import-teste.csv");
fs.writeFileSync(file, csv);
await a.getByRole("button", { name: "Importar" }).first().click();
await a.locator("input[type=file]").setInputFiles(file);
await a.waitForSelector("text=contatos prontos para importar");
const prev = (await a.getByRole("dialog").innerText()).replace(/\s+/g, " ");
ok(prev.includes("4 contatos prontos"), "prévia: 4 válidos");
ok(prev.includes("Colunas ignoradas: CPF"), "prévia: coluna CPF ignorada");
ok(prev.includes("Linha 4") && prev.includes("Linha 5"), "prévia: linhas 4 e 5 com problema");
await a.getByRole("button", { name: /Importar 4 contatos/ }).click();
await a.waitForSelector("text=Ana Souza");
await a.waitForFunction(() => /^4 contatos/.test(document.querySelector("h1 + p")?.textContent ?? ""), null, { timeout: 15000 });
ok(true, "total = 4 (repetido pulado)");

await a.getByLabel("Buscar contatos").fill("solaris");
await a.waitForURL(/q=solaris/);
await a.waitForSelector("li:has-text('Ana Souza')");
await a.waitForFunction(() => !document.body.innerText.includes("Marcelo Viana"));
ok(true, "busca filtra por e-mail");
await a.getByLabel("Buscar contatos").fill("");
await a.waitForSelector("li:has-text('Marcelo Viana')");

await a.locator("li:has-text('Diego Reis')").click();
await dlg.locator("input[name=jobTitle]").fill("Engenheiro");
await dlg.getByRole("button", { name: "Salvar" }).click();
await a.waitForSelector("text=Engenheiro · Construtora Alicerce");
ok(true, "edição salva; empresa reaproveitada pelo nome");

const [dl] = await Promise.all([a.waitForEvent("download"), a.getByRole("link", { name: /Exportar/ }).click()]);
const body = fs.readFileSync(await dl.path(), "utf8");
ok(body.startsWith("﻿Nome;E-mail") && body.includes("Ana Souza"), "exportação CSV com BOM e dados");

await a.locator("li:has-text('Bruno Lima')").click();
await dlg.getByRole("button", { name: "Excluir" }).click();
await dlg.getByRole("button", { name: "Sim, excluir" }).click();
await a.waitForFunction(() => !document.body.innerText.includes("Bruno Lima"), null, { timeout: 15000 });
ok(true, "contato excluído");

const b = await newUserWithOrg(browser, "cb");
await b.goto(BASE + "/contatos");
await b.waitForSelector("text=Nenhum contato ainda");
const t = await (await b.request.get(BASE + "/contatos/export")).text();
ok(!t.includes("Ana Souza") && !t.includes("Marcelo"), "outra organização não vê nem exporta os contatos");
ok(a.errors.length === 0 && b.errors.length === 0, "sem erros de JavaScript");
console.log("Usuários de teste:", a.email, b.email);
await browser.close();
done();
