import puppeteer from "puppeteer-core";
import { mkdir, writeFile } from "node:fs/promises";

const base = process.env.BASE_URL || "http://127.0.0.1:4188";
const browser = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox"] });
const failures = [];
const results = [];
const cases = [
  { name: "home desktop", width: 1440, path: "/" },
  { name: "analytics desktop", width: 1440, path: "/analytics" },
  { name: "contracts mobile", width: 390, path: "/contracts" },
  { name: "contracts mobile slow response", width: 390, path: "/contracts", delay: 700 },
  { name: "NFT mobile", width: 390, path: "/token/0x1b35d13a2E2528f192637F14B05f0Dc0e7dEB566/instance/545" },
];

for (const test of cases) {
  const page = await browser.newPage();
  if (test.delay) {
    await page.setRequestInterception(true);
    page.on("request", request => {
      if (request.url().includes("/api/explorer/smart-contracts")) {
        setTimeout(() => request.continue(), test.delay);
      } else request.continue();
    });
  }
  await page.evaluateOnNewDocument(() => {
    globalThis.__performanceAudit = { cls: 0, lcp: 0, longTasks: 0 };
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) if (!entry.hadRecentInput) globalThis.__performanceAudit.cls += entry.value;
    }).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) globalThis.__performanceAudit.lcp = Math.max(globalThis.__performanceAudit.lcp, entry.startTime);
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver(list => { globalThis.__performanceAudit.longTasks += list.getEntries().length; })
      .observe({ type: "longtask", buffered: true });
  });
  await page.setViewport({ width: test.width, height: 900, deviceScaleFactor: 1, isMobile: test.width < 500, hasTouch: test.width < 500 });
  await page.goto(`${base}${test.path}`, { waitUntil: "networkidle0", timeout: 30_000 });
  await new Promise(resolve => setTimeout(resolve, 1_000));
  const result = await page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0];
    const resources = performance.getEntriesByType("resource");
    return {
      ...globalThis.__performanceAudit,
      dcl: navigation.domContentLoadedEventEnd,
      transferKb: resources.reduce((total, resource) => total + (resource.transferSize || 0), 0) / 1_024,
    };
  });
  results.push({ name: test.name, ...result });
  if (!result.lcp || result.lcp > 2_500) failures.push(`${test.name}: LCP ${Math.round(result.lcp)}ms`);
  if (result.cls > 0.1) failures.push(`${test.name}: CLS ${result.cls.toFixed(3)}`);
  if (result.dcl > 1_500) failures.push(`${test.name}: DOMContentLoaded ${Math.round(result.dcl)}ms`);
  if (result.longTasks > 2) failures.push(`${test.name}: ${result.longTasks} long tasks`);
  if (result.transferKb > 1_000) failures.push(`${test.name}: ${Math.round(result.transferKb)}KB transferred`);
  await page.close();
}

await browser.close();
await mkdir("screenshots/style-review", { recursive: true });
await writeFile("screenshots/style-review/performance.json", JSON.stringify({ results, failures }, null, 2));
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`Performance test passed (${cases.length} representative loads; LCP, CLS, DCL, long tasks and transfer size).`);
