import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import handler from "../api/page.mjs";
import { documentHeaders, renderPage, robotsText, sitemapXml } from "../server/page-document.mjs";
import { prepareVercel } from "./prepare-vercel.mjs";
import { assertPublicSitemap } from "./assert-public-sitemap.mjs";
import { explorerToolPrefetchMarker } from "./explorer-tool-prefetch.mjs";

const locales = ["en", "zh", "hi", "es", "fr", "ar", "bn", "pt", "ru", "ja"];
const catalogues = Object.fromEntries(await Promise.all(locales.map(async language => [language, JSON.parse(await readFile(new URL(`../src/locales/${language}.json`, import.meta.url), "utf8"))])));
const message = (language, key) => catalogues[language][key];

const originalDirectory = process.cwd();
const originalPublicUrl = process.env.PUBLIC_URL;
const template = '<!doctype html><html lang="en"><head><title>Ink Explorer</title><meta name="description" content="Explorer" /><script type="module" src="/assets/app-fixture.js"></script></head><body><div id="root"><!-- ink-startup:start --><!-- ink-startup:end --></div></body></html>';
let directory;

test("tool documents prefetch only the route chunk and its additional static dependencies", () => {
  const file = name => `assets/${name}-fixture.js`;
  const chunk = (name, imports, options = {}) => ({ type: "chunk", fileName: file(name), moduleIds: [], imports: imports.map(file), ...options });
  const chunks = [
    chunk("entry", ["common"], { isEntry: true }),
    chunk("common", []),
    chunk("tools", ["entry", "units", "common"], { moduleIds: ["/project/src/ExplorerPages.tsx"], dynamicImports: [file("wallet")] }),
    chunk("units", ["common", "tools", "math"]),
    chunk("math", []),
    chunk("wallet", []),
  ];
  const marker = explorerToolPrefetchMarker(Object.fromEntries(chunks.map(asset => [asset.fileName, asset])));
  const expected = ["tools", "units", "math"].map(name => "/" + file(name));
  const input = template.replace("</head>", marker + "</head>");
  const hash = "0x" + "8".repeat(64);
  for (const basePath of ["", "/testnet"]) {
    const routes = ["/batches", "/batches/22", "/dispute-games", "/gas-tracker", "/name-services", "/name-services/domains/demo.ink", "/contract-verification", "/public-tags/submit", `/op/${hash}`];
    const others = ["/", "/accounts", "/ops", "/blocks", "/apps", `/tx/${hash}`, "/op/bad", "/contract-verification/invalid"];
    for (const route of [...routes, ...others]) {
      const url = new URL(route + "?lang=ar", "https://explorer.example");
      const { body } = renderPage(input, url, { origin: url.origin, basePath });
      const html = body.toString();
      assert(!html.includes("ink-tool-scripts"), "Build metadata must be consumed on every route");
      assert(!html.includes("modulepreload") && !/rel="preload"[^>]+as="script"/.test(html), "Failed hints must allow a later native module retry in WebKit");
      const hints = [...html.matchAll(/<link rel="prefetch" as="script" crossorigin="anonymous" href="([^"]+)" \/>/g)].map(match => match[1]);
      assert.deepEqual(hints, routes.includes(route) ? expected : [], route);
    }
  }
});

before(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "ink-public-pages-"));
  await mkdir(path.join(directory, "dist/assets"), { recursive: true });
  await writeFile(path.join(directory, "dist/index.html"), template);
  await writeFile(path.join(directory, "dist/assets/app-fixture.js"), 'document.title = "Ink";');
  delete process.env.PUBLIC_URL;
  process.chdir(directory);
});

after(async () => {
  process.chdir(originalDirectory);
  if (originalPublicUrl === undefined) delete process.env.PUBLIC_URL;
  else process.env.PUBLIC_URL = originalPublicUrl;
  await rm(directory, { recursive: true, force: true });
});

async function invoke(request = {}) {
  const result = { status: 0, headers: {}, body: "" };
  await handler({ method: "GET", url: "/", headers: { host: "explorer.example" }, ...request }, {
    writeHead(status, headers) { result.status = status; result.headers = headers; },
    end(body = "") { result.body = String(body); },
  });
  return result;
}

