import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, cp, symlink, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { acceptsBlockIndexing } from "../server/block-indexing.mjs";
import { proxyPublicApi } from "../server/public-proxy.mjs";

const checks = [];
const output = process.env.BLOCK_INDEXING_SERVER_OUTPUT || "reports/block-indexing-server";
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const listen = server => new Promise(resolve => server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${server.address().port}`)));
const close = server => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); });
const quantity = value => `0x${BigInt(value).toString(16)}`;
const hash = value => `0x${BigInt(value).toString(16).padStart(64, "0")}`;
const indexingAccept = "application/vnd.ink.indexing+json, application/json";
let passed = false;

function reviewAccept() {
  const media = "application/vnd.ink.indexing+json";
  for (const accept of [indexingAccept, media.toUpperCase(), ` application/json , ${media} ; Q=0.5 `, `${media};version="1;2,3";q=1.000`]) {
    assert.equal(acceptsBlockIndexing(accept), true, String(accept));
  }
  for (const accept of [undefined, null, [], "", "*/*", "application/json", `x-${media}`, `${media}x`, `${media}/json`,
    `"${media}"`, `${media};q=0`, `${media};Q=0.000`, `${media};q=0;other=1`, `${media};q=1;q=0`,
    `${media};q=1;q=1`, `${media};q=1.1`, `${media};q=0.0001`, `${media};q=-1`, `${media};q=foo`,
    `${media};q="0.5"`, `${media};q`, `${media};`, `${media};version=`, `${media};version="unterminated`,
    `application/json;version="${media}"`, `application/json;version="other,${media};q=1`, `${media}\r\n`,
  ]) assert.equal(acceptsBlockIndexing(accept), false, String(accept));
  checks.push("Accept parser: exact case-insensitive media elements, valid parameters and positive quality only");
  console.log(`PASS ${checks.at(-1)}`);
}

