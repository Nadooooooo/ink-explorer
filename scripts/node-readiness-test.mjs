import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { nodeReadiness } from "../server/node-readiness.mjs";
import { createContractRpc } from "../server/contract-rpc.mjs";

const now = 1800000000000;
const block = age => ({ number: "0x10", timestamp: `0x${(now / 1000 - age).toString(16)}` });
test("A stranded or future-dated head is not operational", () => {
  for (const age of [121, 600, -31]) {
    const result = nodeReadiness({ chain: "0xba5ed", expectedChainId: 763373, sync: false, block: block(age), now });
    assert.equal(result.online, true); assert.equal(result.synced, false); assert.equal(result.stale, true);
  }
});
test("Only a current block on the expected, fully synced chain is ready", () => {
  assert.equal(nodeReadiness({ chain: 763373, expectedChainId: 763373, sync: false, block: block(1), now }).synced, true);
  for (const overrides of [{ chain: 57073 }, { sync: {} }, { block: null }, { block: { number: "0x0", timestamp: block(0).timestamp } }, { block: { number: "0x10" } }]) {
    assert.equal(nodeReadiness({ chain: 763373, expectedChainId: 763373, sync: false, block: block(1), now, ...overrides }).synced, false);
  }
});

const listen = server => new Promise(resolve => server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${server.address().port}`)));
const close = server => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); });
test("Contract HTTP reads reject stale local data and label the public fallback", async () => {
  let localAge = 600, localChain = 763373, localSync = false;
  const calls = [];
  const fixture = source => http.createServer(async (req, res) => {
    let body = ""; for await (const chunk of req) body += chunk;
    const { method } = JSON.parse(body);
    calls.push({ source, method });
    const result = method === "eth_chainId" ? `0x${(source === "local" ? localChain : 763373).toString(16)}`
      : method === "eth_syncing" ? localSync
      : method === "eth_getBlockByNumber" ? { number: "0x10", timestamp: `0x${(Math.floor(Date.now() / 1000) - localAge).toString(16)}` }
      : "0x";
    res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ jsonrpc: "2.0", id: 1, result }));
  });
  const local = fixture("local"), remote = fixture("public");
  const localUrl = await listen(local), publicUrl = await listen(remote);
  try {
    for (const [name, age, chain, sync, expected] of [
      ["stranded", 600, 763373, false, "public"],
      ["current", 1, 763373, false, "local"],
      ["wrong chain", 1, 57073, false, "public"],
      ["syncing", 1, 763373, {}, "public"],
    ]) {
      localAge = age; localChain = chain; localSync = sync;
      const server = http.createServer(createContractRpc({ localUrl, publicUrl, chainId: 763373 }));
      const url = await listen(server);
      try {
        const response = await fetch(url, { method: "POST", body: JSON.stringify({ method: "eth_call", params: [{ to: "0x4200000000000000000000000000000000000006", data: "0x06fdde03" }, "latest"] }) });
        const result = await response.json();
        assert.equal(response.status, 200, name); assert.equal(result.source, expected, name); assert.equal(result.chainId, 763373, name);
        if (expected === "public") assert(!calls.some(item => item.source === "local" && item.method === "eth_call"), name);
        calls.length = 0;
        const malformed = await fetch(url, { method: "POST", body: "{" }); assert.equal(malformed.status, 400);
        const prohibited = await fetch(url, { method: "POST", body: JSON.stringify({ method: "eth_sendTransaction", params: [] }) }); assert.equal(prohibited.status, 400);
      } finally { await close(server); }
    }
  } finally { await close(local); await close(remote); }
});
