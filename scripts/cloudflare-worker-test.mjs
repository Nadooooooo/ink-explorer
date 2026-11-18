import assert from "node:assert/strict";
import { test } from "node:test";
import { assertPublicSitemap } from "./assert-public-sitemap.mjs";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import http from 'node:http';
registerHooks({ resolve(specifier, context, next) {
  try { return next(specifier, context); }
  catch (error) { if (specifier.startsWith("./") && context.parentURL?.includes("/src/") && !/\.[a-z]+$/.test(specifier)) return next(specifier + ".ts", context); throw error; }
} });
const { handleRequest } = await import("../cloudflare/worker.mjs");

const template = '<!doctype html><html lang="en"><head><title>Ink Explorer</title><meta name="description" content="Explorer" /></head><body><div id="root"></div></body></html>';
const env = {
  PUBLIC_URL: "https://inkexplorer.xyz",
  API_ORIGIN: "https://origin.example/ink-production",
  ORIGIN_TOKEN: "test-only-origin-secret",
  ASSETS: { async fetch(request) {
    const path = new URL(request.url).pathname;
    return path === "/index.html" ? new Response(template) : ["/assets/app-abc12345.js","/theme.js","/assets/openapi.json","/assets/marks/provenance.json"].includes(path) ? new Response("export {}", { headers: { "content-type": "application/javascript" } }) : new Response("Missing", { status: 404 });
  } },
};
const request = (path, options) => new Request("https://inkexplorer.xyz" + path, options);

test('public POST relay streams exact RPC bodies through native Node fetch on both networks', async () => {
  const received=[];
  const upstream=http.createServer(async(req,res)=>{
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    received.push({path:req.url,method:req.method,headers:req.headers,body:Buffer.concat(chunks).toString()});
    res.writeHead(200,{'content-type':'application/json'});
    res.end(JSON.stringify({jsonrpc:'2.0',id:1,result:req.url.startsWith('/testnet/')?'0xba5ed':'0xdef1'}));
  });
  await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));
  try{
    for(const prefix of ['','/testnet']){
      const payload=JSON.stringify({method:'eth_chainId',params:[]});
      const response=await handleRequest(request(prefix+'/api/contract-rpc',{method:'POST',headers:{'content-type':'application/json',origin:'https://inkexplorer.xyz',cookie:'private-cookie',authorization:'Bearer private-authorization'},body:payload}),{...env,API_ORIGIN:`http://127.0.0.1:${upstream.address().port}`});
      assert.equal(response.status,200,'The real native transport must forward a streaming POST body');
      assert.equal((await response.json()).result,prefix?'0xba5ed':'0xdef1');
      assert.match(response.headers.get('x-robots-tag'),/noindex/);
      const observed=received.at(-1);assert.equal(observed.path,prefix+'/api/contract-rpc');assert.equal(observed.method,'POST');assert.equal(observed.body,payload);
      assert.equal(observed.headers['content-type'],'application/json');assert.equal(observed.headers.origin,'https://inkexplorer.xyz');assert.equal(observed.headers['x-ink-origin-token'],env.ORIGIN_TOKEN);
      assert.equal(observed.headers.cookie,undefined);assert.equal(observed.headers.authorization,undefined);
    }
    assert.equal(received.length,2);
  }finally{await new Promise(resolve=>upstream.close(resolve));}
});

test("font licenses are served as exact static text rather than explorer documents", async () => {
  for (const name of ["noto-sans-devanagari", "noto-sans-bengali"]) {
    const path = `/licenses/${name}-ofl-1.1.txt`;
    const license = await readFile(`public${path}`, "utf8");
    const assets = { async fetch(req) {
      assert.equal(new URL(req.url).pathname, path);
      return new Response(license, { headers: { "content-type": "text/plain; charset=utf-8" } });
    } };
    const response = await handleRequest(request(path), { ...env, ASSETS: assets });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/plain/);
    assert.equal(response.headers.get("cache-control"), "public, max-age=3600");
    assert.equal(await response.text(), license);
  }
  assert.equal((await handleRequest(request("/licenses/missing.txt"), env)).status, 404);
});

