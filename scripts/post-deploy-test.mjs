import assert from "node:assert/strict";
import { assertPublicSitemap } from "./assert-public-sitemap.mjs";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { initialBuildAssets } from "./initial-build-assets.mjs";
import {AbiCoder} from 'ethers';

if (!process.env.BASE_URL) throw new Error("BASE_URL must explicitly identify the deployment to test");
const base = new URL(process.env.BASE_URL);
if (!/^https?:$/.test(base.protocol) || base.username || base.password || base.pathname !== "/" || base.search || base.hash) throw new Error("BASE_URL must be an HTTP(S) origin");
const canonicalOrigin = process.env.PUBLIC_URL || base.origin;
const output = process.env.POST_DEPLOY_DIR || `reports/post-deploy-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const dist = path.resolve(process.env.EXPECTED_DIST || "dist");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const template = await readFile(path.join(dist, "index.html"));
const assets = [...new Set([...String(template).matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)].map((match) => match[1]))];
assert(assets.length > 0, "Expected built entry assets are required");
const initialAssets = await initialBuildAssets(dist, assets);
const brandResources = {
  "/favicon.ico": ["image/x-icon", "image/vnd.microsoft.icon"],
  "/manifest.webmanifest": "application/manifest+json",
  "/brand/block-lens/symbol.svg": "image/svg+xml",
  "/brand/block-lens/wordmark.svg": "image/svg+xml",
  "/brand/block-lens/share.png": "image/png",
  "/brand/block-lens/apple-touch-icon.png": "image/png",
  "/brand/block-lens/app-icon.svg": "image/svg+xml",
  "/brand/block-lens/icon-192.png": "image/png",
  "/brand/block-lens/icon-512.png": "image/png",
  "/brand/block-lens/x-profile.png": "image/png",
  "/brand/block-lens/x-banner.png": "image/png",
};
const report = {
  startedAt: new Date().toISOString(),
  baseUrl: base.origin,
  expectedTemplateSha256: digest(template),
  physicalDeviceTest: false,
  deployedCandidateMatches: false,
  checks: [],
  passed: false,
};
await mkdir(output, { recursive: true });
async function check(name, verify) {
  const result = { name, passed: false };
  try { result.details = await verify(); result.passed = true; }
  catch (error) { result.error = error.message; }
  report.checks.push(result);
  console.log(`${result.passed ? "PASS" : "FAIL"} ${name}${result.error ? `: ${result.error}` : ""}`);
  await writeFile(path.join(output, "results.json"), JSON.stringify(report, null, 2));
}
async function get(route) {
  const response = await fetch(new URL(route, base), { redirect: "error", signal: AbortSignal.timeout(30000) });
  return { response, bytes: Buffer.from(await response.arrayBuffer()) };
}

for (const asset of [...initialAssets, ...Object.keys(brandResources)]) await check(`asset ${asset}`, async () => {
  const { response, bytes } = await get(asset);
  assert.equal(response.status, 200);
  if (brandResources[asset]) {
    const allowed = [brandResources[asset]].flat();
    const mime = response.headers.get("content-type")?.split(";")[0];
    assert(allowed.includes(mime), `Unexpected content type for ${asset}: ${mime}`);
  }
  const expected = digest(await readFile(path.join(dist, asset)));
  const actual = digest(bytes);
  assert.equal(actual, expected, "Deployed asset differs from the expected build");
  return { sha256: actual };
});

for (const [prefix, chainId] of [["", 57073], ["/testnet", 763373]]) {
  await check(`read-only POST RPC ${chainId}`, async () => {
    for(const [method,params]of [['eth_chainId',[]],['eth_call',[{to:'0x4200000000000000000000000000000000000006',data:'0x06fdde03'},'latest']]]){
      const response=await fetch(new URL(prefix+'/api/contract-rpc',base),{method:'POST',headers:{'content-type':'application/json',origin:canonicalOrigin},body:JSON.stringify({method,params}),signal:AbortSignal.timeout(15000)});
      assert.equal(response.status,200);const body=await response.json();assert.equal(body.chainId,chainId);assert(['local','public'].includes(body.source));assert.equal(body.error,undefined);
      if(method==='eth_chainId')assert.equal(BigInt(body.result),BigInt(chainId));else assert.equal(AbiCoder.defaultAbiCoder().decode(['string'],body.result)[0],'Wrapped Ether');
      assert.match(response.headers.get('x-robots-tag')||'',/noindex/);
    }
    return {chainId,readOnlyContractName:'Wrapped Ether'};
  });
  for (const route of ["/", "/blocks", "/blocks?lang=ar", "/search?q=release-check", "/missing-release-acceptance-page"]) {
    await check(`document ${prefix}${route}`, async () => {
      const { response, bytes } = await get(`${prefix}${route}`);
      const html = String(bytes);
      assert.equal(response.status, route.startsWith("/missing-") ? 404 : 200);
      assert.match(response.headers.get("content-type") || "", /^text\/html/);
      assert(response.headers.get("content-security-policy"), "Missing document CSP");
      const canonical = new URL(`${prefix}${route.split("?")[0]}`, canonicalOrigin);
      if (route.includes("lang=ar")) canonical.searchParams.set("lang", "ar");
      assert(html.includes(`<link rel="canonical" href="${canonical.href}"`), "Missing route-specific canonical");
      assert.equal((html.match(/rel="alternate"/g) || []).length, 10);
      if (route === "/") {
        assert(html.includes(`<title>Ink Explorer — Ink ${prefix ? "Sepolia" : "Mainnet"} Block Explorer, Tokens &amp; NFTs</title>`));
        assert(html.includes(`href="${prefix}/api/overview" as="fetch"`));
        assert(html.includes('class="home-guide"'), "Home content missing from initial HTML");
        assert(html.includes('id="ink-startup" class="startup-embedded"'), "Home must not show a full loading page");
        assert(html.includes('<div class="startup-copy" data-nosnippet>'), "Recovery copy must use a supported snippet exclusion");
        assert(html.includes(`action="${prefix}/search"`), "Native home search must use its own network");
      }
      if (route.includes("lang=ar")) assert(html.includes('<html lang="ar" dir="rtl">'));
      if (/^\/(?:search|missing-)/.test(route)) assert(html.includes('<meta name="robots" content="noindex,follow"'));
      const servedAssets = [...new Set([...html.slice(0, html.indexOf("</head>")).matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)].map((match) => match[1]))];
      assert.deepEqual(servedAssets, assets, "Page references a different frontend build");
      return { status: response.status, title: html.match(/<title>([^<]+)<\/title>/)?.[1], assets: servedAssets };
    });
  }
  await check(`robots ${prefix || "/"}`, async () => {
    const { response, bytes } = await get(`${prefix}/robots.txt`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") || "", /^text\/plain/);
    assert(String(bytes).includes(`Sitemap: ${canonicalOrigin}${prefix}/sitemap.xml`));
    assert(String(bytes).includes("Allow: /"));
    const disallowed = [...String(bytes).matchAll(/^Disallow:\s*(\S+)/gm)].map((match) => match[1]);
    const required = ["/", `${prefix}/blocks`, `${prefix}/api/overview`, ...Object.keys(brandResources), ...assets];
    for (const path of required) {
      assert(!disallowed.some((rule) => path.startsWith(rule)), `Rendering resource blocked by robots.txt: ${path}`);
    }
    return { status: response.status, disallowed };
  });
  await check(`sitemap ${prefix || "/"}`, async () => {
    const { response, bytes } = await get(`${prefix}/sitemap.xml`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") || "", /^application\/xml/);
    const locations = assertPublicSitemap(String(bytes), canonicalOrigin, prefix);
    return { status: response.status, locations };
  });
  await check(`network ${chainId}`, async () => {
    const { response, bytes } = await get(`${prefix}/api/network`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("x-robots-tag") || "", /noindex/, "Crawlable APIs must remain excluded from search indexing");
    const network = JSON.parse(String(bytes));
    assert.equal(network.chainId, chainId);
    assert.equal(network.online, true);
    assert.equal(network.synced, true);
    assert.equal(network.stale, false);
    assert.equal(network.derivation?.online, true);
    assert.equal(network.derivation?.synced, true);
    return { chainId, head: network.head, sampledAt: network.sampledAt, online: network.online, synced: network.synced, stale: network.stale, derivationReady: network.derivation.online && network.derivation.synced };
  });
  await check(`QR remains disabled ${chainId}`, async () => {
    const { response, bytes } = await get(`${prefix}/api/wallet/config`);
    assert.equal(response.status, 200);
    const config = JSON.parse(String(bytes));
    assert.equal(config.chainId, chainId);
    assert.equal(config.projectId, "", "Unexpected WalletConnect configuration; do not enable QR for this acceptance");
    return { chainId, configured: false };
  });
}

report.deployedCandidateMatches = report.checks.filter((result) => /^(?:asset|document) /.test(result.name)).every((result) => result.passed);
report.finishedAt = new Date().toISOString();
report.passed = report.checks.every((result) => result.passed);
await writeFile(path.join(output, "results.json"), JSON.stringify(report, null, 2));
console.log(`${report.checks.filter((result) => result.passed).length}/${report.checks.length} checks passed. Report: ${output}/results.json`);
if (!report.passed) process.exitCode = 1;
