import puppeteer from "puppeteer-core";

const base = process.env.BASE_URL || "http://127.0.0.1:4188";
const browser = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox"] });
const failures = [];
const routes = ["/", "/blocks", "/txs", "/tokens", "/pools", "/contracts", "/analytics", "/advanced", "/developers", "/network", "/search?q=WETH"];
const viewports = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 844 },
];

// These phrases are not forbidden words in general; they are the vague,
// presentation-style labels removed during the editorial pass. Keeping the
// list here prevents them from quietly returning in visible product copy.
const vagueCopy = [
  "live feed",
  "connected to new blocks",
  "canonical activity",
  "network intelligence",
  "verified signals",
  "read the signal",
  "build with the data",
  "independent infrastructure for a transparent",
  "deployment provenance",
  "protocol layer",
  "chain search",
  "asset index",
  "contract ledger",
  "onchain history",
  "risk check",
  "local verification boundary",
];

const [overview, tokens, pools] = await Promise.all([
  fetch(`${base}/api/overview`).then(response => response.json()),
  fetch(`${base}/api/explorer/tokens`).then(response => response.json()),
  fetch(`${base}/api/contract-info/pools`).then(response => response.json()),
]);
const transaction = overview.transactions[0];
routes.push(
  `/block/${overview.blocks[0].height}`,
  `/tx/${transaction.hash}`,
  `/address/${transaction.from.hash}`,
  `/token/${tokens.items[0].address_hash}`,
  `/pools/${pools.items[0].pool_id}`,
  "/token/0x1b35d13a2E2528f192637F14B05f0Dc0e7dEB566/instance/545",
);

for (const viewport of viewports) {
  const page = await browser.newPage();
  await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1, isMobile: viewport.name === "mobile", hasTouch: viewport.name === "mobile" });
  for (const route of routes) {
    const response = await page.goto(`${base}${route}`, { waitUntil: "networkidle0", timeout: 30_000 });
    if (!response?.ok()) failures.push(`${viewport.name} ${route}: HTTP ${response?.status()}`);
    const audit = await page.evaluate(() => {
      const visible = element => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      };
      const main = document.querySelector("main");
      const blocks = [...main.children].filter(visible).map(element => {
        const rect = element.getBoundingClientRect();
        return { top: rect.top + scrollY, bottom: rect.bottom + scrollY };
      });
      const gaps = blocks.slice(1).map((block, index) => Math.max(0, block.top - blocks[index].bottom));
      const mainRect = main.getBoundingClientRect();
      const tailGap = blocks.length ? Math.max(0, mainRect.bottom + scrollY - blocks.at(-1).bottom) : 0;
      const unnamed = [...document.querySelectorAll("button,a,input,select,summary")]
        .filter(visible)
        .filter(element => !(element.getAttribute("aria-label") || element.textContent?.trim() || element.getAttribute("title") || element.getAttribute("placeholder")))
        .length;
      const prose = [...document.querySelectorAll(".page-intro p,.methodology p,.protocol-note p,.developer-grid article p,.node-note p,.entity-profile p")]
        .filter(visible)
        .map(element => element.textContent?.trim() || "");
      const gasCards = [...document.querySelectorAll(".metric,.analytic-card")]
        .filter(element => /gas (?:estimate|price)/i.test(element.textContent || ""));
      return {
        body: document.body.innerText.toLowerCase(),
        mainText: main.innerText.toLowerCase(),
        title: document.title,
        description: document.querySelector('meta[name="description"]')?.getAttribute("content") || "",
        maxGap: Math.max(0, ...gaps),
        tailGap,
        unnamed,
        longProse: prose.filter(text => text.length > 230),
        brokenValues: /\b(?:undefined|null|nan|\[object object\])\b|\bago\s+ago\b/i.test(document.body.innerText),
        badGasUnit: gasCards.some(element => !(element.textContent || "").includes("Gwei")),
      };
    });
    for (const phrase of vagueCopy) if (audit.body.includes(phrase)) failures.push(`${viewport.name} ${route}: vague copy “${phrase}”`);
    if (route === "/") {
      for (const removed of ["local node", "op-reth v2.4.1", "rollup peers", "execution peers", "node details"]) {
        if (audit.mainText.includes(removed)) failures.push(`${viewport.name} home: removed node card copy “${removed}” returned`);
      }
    }
    if (audit.maxGap > 56) failures.push(`${viewport.name} ${route}: ${Math.round(audit.maxGap)}px empty gap between sections`);
    if (audit.tailGap > 56) failures.push(`${viewport.name} ${route}: ${Math.round(audit.tailGap)}px empty gap before footer`);
    if (audit.unnamed) failures.push(`${viewport.name} ${route}: ${audit.unnamed} unnamed controls`);
    if (audit.longProse.length) failures.push(`${viewport.name} ${route}: overly long interface prose (${audit.longProse[0].length} characters)`);
    if (audit.brokenValues) failures.push(`${viewport.name} ${route}: broken value leaked into visible copy`);
    if (audit.badGasUnit) failures.push(`${viewport.name} ${route}: gas estimate is missing its Gwei unit`);
    if (!audit.title || audit.title.length > 90) failures.push(`${viewport.name} ${route}: invalid page title`);
    if (audit.description.length < 50 || audit.description.length > 180) failures.push(`${viewport.name} ${route}: meta description length is ${audit.description.length}`);
  }
  await page.close();
}

await browser.close();
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`Content quality test passed (${routes.length} routes × ${viewports.length} viewports; copy, density, metadata and controls).`);
