// Roda os testes de ponta a ponta em sequência: npm run e2e [auth|contacts|admin|crm]
import { spawnSync } from "node:child_process";

const all = ["auth", "contacts", "admin", "crm"];
const wanted = process.argv.slice(2).length ? process.argv.slice(2) : all;
let failed = 0;
for (const name of wanted) {
  console.log(`\n=== e2e: ${name} ===`);
  const r = spawnSync("node", [`e2e/${name}.mjs`], { stdio: "inherit" });
  if (r.status !== 0) failed++;
}
console.log(failed ? `\n${failed} suíte(s) com falha` : "\nTodas as suítes passaram");
process.exit(failed ? 1 : 0);