test("Mainnet and Sepolia homes and block ledgers use network-scoped API preloads", async () => {
  for (const prefix of ["", "/testnet"]) {
    const response = await invoke({ url: `${prefix}/` });
    assert.equal(response.status, 200);
    assert(response.body.includes(`<title>Ink Explorer — Ink ${prefix ? "Sepolia" : "Mainnet"} Block Explorer, Tokens &amp; NFTs</title>`));
    assert(response.body.includes(`<link rel="canonical" href="https://explorer.example${prefix}/" />`));
    assert(response.body.includes(`href="${prefix}/api/overview" as="fetch"`));
    for (const [header, value] of Object.entries(documentHeaders)) assert.equal(response.headers[header], value);
    assert.equal(response.headers["content-type"], "text/html; charset=utf-8");
    assert.equal(response.headers["cache-control"], "no-cache");
    const blocks = await invoke({ url: `${prefix}/blocks` });
    assert(blocks.body.includes(`href="${prefix}/api/explorer/blocks" as="fetch" crossorigin="anonymous"`));
    assert(!blocks.body.includes('href="/api/overview"'));
    assert.equal((blocks.body.match(/rel="preload"/g) || []).length, 1);
  }
  assert(!(await invoke({ url: "/tokens" })).body.includes('as="fetch"'));
});

test("rewritten and original URLs share localized metadata without leaking search values", async () => {
  const requests = [
    { url: "/api/page?path=/testnet/blocks&lang=ar&secret=fixture" },
    { url: "/testnet/blocks?lang=ar&secret=fixture", query: { path: "/testnet/blocks", lang: "ar" } },
    { url: "/api/page", query: { path: "/testnet/blocks", lang: "ar" } },
  ];
  for (const request of requests) {
    const response = await invoke(request);
    assert.equal(response.status, 200);
    assert(response.body.includes('<html lang="ar" dir="rtl">'));
    assert(response.body.includes('<link rel="canonical" href="https://explorer.example/testnet/blocks?lang=ar" />'));
    assert(response.body.includes("Latest Ink Sepolia blocks"));
    assert.equal((response.body.match(/rel="alternate"/g) || []).length, 10);
    assert(!response.body.includes("secret="));
    assert(response.body.includes('href="/testnet/api/explorer/blocks" as="fetch"'));
    assert(!response.body.includes('href="/api/explorer/blocks"'));
  }
  const fallback = await invoke({ url: '/blocks?lang=%22%3E%3Cscript%3E' });
  assert(fallback.body.includes('<html lang="en" dir="ltr">'));
});

test("all sitemap destinations and supported entity routes render with matching Node metadata", async () => {
  const address = `0x${"a".repeat(40)}`;
  const hash = `0x${"b".repeat(64)}`;
  for (const prefix of ["", "/testnet"]) {
    const sitemap = sitemapXml("https://explorer.example", prefix);
    const routes = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => new URL(match[1]).pathname);
    routes.push(...["/block/42", `/tx/${hash}`, `/address/${address}`, `/token/${address}`, `/token/${address}/instance/0`, `/pools/${address}`, `/pools/${hash}`, `/approvals/${address}`, "/batches/1", `/op/${hash}`, "/name-services/domains/example.eth", "/apps/example", "/stats/transactions"].map((route) => `${prefix}${route}`));
    for (const route of new Set(routes)) {
      const response = await invoke({ url: route });
      const local = renderPage(template, new URL(route.slice(prefix.length) || "/", "https://explorer.example"), { origin: "https://explorer.example", basePath: prefix });
      assert.equal(response.status, 200, route);
      assert.equal(response.body, String(local.body), route);
    }
  }
});

test("robots and sitemaps are not SPA documents and cover both networks and ten locales", async () => {
  for (const prefix of ["", "/testnet"]) {
    const robots = await invoke({ url: `${prefix}/robots.txt` });
    assert.equal(robots.headers["content-type"], "text/plain; charset=utf-8");
    assert.equal(robots.body, robotsText("https://explorer.example", prefix));
    assert(robots.body.includes("Allow: /"));
    const exclusions = robots.body.split("\n").filter(line => line.startsWith("Disallow:"));
    assert(exclusions.length > 0 && exclusions.every(line => /^Disallow: \/(?:testnet\/)?api\/live$/.test(line)), "Only live transports are excluded; content APIs and assets remain crawlable");
    assert(robots.body.includes("Sitemap: https://explorer.example/testnet/sitemap.xml"));
    assert(!robots.body.includes("<html"));
    const sitemap = await invoke({ url: `${prefix}/sitemap.xml` });
    assert.equal(sitemap.status, 200);
    assert.equal(sitemap.headers["content-type"], "application/xml; charset=utf-8");
    assert(sitemap.body.startsWith('<?xml version="1.0"'));
    assertPublicSitemap(sitemap.body, "https://explorer.example", prefix);
  }
});