async function review(chainId) {
  const temp = await mkdtemp(join(tmpdir(), "ink-block-indexing-"));
  let child, log = "";
  const state = { indexStatus: 404, rpcChain: chainId, sync: false, latestAge: 1,
    blockAge: 8, unknown: false, wrongNumber: false, wrongHash: false,
    orphan: false, rpcStatus: 200, rpcMalformed: false, malformedBlock: false,
    holdNumber: null, releaseProof: undefined, clock: Math.floor(Date.now() / 1000) };
  const upstreamHits = [], calls = [];
  const blockAt = (number, latest = false) => ({
    number: quantity(number), hash: hash(number),
    timestamp: quantity(state.clock - (latest ? state.latestAge : state.blockAge)),
    transactions: [hash(42)],
  });
  const indexed = path => path.endsWith("/transactions")
    ? { items: [{ hash: hash(42), block_number: 995 }], next_page_params: { index: 1, block_number: 995 } }
    : { height: 995, hash: hash(995), transaction_fees: "12345678901234567890", marker: "real index response" };
  const fixture = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      if (req.method === "POST" && url.pathname === "/rpc") {
        let text = ""; for await (const chunk of req) text += chunk;
        const body = JSON.parse(text), { method, params = [] } = body;
        calls.push({ method, params });
        let result = null;
        if (method === "eth_chainId") result = quantity(state.rpcChain);
        else if (method === "eth_syncing") result = state.sync;
        else if (method === "eth_getTransactionByHash" && params[0] === hash(42)) result = {hash:hash(42),blockHash:hash(995),blockNumber:quantity(995)};
        else if (method === "eth_getBlockByNumber" && params[0] === "latest") result = blockAt(1000, true);
        else if (method === "eth_getBlockByNumber" || method === "eth_getBlockByHash") {
          const number = Number(BigInt(params[0]));
          if (number === state.holdNumber) await new Promise(resolve => { state.releaseProof = resolve; });
          if (!state.unknown) {
            result = blockAt(state.wrongNumber ? number + 1 : number);
            if (state.wrongHash || (state.orphan && method === "eth_getBlockByNumber")) result.hash = hash(number + 1);
            if (state.malformedBlock) result.number = "0x00";
          }
        } else if (method === "net_peerCount" || method === "eth_gasPrice") result = "0x1";
        res.writeHead(state.rpcStatus, { "content-type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", id: state.rpcMalformed ? 99 : body.id, result }));
      } else if (url.pathname.startsWith("/blocks/")) {
        upstreamHits.push(req.url);
        res.writeHead(state.indexStatus, { "content-type": "application/json" });
        res.end(JSON.stringify(state.indexStatus === 200 ? indexed(url.pathname) : { error: "Upstream returned 404" }));
      } else if (url.pathname.startsWith("/transactions/")) {
        res.writeHead(404, { "content-type": "application/json" }); res.end('{"error":"Not found"}');
      } else {
        res.writeHead(200, { "content-type": "application/json" }); res.end("{}");
      }
    } catch (error) {
      res.writeHead(500, { "content-type": "application/json" }); res.end(JSON.stringify({ error: error.message }));
    }
  });
  const api = await listen(fixture);
  const probe = createServer(), allocated = await listen(probe);
  const port = new URL(allocated).port; await close(probe);
  const record = name => { checks.push(`${chainId}: ${name}`); console.log(`PASS ${chainId}: ${name}`); };
  try {
    await cp("server", join(temp, "server"), { recursive: true });
    await cp("src", join(temp, "src"), { recursive: true });
    await cp("package.json", join(temp, "package.json"));
    await mkdir(join(temp, "dist"));
    await symlink(resolve("node_modules"), join(temp, "node_modules"));
    await mkdir(join(temp, "data/upstream-cache"), { recursive: true });
    const staleUrl = `${api}/blocks/850`, staleAt = Date.now() - 60000;
    const staleFile = join(temp, "data/upstream-cache", `${createHash("sha256").update(staleUrl).digest("hex")}.json`);
    await writeFile(staleFile, JSON.stringify({ url: staleUrl, at: staleAt, value: { height: 850, hash: hash(850), marker: "known old snapshot" } }));
    child = spawn(process.execPath, ["server/server.mjs"], { cwd: temp, env: {
      ...process.env, HOST: "127.0.0.1", PORT: port, INK_NETWORK: chainId === 57073 ? "mainnet" : "sepolia",
      BLOCKSCOUT_API: api, BLOCKSCOUT_STATS_API: api, CONTRACT_INFO_API: api,
      INK_RPC: `${api}/rpc`, INK_OP_NODE_RPC: `${api}/rpc`, INK_METRICS_URL: `${api}/metrics`,
      INK_RPC_WS: "ws://127.0.0.1:1/unavailable",
      INK_L1_FAILOVER_STATUS: `${api}/readyz`, INK_PUBLIC_RPC: "http://127.0.0.1:1/unavailable",
    }, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", chunk => { log += chunk; }); child.stderr.on("data", chunk => { log += chunk; });
    let ready = false;
    for (let i = 0; i < 100; i++) { if (child.exitCode !== null) break; try { if ((await fetch(`${allocated}/api/health`, { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch {} await wait(50); }
    assert.ok(ready, log);
    const get = async (suffix, accept = indexingAccept) => {
      state.clock = Math.floor(Date.now() / 1000);
      // node:http lets the legacy case omit Accept entirely (fetch adds */*).
      return new Promise((resolve, reject) => {
        const req = request(`${allocated}/api/explorer/${suffix}`, { headers: accept === null ? {} : { accept } }, res => {
          let text = ""; res.setEncoding("utf8"); res.on("data", chunk => { text += chunk; }); res.on("error", reject);
          res.on("end", () => {
            try { resolve({ response: { status: res.statusCode, headers: new Headers(res.headers) }, body: JSON.parse(text) }); }
            catch (error) { reject(error); }
          });
        });
        req.on("error", reject); req.end();
      });
    };
    const expected = number => ({ code: "BLOCK_INDEXING", chainId, block: { number: String(number), hash: hash(number) }, retryAfterMs: 3000 });
    const pending = async (suffix, number = 995) => {
      const { response, body } = await get(suffix);
      assert.equal(response.status, 202, `${suffix}: ${JSON.stringify(body)}`);
      assert.deepEqual(body, expected(number));
      assert.equal(response.headers.get("retry-after"), "3");
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(response.headers.get("x-ink-data-status"), null, "Pending is not an indexed fresh/stale snapshot");
      return body;
    };
    for (const suffix of ["blocks/995", "blocks/995/transactions", `blocks/${hash(995)}`, `blocks/${hash(995)}/transactions`]) await pending(suffix);
    record("both number/hash detail and transaction routes expose the exact proven 202 contract");
    for (const [name, accept] of [
      ["absent", null], ["generic JSON", "application/json"], ["wildcard", "*/*"],
      ["malformed media substring", "application/vnd.ink.indexing+jsonx, application/json"],
      ["zero quality", "application/vnd.ink.indexing+json;q=0, application/json"],
      ["duplicate quality", "application/vnd.ink.indexing+json;q=1;q=0"],
      ["invalid quality", "application/vnd.ink.indexing+json;q=2"],
    ]) {
      const proofCalls = () => calls.filter(call => (call.method === "eth_getBlockByNumber" && call.params[0] === quantity(992)) || (call.method === "eth_getBlockByHash" && call.params[0] === hash(992))).length;
      const beforeLegacy = proofCalls();
      for (const suffix of ["blocks/992", "blocks/992/transactions", `blocks/${hash(992)}`, `blocks/${hash(992)}/transactions`]) {
        const result = await get(suffix, accept);
        assert.equal(result.response.status, 502, name); assert.deepEqual(result.body, { error: "Upstream returned 404" }, name);
        assert.equal(result.response.headers.get("retry-after"), null, name);
      }
      assert.equal(proofCalls(), beforeLegacy, "Legacy clients never trigger a local block proof");
      record(`${name} Accept preserves legacy 502 on all four routes without local proof RPC`);
    }
    const negotiated = await get("blocks/992", "application/json, APPLICATION/VND.INK.INDEXING+JSON ; Q=0.5");
    assert.equal(negotiated.response.status, 202); assert.deepEqual(negotiated.body, expected(992));
    record("explicit media selection accepts case and quality parameters over HTTP");
    const proxy = createServer((req, res) => proxyPublicApi(req, res, { origin: allocated, path: req.url }));
    const proxyUrl = await listen(proxy);
    try {
      const response = await fetch(`${proxyUrl}/api/explorer/blocks/991`, { headers: { accept: indexingAccept } });
      assert.equal(response.status, 202); assert.deepEqual(await response.json(), expected(991));
      assert.equal(response.headers.get("retry-after"), "3"); assert.equal(response.headers.get("cache-control"), "no-store");
      const legacy = await fetch(`${proxyUrl}/api/explorer/blocks/991`, { headers: { accept: "application/json" } });
      assert.equal(legacy.status, 502); assert.deepEqual(await legacy.json(), { error: "Upstream returned 404" });
      record("public proxy preserves explicit Accept, exact 202 JSON, Retry-After and no-store while retaining legacy errors");
    } finally { await close(proxy); }
    const before = upstreamHits.length;
    await pending("blocks/995"); await pending("blocks/995");
    assert.equal(upstreamHits.length, before + 2, "Pending responses never bypass a new index lookup");
    const pendingFile = join(temp, "data/upstream-cache", `${createHash("sha256").update(`${api}/blocks/995`).digest("hex")}.json`);
    await assert.rejects(readFile(pendingFile), { code: "ENOENT" });
    record("pending responses are neither retained in memory nor persisted to the index cache");

    state.holdNumber = 996;
    const beforeProof = calls.filter(call => call.method === "eth_getBlockByNumber" && call.params[0] === quantity(996)).length;
    const both = Promise.all([pending("blocks/996", 996), pending("blocks/996/transactions", 996)]);
    for (let i = 0; i < 100 && !(state.releaseProof && upstreamHits.includes("/blocks/996") && upstreamHits.includes("/blocks/996/transactions")); i++) await wait(10);
    assert.ok(state.releaseProof, "Proof RPC is in flight");
    await wait(30);
    assert.equal(calls.filter(call => call.method === "eth_getBlockByNumber" && call.params[0] === quantity(996)).length, beforeProof + 1, "Concurrent detail/transaction routes share one proof");
    state.holdNumber = null; state.releaseProof(); await both;
    await pending("blocks/996", 996);
    assert.equal(calls.filter(call => call.method === "eth_getBlockByNumber" && call.params[0] === quantity(996)).length, beforeProof + 2, "Completed proof is not cached");
    record("concurrent routes deduplicate local proof only while it is in flight");

    for (const [name, change, suffix] of [
      ["wrong chain", { rpcChain: chainId === 57073 ? 763373 : 57073 }, "blocks/994"],
      ["execution syncing", { sync: { currentBlock: "0x1" } }, "blocks/994"],
      ["stale local head", { latestAge: 121 }, "blocks/994"],
      ["future local head", { latestAge: -60 }, "blocks/994"],
      ["older than 120 blocks", {}, "blocks/879"],
      ["older than five minutes", { blockAge: 301 }, "blocks/994"],
      ["future requested block", {}, "blocks/1001"],
      ["unknown local block", { unknown: true }, "blocks/994"],
      ["wrong returned height", { wrongNumber: true }, "blocks/994"],
      ["wrong returned hash", { wrongHash: true }, `blocks/${hash(994)}`],
      ["orphan hash at a canonical height", { orphan: true }, `blocks/${hash(994)}`],
      ["malformed block quantity", { malformedBlock: true }, "blocks/994"],
      ["HTTP-unavailable local RPC", { rpcStatus: 503 }, "blocks/994"],
      ["mismatched RPC response id", { rpcMalformed: true }, "blocks/994"],
    ]) {
      const previous = Object.fromEntries(Object.keys(change).map(key => [key, state[key]])); Object.assign(state, change);
      const { response, body } = await get(suffix);
      assert.equal(response.status, 502, name); assert.equal(body.code, undefined, name); assert.match(body.error, /Upstream returned 404/);
      Object.assign(state, previous); record(`${name} cannot claim indexing`);
    }
    await pending("blocks/880", 880); record("the 120-block recent boundary remains supported");
    const ordinaryMissing = await get(`transactions/${hash(994)}`);
    assert.equal(ordinaryMissing.response.status, 502); assert.equal(ordinaryMissing.body.code, undefined);
    record("non-block index 404 keeps its original error behavior");
    const txAccept="application/vnd.ink.transaction-indexing+json, application/json";
    const txPending=await get(`transactions/${hash(42)}`,txAccept);
    assert.equal(txPending.response.status,202);assert.deepEqual(txPending.body,{code:"TRANSACTION_INDEXING",chainId,transaction:{hash:hash(42),blockNumber:"995",blockHash:hash(995)},retryAfterMs:1000});
    assert.equal(txPending.response.headers.get("retry-after"),"1");assert.equal(txPending.response.headers.get("cache-control"),"no-store");
    assert.equal((await get(`transactions/${hash(42)}`,"application/json")).response.status,502);
    assert.equal((await get(`transactions/${hash(43)}`,txAccept)).response.status,502);
    for(const change of [{orphan:true},{rpcChain:0},{blockAge:121},{sync:{currentBlock:"0x1"}},{unknown:true}]){
      const previous=Object.fromEntries(Object.keys(change).map(key=>[key,state[key]]));Object.assign(state,change);
      assert.equal((await get(`transactions/${hash(42)}`,txAccept)).response.status,502,JSON.stringify(change));Object.assign(state,previous);
    }
    record("transaction indexing requires explicit opt-in, correct chain, recent canonical inclusion and a synced node");
    state.indexStatus = 502;
    const beforeFailure = calls.filter(call => call.method === "eth_getBlockByNumber" && call.params[0] === quantity(993)).length;
    const actualFailure = await get("blocks/993");
    assert.equal(actualFailure.response.status, 502); assert.match(actualFailure.body.error, /Upstream returned 502/);
    assert.equal(calls.filter(call => call.method === "eth_getBlockByNumber" && call.params[0] === quantity(993)).length, beforeFailure);
    record("a real upstream 502 with a misleading 404 body stays an error and does not probe a block");

    state.indexStatus = 503;
    const stale = await get("blocks/850");
    assert.equal(stale.response.status, 200); assert.equal(stale.body.marker, "known old snapshot");
    assert.equal(stale.response.headers.get("x-ink-data-status"), "stale");
    assert.equal(stale.response.headers.get("x-ink-data-fetched-at"), new Date(staleAt).toISOString());
    assert.equal(JSON.parse(await readFile(staleFile)).at, staleAt);
    record("an existing stale snapshot retains its provenance and original timestamp on transient outage");

    state.indexStatus = 200;
    for (const suffix of ["blocks/995", "blocks/995/transactions", `blocks/${hash(995)}`, `blocks/${hash(995)}/transactions`]) {
      const result = await get(suffix);
      assert.equal(result.response.status, 200); assert.deepEqual(result.body, indexed(`/${suffix}`));
      assert.equal(result.response.headers.get("retry-after"), null);
      assert.equal(result.response.headers.get("x-ink-data-status"), "fresh");
    }
    record("404 to 202 to 200 returns exact indexed metadata, fees and paginated transactions immediately");
    for (const accept of [null, "application/json", "application/vnd.ink.indexing+json;q=0"]) {
      for (const suffix of ["blocks/995", "blocks/995/transactions", `blocks/${hash(995)}`, `blocks/${hash(995)}/transactions`]) {
        const result = await get(suffix, accept);
        assert.equal(result.response.status, 200); assert.deepEqual(result.body, indexed(`/${suffix}`));
        assert.equal(result.response.headers.get("retry-after"), null);
      }
    }
    record("legacy and opted-out clients retain exact indexed 200 responses on all four routes");
    const hitCount = upstreamHits.length;
    state.indexStatus = 503;
    const cached = await get("blocks/995");
    assert.equal(cached.response.status, 200); assert.deepEqual(cached.body, indexed("/blocks/995")); assert.equal(upstreamHits.length, hitCount);
    record("successful indexed responses keep their existing cache behavior");
  } finally {
    state.holdNumber = null; state.releaseProof?.();
    if (child && child.exitCode === null && child.signalCode === null) { const exited = new Promise(resolve => child.once("close", resolve)); child.kill("SIGTERM"); await exited; }
    await close(fixture); await rm(temp, { recursive: true, force: true });
  }
}

try { reviewAccept(); await review(57073); await review(763373); passed = true; }
finally {
  await mkdir(output, { recursive: true });
  await writeFile(join(output, "results.json"), JSON.stringify({ recordedAt: new Date().toISOString(), passed, checks, publicTransactions: 0, scope: "Real disposable explorer HTTP services; isolated index and local-node fixtures on both networks." }, null, 2));
}
console.log(`Block indexing server passed: ${checks.length} checks on two isolated networks.`);