test("indexing negotiation and non-cacheable 202 responses survive the edge proxy", async () => {
  const originalFetch = globalThis.fetch;
  const accept = "application/vnd.ink.indexing+json, application/json";
  try {
    for (const [prefix, chainId] of [["", 57073], ["/testnet", 763373]]) {
      const body = { code: "BLOCK_INDEXING", chainId, block: { number: "100", hash: "0x" + "a".repeat(64) }, retryAfterMs: 3000 };
      globalThis.fetch = async (url, options) => {
        assert.equal(String(url), env.API_ORIGIN + prefix + "/api/explorer/blocks/100");
        assert.equal(options.headers.get("accept"), accept);
        return Response.json(body, { status: 202, headers: { "cache-control": "no-store", "retry-after": "3" } });
      };
      const response = await handleRequest(request(prefix + "/api/explorer/blocks/100", { headers: { accept } }), env);
      assert.equal(response.status, 202);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(response.headers.get("retry-after"), "3");
      assert.deepEqual(await response.json(), body);
    }
  } finally { globalThis.fetch = originalFetch; }
});

test("edge HTML, missing routes, localization and sitemaps use the canonical domain", async () => {
  for (const prefix of ["", "/testnet"]) {
    const page = await handleRequest(request(prefix + "/blocks?lang=ar&tracking=ignored"), env);
    const html = await page.text();
    assert.equal(page.status, 200);
    assert(html.includes('<html lang="ar" dir="rtl"'));
    assert(html.includes(`href="https://inkexplorer.xyz${prefix}/blocks?lang=ar"`));
    assert(!html.includes("tracking="));
    assert(html.includes(`href="${prefix}/api/explorer/blocks"`));
    assert(!html.includes('<title>Ink blocks'));
    assert(page.headers.has("content-security-policy"));
    const sitemap = await handleRequest(request(prefix + "/sitemap.xml"), env);
    assert.match(sitemap.headers.get("content-type"), /application\/xml/);
    const sitemapText = await sitemap.text();
    assertPublicSitemap(sitemapText, "https://inkexplorer.xyz", prefix);
    assert.equal((await handleRequest(request(prefix + "/not-a-route"), env)).status, 404);
    assert.match((await handleRequest(request(prefix + "/search?q=x"), env)).headers.get("x-robots-tag"), /noindex/);
  }
});

test("Mainnet and Sepolia pages have distinct titles, including localized API documentation", async () => {
  for (const path of ["/developers", "/tokens", "/stats"]) for (const locale of ["en", "fr"]) {
    const query = locale === "en" ? "" : "?lang=fr";
    const mainnet = await (await handleRequest(request(path + query), env)).text();
    const sepolia = await (await handleRequest(request("/testnet" + path + query), env)).text();
    const title = html => html.match(/<title>([^<]+)<\/title>/)?.[1];
    assert.notEqual(title(mainnet), title(sepolia), `${path} ${locale}`);
    assert.match(title(sepolia), /Ink Sepolia/);
    if (path === "/developers") {
      assert.match(mainnet, /WebSocket/);
      assert.match(sepolia, /WebSocket/);
    }
  }
});

test("block preloads use the same normalized URL as the selected initial ledger", async () => {
  for(const prefix of ["","/testnet"])for(const type of ["","block","reorg","unknown"]){
    const page=await handleRequest(request(prefix+"/blocks?lang=fr"+(type?"&type="+type:"")),env);
    const html=await page.text(),expected=prefix+"/api/explorer/blocks"+(type==="reorg"?"?type=reorg":"");
    const preloads=[...html.matchAll(/<link rel="preload" href="([^"]+)" as="fetch"/g)].map(m=>m[1]);
    assert.deepEqual(preloads,[expected]);
  }
});

test("canonical redirects, asset 404s, immutable build assets and preview noindex", async () => {
  const redirect = await handleRequest(new Request("https://www.inkexplorer.xyz/blocks?lang=fr"), env);
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.get("location"), "https://inkexplorer.xyz/blocks?lang=fr");
  const asset = await handleRequest(request("/assets/app-abc12345.js"), env);
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get("cache-control"), /immutable/);
  assert.equal(asset.headers.get("vary"), "Accept-Encoding");
  for(const path of ["/theme.js","/assets/openapi.json","/assets/marks/provenance.json"]){const mutable=await handleRequest(request(path),env);assert.equal(mutable.status,200);assert.doesNotMatch(mutable.headers.get("cache-control"),/immutable/);}
  assert.equal((await handleRequest(request("/assets/missing.js"), env)).status, 404);
  assert.match((await handleRequest(new Request("https://inkexplorer.example.workers.dev/"), env)).headers.get("x-robots-tag"), /noindex/);
});

