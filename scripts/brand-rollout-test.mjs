import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import { homePageTitles, homeGuideCopy, homeDataCopy } from "../src/home-guide-copy.ts";

const base = process.env.BASE_URL || "http://127.0.0.1:4303";
const out = process.env.BRAND_OUTPUT || "reports/seo-release-20261111/brand";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const results = [];

function readDocument(html) {
  const doc = html ? new DOMParser().parseFromString(html, "text/html") : document;
  const tags = [...doc.querySelectorAll('meta[property^="og:"], meta[name^="twitter:"]')];
  return {
    title: doc.title,
    description: doc.querySelector('meta[name="description"]')?.content,
    canonical: doc.querySelector('link[rel="canonical"]')?.getAttribute("href"),
    social: Object.fromEntries(tags.map(tag => [tag.getAttribute("property") || tag.name, tag.content])),
    socialTagCount: tags.length,
    graph: JSON.parse(doc.querySelector("#ink-page-schema")?.textContent || "null"),
    h1: doc.querySelectorAll("h1").length,
    missingAlt: doc.querySelectorAll("img:not([alt])").length,
    footer: doc.querySelector(".site-footer .footer-brand p")?.textContent,
    guide: doc.querySelector(".home-data-guide")?.textContent,
  };
}

function verifyShare(pageState) {
  const { canonical, title, description, social, graph } = pageState;
  const origin = new URL(canonical).origin;
  assert.equal(Object.keys(social).length, pageState.socialTagCount, "Each social tag is unique");
  assert.equal(social["og:title"], title);
  assert.equal(social["twitter:title"], title);
  assert.equal(social["og:description"], description);
  assert.equal(social["twitter:description"], description);
  assert.equal(social["og:url"], canonical);
  assert.equal(social["og:image"], origin + "/brand/block-lens/share.png");
  assert.equal(social["twitter:image"], social["og:image"]);
  assert.equal(social["twitter:card"], "summary_large_image");
  assert.equal(social["og:image:width"], "1200");
  assert.equal(social["og:image:height"], "630");
  assert.equal(social["og:image:type"], "image/png");
  assert(social["og:image:alt"].includes("Ink Explorer"));
  assert.equal(social["twitter:image:alt"], social["og:image:alt"]);
  const publisher = graph["@graph"].find(item => item["@type"] === "Organization");
  assert.equal(publisher.name, "Ink Explorer");
  assert.equal(publisher.logo, origin + "/brand/block-lens/icon-512.png");
}

try {
  for (const prefix of ["", "/testnet"]) for (const lang of Object.keys(homePageTitles)) {
    const network = prefix ? "Ink Sepolia" : "Ink Mainnet";
    const url = base + prefix + "/?lang=" + lang;
    const catalogue = JSON.parse(await readFile(`src/locales/${lang}.json`, "utf8"));
    const context = await browser.newContext({ viewport: { width: lang === "fr" ? 320 : lang === "ar" ? 390 : 1440, height: 1000 } });
    await context.routeWebSocket(/\/api\/live$/, ws => ws.close());
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    try {
      const response = await page.goto(url, { waitUntil: "domcontentloaded" });
      assert.equal(response.status(), 200);
      const native = await page.evaluate(readDocument, await response.text());
      verifyShare(native);
      assert.equal(native.title, homePageTitles[lang].replace("Ink Mainnet", network));
      assert.equal(native.description, homeGuideCopy[lang][1].replace("{network}", network));
      assert.equal(native.h1, 1);
      assert.equal(native.missingAlt, 0);
      assert.equal(native.footer, catalogue.independent);
      assert(native.guide.includes(homeDataCopy[lang][0]));

      await page.locator("#ink-startup").waitFor({ state: "detached" });
      const hydrated = await page.evaluate(readDocument);
      verifyShare(hydrated);
      assert.deepEqual(hydrated.social, native.social);
      assert.deepEqual(hydrated.graph, native.graph);
      assert.equal(hydrated.footer, native.footer);
      assert.equal(hydrated.h1, 1);
      assert(await page.locator(".home-data-guide").isVisible());
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));

      // A static SPA shell may have no server-generated social tags or schema.
      // Removing both exercises their creation on the next real client navigation.
      await page.evaluate(prefix => {
        document.querySelectorAll('meta[property^="og:"], meta[name^="twitter:"], #ink-page-schema').forEach(node => node.remove());
        history.pushState({}, "", prefix + "/tokens" + location.search);
        dispatchEvent(new PopStateEvent("popstate"));
      }, prefix);
      await page.locator(".token-directory").waitFor();
      await page.waitForFunction(homeTitle => document.title !== homeTitle && document.querySelector("#ink-page-schema"), native.title);
      const tokens = await page.evaluate(readDocument);
      verifyShare(tokens);
      assert.equal(new URL(tokens.canonical).pathname, prefix + "/tokens");
      assert.equal(tokens.social["og:image:alt"], native.social["og:image:alt"]);
      assert.equal(tokens.footer, native.footer);

      await page.evaluate(prefix => {
        history.pushState({}, "", prefix + "/" + location.search);
        dispatchEvent(new PopStateEvent("popstate"));
      }, prefix);
      await page.waitForFunction(title => document.title === title, native.title);
      const returned = await page.evaluate(readDocument);
      assert.deepEqual(returned.social, native.social);
      assert.deepEqual(returned.graph, native.graph);
      assert.deepEqual(errors, []);
      if (!prefix && ["en", "fr"].includes(lang)) await page.screenshot({ path: `${out}/home-${lang}.png`, fullPage: true });
      results.push({ prefix, lang, passed: true, title: native.title, description: native.description, footer: native.footer, h1: 1 });
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
  await writeFile(out + "/results.json", JSON.stringify({ base, results }, null, 2));
}
console.log(JSON.stringify({ passed: true, homes: results.length, locales: 10, networks: 2, spaHomeReturns: results.length }));
