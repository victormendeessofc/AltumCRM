// Utilidades dos testes de ponta a ponta (rodam num Chrome real contra o Supabase configurado em .env.local).
// Uso: npm run dev (em outro terminal) e depois npm run e2e -- auth   (ou: e2e/auth.mjs)
import { chromium } from "playwright-core";

export const BASE = process.env.BASE_URL || "http://localhost:3100";
export const PASS = "SenhaTeste#2026";
const T = Date.now();
let failures = 0;

export const ok = (cond, msg) => {
  console.log(cond ? "OK   " : "FALHA", msg);
  if (!cond) failures++;
};
export const done = () => {
  console.log(failures ? `\n${failures} verificação(ões) falharam` : "\nTudo certo");
  process.exit(failures ? 1 : 0);
};

const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
export async function launch() {
  return chromium.launch({ executablePath: CHROME, headless: process.env.HEADED ? false : true });
}

export async function page(browser, viewport = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true });
  const p = await ctx.newPage();
  p.setDefaultTimeout(45000);
  p.errors = [];
  p.on("pageerror", (e) => p.errors.push(e.message));
  return p;
}

export const uniqueEmail = (tag) => `teste.${tag}.${T}@mailinator.com`;

/** Cria conta + organização. Retorna a página já logada em /painel. */
export async function newUserWithOrg(browser, tag, orgName) {
  const p = await page(browser);
  const email = uniqueEmail(tag);
  await p.goto(BASE + "/cadastro");
  await p.locator("input[name=name]:visible").fill("Usuário " + tag);
  await p.locator("input[name=email]:visible").fill(email);
  await p.locator("input[name=password]:visible").fill(PASS);
  await p.getByRole("button", { name: "Criar conta" }).click();
  await p.waitForURL("**/onboarding");
  await p.locator("input[name=name]:visible").fill(orgName || "Org " + tag);
  await p.getByRole("button", { name: "Criar organização" }).click();
  await p.waitForURL("**/painel");
  await p.locator("header").waitFor();
  p.email = email;
  return p;
}

/** Admin gera convite para `email`, e a pessoa cria conta pelo link. Retorna a página logada do convidado. */
export async function inviteAndJoin(browser, admin, tag, role = "seller") {
  const email = uniqueEmail(tag);
  await admin.goto(BASE + "/admin");
  await admin.waitForSelector("text=Convidar para a equipe");
  await admin.locator("input[name=email]").fill(email);
  await admin.locator("select[name=role]").selectOption(role);
  await admin.getByRole("button", { name: "Gerar convite" }).click();
  const code = admin.locator("code").first();
  await code.waitFor({ timeout: 15000 });
  const link = (await code.innerText()).trim();

  const g = await page(browser);
  await g.goto(link);
  await g.getByRole("link", { name: "Criar conta" }).click();
  await g.waitForURL((u) => u.pathname === "/cadastro" && u.search.includes("next="));
  await g.locator("input[name=name]:visible").fill("Convidado " + tag);
  await g.locator("input[name=email]:visible").fill(email);
  await g.locator("input[name=password]:visible").fill(PASS);
  await g.getByRole("button", { name: "Criar conta" }).click();
  await g.waitForURL("**/convite/**");
  await g.getByRole("button", { name: "Aceitar convite" }).click();
  await g.waitForURL("**/painel", { timeout: 15000 });
  g.email = email;
  return g;
}

export const text = async (p, selector = "body") => (await p.locator(selector).first().innerText()).replace(/\s+/g, " ");
