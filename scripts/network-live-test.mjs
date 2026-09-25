import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import WebSocket from "ws";

const base = process.env.BASE_URL || "http://127.0.0.1:4188";
async function review(path, chainId) {
  const endpoint = `${base}${path}/api/live`.replace(/^http/, "ws");
  const frames = [];
  await new Promise((resolve, reject) => {
    const socket = new WebSocket(endpoint);
    let done = false;
    const finish = error => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      socket.terminate();
      error ? reject(error) : resolve();
    };
    const timeout = setTimeout(() => finish(new Error(`No advancing stream: ${endpoint}`)), 20000);
    socket.on("error", finish);
    socket.on("close", () => { if (!done) finish(new Error(`Premature close: ${endpoint}`)); });
    socket.on("message", raw => {
      try {
        const frame = JSON.parse(String(raw));
        assert.equal(frame.protocol, "ink-observer.live.v1");
        assert.equal(frame.network.chainId, chainId);
        assert.equal(frame.network.expectedChainId, chainId);
        assert.ok(Array.isArray(frame.transactions));
        if (!frame.network.synced) {
          assert.equal(frame.block, null, "Unready nodes must not publish old blocks");
          assert.deepEqual(frame.transactions, []);
          assert.notEqual(frame.type, "block");
        } else {
          assert.ok(frame.block?.height > 0 && frame.block?.hash);
          assert.ok(frame.network.blockAgeSeconds >= -30 && frame.network.blockAgeSeconds <= 120);
        }
        if (frames.length) assert.ok(frame.sequence > frames.at(-1).sequence);
        frames.push({ type: frame.type, sequence: frame.sequence, chainId, synced: frame.network.synced, head: frame.block?.height ?? null });
        if (frames.length >= 3) finish();
      } catch (error) { finish(error); }
    });
  });
  const network = await fetch(`${base}${path}/api/network`).then(response => {
    assert.equal(response.status, 200);
    return response.json();
  });
  assert.equal(network.chainId, chainId);
  return { endpoint, result: "passed", frames };
}

const results = await Promise.all([review("", 57073), review("/testnet", 763373)]);
await mkdir("screenshots/network-live", { recursive: true });
await writeFile("screenshots/network-live/results.json", JSON.stringify({ recordedAt: new Date().toISOString(), results }, null, 2));
console.log(JSON.stringify(results, null, 2));