test("statistics aliases share localized canonical and alternate destinations without redirecting details", () => {
  for (const prefix of ["", "/testnet"]) for (const language of locales) {
    const query = language === "en" ? "" : `?lang=${language}`;
    for (const route of ["/analytics", "/stats"]) {
      const url = new URL(route + query + (query ? "&" : "?") + "category=accounts", "https://explorer.example");
      const before = url.href;
      const response = renderPage(template, url, { origin: url.origin, basePath: prefix });
      const html = response.body.toString();
      assert.equal(response.status, 200);
      assert.equal(url.href, before);
      assert(html.includes(`rel="canonical" href="https://explorer.example${prefix}/analytics${query}"`));
      for (const alternate of locales) assert(html.includes(`hreflang="${alternate}" href="https://explorer.example${prefix}/analytics${alternate === "en" ? "" : `?lang=${alternate}`}"`));
      assert(!html.includes("category=accounts"));
    }
    const detail = renderPage(template, new URL("/stats/newAccounts" + query, "https://explorer.example"), { origin: "https://explorer.example", basePath: prefix });
    assert.equal(detail.status, 200);
    assert(detail.body.includes(`rel="canonical" href="https://explorer.example${prefix}/stats/newAccounts${query}"`));
  }
});

test("missing documents have translated useful content and a network-scoped home link before JavaScript", () => {
  for (const prefix of ["", "/testnet"]) for (const language of locales) {
    const response = renderPage(template, new URL(`/missing-page?lang=${language}`, "https://explorer.example"), { origin: "https://explorer.example", basePath: prefix, initialContent: '<main><h1>Wrong page fixture</h1></main>' });
    const html = response.body.toString(), heading = message(language, "pageNotFound"), home = `${prefix}/${language === "en" ? "" : `?lang=${language}`}`;
    assert.equal(response.status, 404);
    assert.equal(response.robots, "noindex,follow");
    assert.match(html, /<h1\b[^>]*>/);
    assert(html.includes(heading));
    assert(html.includes(`href="${home}"`));
    assert(html.includes(message(language, "returnHome")));
    assert.match(html, /class="startup-brand"><img [^>]*src="\/brand\/block-lens\/wordmark\.svg"[^>]*alt="Ink Explorer"/);
    assert(!html.includes("Wrong page fixture"));
    assert(!html.includes('id="ink-startup-reload"'));
    assert(!html.includes('<h1 role="status">'));
    assert(!html.includes("<noscript>"), "The missing-page message works directly, without a JavaScript requirement");
    assert(!html.includes("data-nosnippet"), "The error content is not loading/recovery copy");
  }
});

test("unknown pages return real 404s; search stays accessible but unindexed", async () => {
  for (const prefix of ["", "/testnet"]) {
    for (const route of ["/missing-page", "/block/9007199254740992", `/block/${"9".repeat(80)}`]) {
      const missing = await invoke({ url: prefix + route });
      assert.equal(missing.status, 404);
      assert.equal(missing.headers["x-robots-tag"], "noindex,follow");
      assert(missing.body.includes("Page not found"));
    }
    const search = await invoke({ url: `${prefix}/search?q=fixture` });
    assert.equal(search.status, 200);
    assert.equal(search.headers["x-robots-tag"], "noindex,follow");
    assert(!search.body.includes("q=fixture"));
  }
});

test("HEAD omits bodies and non-reading methods cannot invoke page actions", async () => {
  for (const url of ["/", "/testnet/robots.txt", "/sitemap.xml", "/missing-page"]) {
    const head = await invoke({ url, method: "HEAD" });
    const get = await invoke({ url });
    assert.equal(head.status, get.status);
    assert.deepEqual(head.headers, get.headers);
    assert.equal(head.body, "");
  }
  for (const method of ["POST", "PUT", "DELETE", "OPTIONS", "PATCH"]) {
    const response = await invoke({ method });
    assert.equal(response.status, 405);
    assert.equal(response.headers.allow, "GET, HEAD");
  }
});

