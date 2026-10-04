import assert from "node:assert/strict";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { publicApiOrigin, publicApiPath, allowedPublicMethod, proxyPublicApi } from "../server/public-proxy.mjs";
import { pairingTopic, expireWalletPairing } from "../src/wallet-pairing.ts";
import gateway from "../api/gateway.mjs";

test("hosting rewrites work with rewritten URLs and original URLs plus req.query", async () => {
  const previousOrigin = process.env.INK_PUBLIC_API_ORIGIN, previousFetch = globalThis.fetch;
  process.env.INK_PUBLIC_API_ORIGIN = "https://api.example.invalid/ink";
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init }); return Response.json({ chainId: 763373 }); };
  const invoke = async req => {
    const result = { status: 0, body: "" };
    const res = { writeHead(status) { result.status = status; this.headersSent = true; }, write(chunk) { result.body += Buffer.from(chunk).toString(); return true; }, end(chunk = "") { result.body += chunk; } };
    await gateway({ method: "GET", headers: {}, ...req }, res);
    return result;
  };
  try {
    for (const req of [
      { url: "/api/gateway?path=/testnet/api/explorer/blocks&type=block" },
      { url: "/testnet/api/explorer/blocks?type=block", query: { path: "/testnet/api/explorer/blocks", type: "block" } },
      { url: "/testnet/api/explorer/blocks?type=block" },
    ]) assert.equal((await invoke(req)).status, 200);
    assert(calls.every(call => call.url === "https://api.example.invalid/ink/testnet/api/explorer/blocks?type=block"));
    const live = await invoke({ url: "/api/gateway?path=/testnet/api/live/config" });
    assert.equal(JSON.parse(live.body).url, "wss://api.example.invalid/ink/testnet/api/live");
    assert.equal((await invoke({ url: "/api/gateway?path=/testnet/api/live/config", method: "POST" })).status, 405);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousOrigin === undefined) delete process.env.INK_PUBLIC_API_ORIGIN; else process.env.INK_PUBLIC_API_ORIGIN = previousOrigin;
  }
});

test("wallet SDK remains under permissive licenses with patched dependencies", async () => {
  const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
  for (const [path, pkg] of Object.entries(lock.packages)) {
    if (/node_modules\/(?:@walletconnect|@reown)\/[^/]+$/.test(path)) assert(["Apache-2.0", "MIT", "ISC", "0BSD"].includes(pkg.license), `${path}: ${pkg.license}`);
    if (/node_modules\/ws$/.test(path)) assert.equal(pkg.version, "8.21.3");
    if (/node_modules\/decode-uri-component$/.test(path)) assert.equal(pkg.version, "0.5.0");
  }
});

test("only configured HTTPS destinations; legacy tailnet migration stays on the server", () => {
  assert.throws(() => publicApiOrigin({}));
  for (const value of ["http://private.invalid", "https://user:pass@example.invalid", "https://example.invalid/?secret=x"]) assert.throws(() => publicApiOrigin({ INK_PUBLIC_API_ORIGIN: value }));
  assert.equal(publicApiOrigin({ INK_PUBLIC_API_ORIGIN: "https://api.example.invalid/ink/" }), "https://api.example.invalid/ink");
  assert.equal(publicApiOrigin({ VITE_API_ORIGIN: "https://example.ts.net:4189" }), "https://example.ts.net:8443/ink");
});
test("paths cannot redirect, traverse or expose non-API services", () => {
  for (const path of ["https://evil.invalid/api/health", "//evil.invalid/api/health", "/admin", "/api/../../secret", "/api/%2e%2e/secret", "/api/foo/%2e%2e/health", "/api/names/foo%2fsecret", "/api/foo\\secret", "/api/%00secret"]) assert.throws(() => publicApiPath(path));
  assert.equal(publicApiPath("/testnet/api/explorer/blocks?type=block&page=2"), "/testnet/api/explorer/blocks?type=block&page=2");
  assert.equal(publicApiPath("/api/names/domains/test.eth?protocol_id=ens"), "/api/names/domains/test.eth?protocol_id=ens");
  assert.equal(allowedPublicMethod("/api/approvals/0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/state", "POST"), true);
  assert.equal(allowedPublicMethod("/api/overview", "POST"), false);
  assert.equal(allowedPublicMethod("/testnet/api/contract-rpc", "POST"), true);
  assert.equal(allowedPublicMethod("/api/health", "DELETE"), false);
});
test("proxy preserves JSON, query, origin, binary media and status without forwarding credentials", async () => {
  const calls = [];
  const upstream = http.createServer(async (req, res) => {
    let body = ""; for await (const chunk of req) body += chunk;
    calls.push({ url: req.url, headers: req.headers, body });
    if (req.url === "/api/media?url=x") { res.writeHead(200, { "content-type": "image/png", "cache-control": "public, max-age=60" }); return res.end(Buffer.from([0, 255, 1, 128])); }
    res.writeHead(req.url.includes("failure") ? 429 : 200, { "content-type": "application/json" }); res.end(JSON.stringify({ ok: true }));
  });
  await new Promise(resolve => upstream.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${upstream.address().port}`;
  const proxy = http.createServer((req, res) => proxyPublicApi(req, res, { origin, path: req.url }));
  await new Promise(resolve => proxy.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${proxy.address().port}`;
  try {
    const response = await fetch(`${base}/testnet/api/contract-rpc?scope=real`, { method: "POST", headers: { "content-type": "application/json", origin: "https://site.invalid", authorization: "fixture-only", cookie: "fixture=only", "x-forwarded-host": "evil.invalid" }, body: '{"method":"eth_chainId","params":[]}' });
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), { ok: true });
    assert.equal(calls[0].url, "/testnet/api/contract-rpc?scope=real"); assert.equal(calls[0].headers.origin, "https://site.invalid"); assert.equal(calls[0].headers.authorization, undefined); assert.equal(calls[0].headers.cookie, undefined); assert.equal(calls[0].headers["x-forwarded-host"], undefined); assert.equal(calls[0].body, '{"method":"eth_chainId","params":[]}');
    const media = await fetch(`${base}/api/media?url=x`); assert.deepEqual(Buffer.from(await media.arrayBuffer()), Buffer.from([0, 255, 1, 128])); assert.equal(media.headers.get("cache-control"), "public, max-age=60");
    assert.equal((await fetch(`${base}/api/failure`)).status, 429);
    assert.equal((await fetch(`${base}/api/overview`, { method: "POST", body: "{}" })).status, 405);
    assert.equal((await fetch(`${base}/api/live`)).status, 426);
    assert.equal((await fetch(`${base}/api/health`, { method: "HEAD" })).status, 200);
  } finally { await Promise.all([new Promise(resolve => proxy.close(resolve)), new Promise(resolve => upstream.close(resolve))]); }
});

test("cancel expires only its pairing/proposal, preserving unrelated sessions and attempts", () => {
  const cancelled = "a".repeat(64), other = "b".repeat(64), expired = [];
  const client = { proposal: { getAll: () => [{ id: 1, pairingTopic: cancelled }, { id: 2, pairingTopic: other }] }, core: { expirer: { set: (...args) => expired.push(args) } } };
  assert.equal(pairingTopic(`wc:${cancelled}@2?relay-protocol=irn&symKey=fixture`), cancelled);
  assert.equal(pairingTopic("https://evil.invalid"), undefined);
  expireWalletPairing(client, cancelled);
  assert.deepEqual(expired, [[1, 0], [cancelled, 0]]);
  assert.throws(() => expireWalletPairing(client, "invalid"));
});