test("the edge gateway filters credentials and methods and keeps both WebSockets on the public origin", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => { calls.push({ url: String(url), options }); return Response.json({ chainId: 57073 }); };
  try {
    const response = await handleRequest(request("/api/contract-rpc", {
      method: "POST", body: '{"method":"eth_chainId","params":[]}',
      headers: { origin: "https://inkexplorer.xyz", authorization: "browser-only", cookie: "private=1", "x-ink-origin-token": "spoofed", "content-type": "application/json" },
    }), env);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("x-robots-tag"), /noindex/);
    assert.equal(calls[0].url, "https://origin.example/ink-production/api/contract-rpc");
    assert.equal(calls[0].options.headers.get("x-ink-origin-token"), env.ORIGIN_TOKEN);
    assert.equal(calls[0].options.headers.get("authorization"), null);
    assert.equal(calls[0].options.headers.get("cookie"), null);
    assert.equal(calls[0].options.headers.get("origin"), "https://inkexplorer.xyz");
    assert.equal((await handleRequest(request("/api/overview", { method: "POST" }), env)).status, 405);
    assert.equal(calls.length, 1);
    for (const prefix of ["", "/testnet"]) {
      const config = await handleRequest(request(prefix + "/api/live/config"), env);
      assert.equal((await config.json()).url, "wss://inkexplorer.xyz" + prefix + "/api/live");
    }
    assert.equal((await handleRequest(request("/api/contract-rpc", { method: "POST", headers: { "content-length": String(5 * 1024 * 1024) }, body: "x" }), env)).status, 413);
  } finally { globalThis.fetch = originalFetch; }
});

test("document variants redirect while malformed identifiers stay unindexable", async () => {
  for (const prefix of ["", "/testnet"]) {
    const variant = await handleRequest(request(prefix + "/blocks/?lang=fr&ref=shared"), env);
    assert.equal(variant.status, 308);
    assert.equal(variant.headers.get("location"), `https://inkexplorer.xyz${prefix}/blocks?lang=fr&ref=shared`);
    const address = "0x" + "a".repeat(40);
    for (const path of ["/txs/garbage", "/tokens/garbage", `/token/${address}/instance/invalid`, `/token/${address}/instance/${2n ** 256n}`]) {
      const response = await handleRequest(request(prefix + path), env);
      assert.equal(response.status, 404, path);
      assert.match(response.headers.get("x-robots-tag"), /noindex/);
    }
  }
});

test("localized directory and detail metadata and preview robots survive browser rendering", async () => {
  for (const path of ["/dispute-games", "/name-services", "/public-tags/submit", "/contracts", "/block/100"]) {
    const response = await handleRequest(request(path + "?lang=fr"), env);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert(html.includes('id="ink-page-schema"'));
    const data = JSON.parse(html.match(/<script id="ink-page-schema" type="application\/ld\+json">(.*?)<\/script>/)[1]);
    const page = data["@graph"].find(item => item["@type"] === "WebPage");
    assert.equal(page.inLanguage, "fr");
    assert.equal(page.url, `https://inkexplorer.xyz${path}?lang=fr`);
    assert.equal(page.name, html.match(/<title>(.*?)<\/title>/)[1]);
  }
  const preview = await handleRequest(new Request("https://inkexplorer.preview.workers.dev/blocks"), env);
  const html = await preview.text();
  assert(html.includes('data-robots-policy="noindex"'));
  assert(html.includes('<meta name="robots" content="noindex,follow"'));
  assert(html.includes('rel="canonical" href="https://inkexplorer.xyz/blocks"'));
});

test("verified contract alias redirects to one canonical directory", async () => {
  for (const prefix of ["", "/testnet"]) {
    const response = await handleRequest(request(prefix + "/verified-contracts?lang=fr&ref=old"), env);
    assert.equal(response.status, 308);
    assert.equal(response.headers.get("location"), `https://inkexplorer.xyz${prefix}/contracts?lang=fr&ref=old`);
  }
});