test("routes reject traversal, authority changes, controls and invalid rewrite parameters", async () => {
  for (const route of ["https://evil.invalid/", "//evil.invalid/", "/../secret", "/%2e%2e/secret", "/%2f%2fevil.invalid/", "/foo\\secret", "/foo%5csecret", "/%00", "/%zz", "/blocks?secret=x", "/blocks#fragment"]) {
    const response = await invoke({ url: "/api/page", query: { path: route } });
    assert.equal(response.status, 400, route);
    assert.equal(response.headers["cache-control"], "no-store");
  }
  for (const route of [undefined, ["/blocks", "/txs"], {}]) assert.equal((await invoke({ url: "/api/page", query: { path: route } })).status, 400);
  assert.equal((await invoke({ url: "/%2e%2e/secret" })).status, 400);
});

test("public origins accept trusted forwarding, reject injected hosts and honor configured origin", async () => {
  const forwarded = await invoke({ headers: { host: "internal.invalid", "x-forwarded-host": "public.example, proxy.invalid", "x-forwarded-proto": "https, http" } });
  assert(forwarded.body.includes('href="https://public.example/"'));
  for (const host of ["evil.invalid/path", "evil.invalid@victim.example", 'evil.invalid\"><script>']) {
    assert.equal((await invoke({ headers: { host } })).status, 400);
  }
  try {
    process.env.PUBLIC_URL = "https://canonical.example/";
    assert((await invoke()).body.includes('href="https://canonical.example/"'));
    process.env.PUBLIC_URL = "https://user:secret@canonical.example/";
    const response = await invoke();
    assert.equal(response.status, 400);
    assert(!response.body.includes("secret"));
  } finally { delete process.env.PUBLIC_URL; }
});

test("a missing template reports a retryable 503 without revealing filesystem paths", async () => {
  await rm(path.join(directory, "dist/index.html"));
  try {
    const response = await invoke();
    assert.equal(response.status, 503);
    assert.equal(response.headers["retry-after"], "30");
    assert(!response.body.includes(directory));
    assert.equal((await invoke({ url: "/robots.txt" })).status, 200);
  } finally { await writeFile(path.join(directory, "dist/index.html"), template); }
});

test("Vercel packages static assets without an index that would bypass the page handler", async () => {
  const config = JSON.parse(await readFile(path.join(originalDirectory, "vercel.json"), "utf8"));
  assert.equal(config.outputDirectory, "dist/static");
  assert(config.buildCommand.endsWith("node scripts/prepare-vercel.mjs"));
  const include = config.functions["api/page.mjs"].includeFiles;
  assert(path.matchesGlob("dist/index.html", include));
  assert(path.matchesGlob("dist/snapshots/ecosystem/mainnet-fr/ecosystem-concero.json", include));
  assert(path.matchesGlob("dist/snapshots/pages/apps-sepolia-ar.json", include));
  assert(!path.matchesGlob("dist/assets/app-fixture.js", include));
  assert.deepEqual(config.rewrites.at(-1), { source: "/(.*)", destination: "/api/page?path=/$1" });
  assert.deepEqual(config.rewrites.slice(0, 2).map((rule) => rule.destination), ["/api/gateway?path=/testnet/api/:path*", "/api/gateway?path=/api/:path*"]);
  const output = await prepareVercel();
  await writeFile(path.join(output, "obsolete.txt"), "old");
  await prepareVercel();
  assert.deepEqual(await readdir(output), ["assets"]);
  assert.equal(await readFile(path.join(directory, "dist/index.html"), "utf8"), template);
  assert.equal(await readFile(path.join(output, "assets/app-fixture.js"), "utf8"), 'document.title = "Ink";');
});

test("HTTP with filesystem-first routing serves assets and still renders root, deep links and 404s", async () => {
  const output = await prepareVercel();
  const server = http.createServer(async (req, res) => {
    if (req.url === "/assets/app-fixture.js") {
      res.writeHead(200, { "content-type": "application/javascript" });
      return res.end(await readFile(path.join(output, "assets/app-fixture.js")));
    }
    await handler(req, res);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    for (const route of ["/", "/blocks", "/testnet/", "/testnet/blocks"]) {
      const response = await fetch(`${origin}${route}`);
      assert.equal(response.status, 200);
      assert((await response.text()).includes('rel="canonical"'));
    }
    assert.equal((await fetch(`${origin}/absent-page`)).status, 404);
    assert.equal((await fetch(`${origin}/assets/app-fixture.js`)).headers.get("content-type"), "application/javascript");
    assert.equal(await (await fetch(`${origin}/testnet/sitemap.xml`, { method: "HEAD" })).text(), "");
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
