import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { guardWalletRelay } from "../src/wallet-relay.ts";

function relay() {
  const value = new EventEmitter();
  value.provider = new EventEmitter();
  value.closed = 0;
  value.transportClose = async () => { value.closed++; };
  return value;
}

test("denied origin fails immediately on the SDK connection and stops only that relay", async () => {
  const own = relay(), other = relay();
  const pending = guardWalletRelay(own, () => new Promise(() => {}));
  own.provider = new EventEmitter();
  own.emit("relayer_connect");
  own.provider.emit("payload", { error: { code: 3000, message: "Unauthorized: origin not allowed" } });
  await assert.rejects(pending, /walletConnectOriginDenied/);
  assert.equal(own.closed, 1);
  assert.equal(other.closed, 0);
  assert.equal(own.provider.listenerCount("payload"), 0);
  assert.equal(own.listenerCount("relayer_connect"), 0);
});

test("a stalled initialization times out and closes a late SDK result", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const own = relay(); let finish;
  const pending = guardWalletRelay(own, () => new Promise(resolve => { finish = resolve; }));
  await Promise.resolve();
  t.mock.timers.tick(30000);
  await assert.rejects(pending, /walletConnectUnavailable/);
  assert.equal(own.closed, 1);
  finish(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(own.closed, 2);
});

test("displayed QR keeps its scanning time while cancellation remains immediate", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const own = relay(), pairing = new EventEmitter(), controller = new AbortController();
  const pending = guardWalletRelay(own, () => new Promise(() => {}), controller.signal, pairing);
  pairing.emit("display_uri", "temporary");
  t.mock.timers.tick(60000);
  assert.equal(own.closed, 0);
  controller.abort();
  await assert.rejects(pending, /walletConnectExpired/);
  assert.equal(own.closed, 1);
  assert.equal(pairing.listenerCount("display_uri"), 0);
});

test("canceled initialization can retry on a fresh relay without closing it", async () => {
  const own = relay(), fresh = relay(), controller = new AbortController();
  const pending = guardWalletRelay(own, () => new Promise(() => {}), controller.signal);
  controller.abort();
  await assert.rejects(pending, /walletConnectExpired/);
  assert.equal(await guardWalletRelay(fresh, async () => "connected"), "connected");
  assert.equal(fresh.closed, 0);
});