test("native transfer chart metadata is accurate on both public APIs without changing data", async () => {
  const originalFetch = globalThis.fetch;
  const source = { sections: [{ id: "tokens", title: "Tokens", charts: [
    { id: "newNativeCoinTransfers", title: "Number of ETH transfers", description: "Completed token transfers", units: null, resolutions: ["DAY"] },
    { id: "other", title: "Other", description: "Already accurate", units: null, resolutions: ["DAY"] },
  ] }] };
  globalThis.fetch = async () => Response.json(source, { headers: { etag: '"source-body"' } });
  try {
    for (const prefix of ["", "/testnet"]) {
      const response = await handleRequest(request(prefix + "/api/stats/lines"), env);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("etag"), null);
      assert.match(response.headers.get("x-robots-tag"), /noindex/);
      const actual = await response.json();
      assert.equal(actual.sections[0].charts[0].description, "Number of ETH transfers completed in each period.");
      assert.deepEqual(actual.sections[0].charts[1], source.sections[0].charts[1]);
      assert.equal(source.sections[0].charts[0].description, "Completed token transfers");
      const head = await handleRequest(request(prefix + "/api/stats/lines", { method: "HEAD" }), env);
      assert.equal(head.status, 200);
      assert.equal(head.headers.get("etag"), null);
      assert.equal(await head.text(), "");
    }
  } finally { globalThis.fetch = originalFetch; }
});

test("fee counter titles are concise on both public APIs without changing values", async () => {
  const originalFetch = globalThis.fetch;
  const source = { counters: [
    { id: "txnsFee24h", title: "Transactions fees (24h)", description: "Fee total", units: "ETH", value: "0.000000000000000001" },
    { id: "averageTxnFee24h", title: "Avg. transaction fee (24h)", description: "Fee average", units: "ETH", value: "0.000000000000000002" },
    { id: "totalTxns", title: "Total txns", description: "All transactions", value: "123" },
  ] };
  globalThis.fetch = async () => Response.json(source, { headers: { etag: '"source-body"' } });
  try {
    for (const prefix of ["", "/testnet"]) {
      const response = await handleRequest(request(prefix + "/api/stats/counters"), env);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("etag"), null);
      const actual = await response.json();
      assert.deepEqual(actual.counters.map(row => row.title), ["Transaction fees · 24h", "Avg. tx fee · 24h", "Total txns"]);
      assert.deepEqual(actual.counters.map(row => row.value), source.counters.map(row => row.value));
      assert.deepEqual(actual.counters.map(row => row.description), source.counters.map(row => row.description));
      assert.equal(source.counters[0].title, "Transactions fees (24h)");
      const head = await handleRequest(request(prefix + "/api/stats/counters", { method: "HEAD" }), env);
      assert.equal(head.status, 200);
      assert.equal(head.headers.get("etag"), null);
      assert.equal(await head.text(), "");
    }
  } finally { globalThis.fetch = originalFetch; }
});


test("robots excludes live transports while content resources stay crawlable", async () => {
  for (const prefix of ["", "/testnet"]) {
    const robots = await handleRequest(request(prefix + "/robots.txt"), env);
    const text = await robots.text();
    assert(text.includes("Allow: /"));
    const exclusions = text.split("\n").filter(line => line.startsWith("Disallow:"));
    assert(exclusions.length > 0 && exclusions.every(line => /^Disallow: \/(?:testnet\/)?api\/live$/.test(line)));
    const resource = await handleRequest(request(prefix + "/api/live/config"), env);
    assert.equal(resource.status, 200);
    assert.match(resource.headers.get("x-robots-tag"), /noindex/);
  }
});


test("pool identifiers accept address and singleton hash shapes without widening account routes", async () => {
  for (const prefix of ["", "/testnet"]) {
    for (const size of [40, 64]) {
      const id = "0x" + "a".repeat(size);
      const response = await handleRequest(request(prefix + "/pools/" + id), env);
      assert.equal(response.status, 200);
      const html = await response.text();
      assert(html.includes("<title>Ink pool "));
      assert(html.includes(`rel="canonical" href="https://inkexplorer.xyz${prefix}/pools/${id}"`));
      assert.match(response.headers.get("x-robots-tag"), /^index,/);
    }
    for (const path of ["/address/0x" + "a".repeat(64), "/pools/0x" + "a".repeat(42)]) {
      const response = await handleRequest(request(prefix + path), env);
      assert.equal(response.status, 404);
      assert.match(response.headers.get("x-robots-tag"), /noindex/);
    }
  }
});
