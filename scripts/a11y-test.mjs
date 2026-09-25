import puppeteer from "puppeteer-core";
import axe from "axe-core";

const base = process.env.BASE_URL || "http://127.0.0.1:4188";
const browser = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox"] });
const failures = [];
const overview = await fetch(`${base}/api/overview`).then(response => response.json());
const pools = await fetch(`${base}/api/contract-info/pools`).then(response => response.json());
const routes = [
  "/", "/blocks", "/txs", "/tokens", "/pools", `/pools/${pools.items[0].pool_id}`,
  `/tx/${overview.transactions[0].hash}`, `/address/${overview.transactions[0].from.hash}`,
  "/token/0x1b35d13a2E2528f192637F14B05f0Dc0e7dEB566/instance/545",
  "/analytics?range=30", "/advanced", "/network", "/?lang=ar",
];

for (const viewport of [{width:1440,height:1000,name:"desktop"},{width:900,height:1000,name:"tablet"},{width:390,height:844,name:"mobile"}]) {
  for (const route of routes) {
    const page = await browser.newPage();
    await page.setViewport({ ...viewport, hasTouch: viewport.name === "mobile", isMobile: viewport.name === "mobile" });
    await page.goto(`${base}${route}`, { waitUntil: "networkidle0", timeout: 30000 });
    // Execute Axe through Puppeteer's isolated automation channel. Injecting an
    // inline <script> would (correctly) be refused by the production CSP.
    await page.evaluate(axe.source);
    const result = await page.evaluate(async () => await window.axe.run(document, { resultTypes: ["violations"] }));
    for (const violation of result.violations.filter(item => ["serious", "critical"].includes(item.impact))) {
      const samples = violation.nodes.slice(0, 3).map(node => `${node.target.join(" ")} [${node.failureSummary?.replace(/\s+/g, " ")}]`).join(" | ");
      failures.push(`${viewport.name} ${route}: ${violation.id} — ${violation.help} (${violation.nodes.length}): ${samples}`);
    }
    await page.close();
  }
}

await browser.close();
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`Accessibility audit passed (${routes.length} routes × 3 viewports; no serious or critical violations).`)
