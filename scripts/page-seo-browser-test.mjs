import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const base = process.env.BASE_URL || "http://127.0.0.1:4298";
const output = process.env.SEO_OUTPUT || "reports/quality-20261016/seo/browser";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const context = await browser.newContext({ locale: "en-US" });
const page = await context.newPage();
const report = { base, startedAt: new Date().toISOString(), checks: [], passed: false };
async function snapshot() {
  return page.evaluate(() => ({
    url: location.href, title: document.title, lang: document.documentElement.lang,
    canonical: document.querySelector('link[rel="canonical"]')?.href,
    robots: document.querySelector('meta[name="robots"]')?.content,
    graph: JSON.parse(document.querySelector("#ink-page-schema")?.textContent || "null"),
    heading: document.querySelector("main h1")?.textContent,
  }));
}
async function verify(name, { route, index, lang = "en" }) {
  await page.waitForFunction(({ route, index, lang }) => {
    const canonical = document.querySelector('link[rel="canonical"]')?.href;
    const robots = document.querySelector('meta[name="robots"]')?.content || "";
    return canonical && new URL(canonical).pathname === route && document.documentElement.lang === lang && (index ? robots.startsWith("index,") : robots.startsWith("noindex,"));
  }, { route, index, lang });
  const state = await snapshot();
  const canonical = new URL(route, canonicalOrigin);
  if (lang !== "en") canonical.searchParams.set("lang", lang);
  assert.equal(state.canonical, canonical.href);
  const website = state.graph["@graph"].find(item => item["@type"] === "WebSite");
  const detail = state.graph["@graph"].find(item => item["@type"] === "WebPage");
  assert.equal(detail.url, state.canonical);
  assert.equal(detail.name, state.title);
  assert.equal(detail.inLanguage, lang);
  assert.equal(detail.isPartOf["@id"], website["@id"]);
  report.checks.push({ name, passed: true, ...state });
}
async function navigate(route) {
  await page.evaluate(route => { history.pushState({}, "", route); dispatchEvent(new PopStateEvent("popstate")); }, route);
}
let canonicalOrigin;
try {
  await page.goto(base + "/search?q=ink", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("main h1"));
  canonicalOrigin = process.env.PUBLIC_URL || new URL(await page.locator('link[rel="canonical"]').getAttribute("href")).origin;
  await verify("direct search is noindex", { route: "/search", index: false });
  await navigate("/");
  await verify("search to home restores index and page structured data", { route: "/", index: true });
  await navigate("/search?q=eth");
  await verify("home to search removes indexing", { route: "/search", index: false });
  await navigate("/txs/garbage");
  await verify("invalid list suffix is a real missing view", { route: "/txs/garbage", index: false });
  assert.equal((await snapshot()).heading, "Page not found");
  await navigate("/blocks");
  await verify("missing page to ledger restores index", { route: "/blocks", index: true });
  await page.goto(base + "/blocks?lang=fr", { waitUntil: "domcontentloaded" });
  await verify("French page keeps canonical and structured data localized", { route: "/blocks", index: true, lang: "fr" });
  await page.goto(base + "/testnet/blocks", { waitUntil: "domcontentloaded" });
  await verify("Sepolia structured data stays on its network", { route: "/testnet/blocks", index: true });
  const sepolia = await snapshot();
  assert.equal(sepolia.graph["@graph"][0].url, canonicalOrigin + "/testnet/");
  assert.match(sepolia.title, /Ink Sepolia/);
  for (const lang of ["en", "fr"]) {
    const query = lang === "en" ? "" : "?lang=fr";
    await page.goto(base + "/developers" + query, { waitUntil: "domcontentloaded" });
    await verify("Mainnet developer title identifies its canonical page", { route: "/developers", index: true, lang });
    const mainnetTitle = (await snapshot()).title;
    await page.goto(base + "/testnet/developers" + query, { waitUntil: "domcontentloaded" });
    await verify("Sepolia developer title identifies its network", { route: "/testnet/developers", index: true, lang });
    const sepoliaTitle = (await snapshot()).title;
    assert.notEqual(mainnetTitle, sepoliaTitle);
    assert.match(sepoliaTitle, /Ink Sepolia/);
  }
  await navigate("/testnet/stats?lang=fr");
  await verify("statistics alias points to analytics after SPA navigation", { route: "/testnet/analytics", index: true, lang: "fr" });
  assert.equal(new URL(page.url()).pathname, "/testnet/stats");
  await navigate("/testnet/stats/newAccounts?lang=fr");
  await verify("statistic detail keeps its own canonical", { route: "/testnet/stats/newAccounts", index: true, lang: "fr" });
  const noScriptContext = await browser.newContext({ javaScriptEnabled: false });
  try {
    const noScriptPage = await noScriptContext.newPage();
    const missing = await noScriptPage.goto(base + "/testnet/missing-browser-review?lang=fr");
    assert.equal(missing?.status(), 404);
    assert.match(missing?.headers()["x-robots-tag"] || "", /^noindex/);
    await noScriptPage.getByRole("heading", { level: 1, name: "Page introuvable" }).waitFor();
    assert.equal(await noScriptPage.locator("main a").getAttribute("href"), "/testnet/?lang=fr");
    report.checks.push({ name: "French Sepolia 404 has useful navigation with JavaScript disabled", passed: true });
  } finally { await noScriptContext.close(); }
  // Exercise the same immutable marker the Worker sets on preview HTML. The
  // fixture changes only preview policy, never the canonical destination.
  const initialOrigin = canonicalOrigin;
  canonicalOrigin = "https://inkexplorer.xyz";
  await page.route(base + "/blocks", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replaceAll(initialOrigin, canonicalOrigin).replace('<html lang=', '<html data-robots-policy="noindex" lang=') });
  }, { times: 1 });
  await page.goto(base + "/blocks", { waitUntil: "domcontentloaded" });
  await verify("preview policy cannot become indexable during hydration", { route: "/blocks", index: false });
  await navigate("/");
  await verify("preview policy survives SPA navigation", { route: "/", index: false });
  report.passed = true;
  console.log(`${report.checks.length} browser SEO checks passed`);
} catch (error) { report.error = error.message; throw error; }
finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(output + "/results.json", JSON.stringify(report, null, 2));
  await browser.close();
}
