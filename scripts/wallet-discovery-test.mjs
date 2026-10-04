import assert from "node:assert/strict";
import { test } from "node:test";

const first = "11111111-1111-4111-8111-111111111111";
const second = "22222222-2222-4222-8222-222222222222";
const announce = (target, uuid, name, provider) => target.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: { info: { uuid, name }, provider } }));
async function setup(t) {
  const old = globalThis.window;
  globalThis.window = new EventTarget();
  t.after(() => { globalThis.window = old; });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const module = await import(`../src/wallet-discovery.ts?test=${crypto.randomUUID()}`);
  const discover = async () => { const pending = module.discoverInjectedWallets(); t.mock.timers.tick(250); return pending; };
  return { target: globalThis.window, module, discover };
}

test("modern and legacy announcements deduplicate the same provider without requesting accounts", async t => {
  const { target, discover } = await setup(t); let requests = 0;
  const provider = { request: () => { requests++; }, isMetaMask: true };
  target.ethereum = provider;
  target.addEventListener("eip6963:requestProvider", () => { announce(target, first, "MetaMask", provider); announce(target, first, "MetaMask", provider); });
  const wallets = await discover();
  assert.equal(wallets.length, 1); assert.equal(wallets[0].provider, provider); assert.equal(requests, 0);
});

test("late injection updates the open selector and preserves the provider originally selected", async t => {
  const { target, module, discover } = await setup(t);
  assert.deepEqual(await discover(), []);
  const observed = [], unsubscribe = module.subscribeInjectedWallets(value => observed.push(value));
  const rabby = { request() {} }, meta = { request() {} };
  announce(target, first, "Rabby", rabby); announce(target, second, "MetaMask", meta);
  assert.equal(observed.at(-1).length, 2);
  assert.equal(observed.at(-1).find(wallet => wallet.name === "Rabby").provider, rabby);
  unsubscribe(); announce(target, first, "Rabby updated", rabby);
  assert.equal(observed.length, 2); assert.equal(module.injectedWalletName(rabby), "Rabby updated");
});

test("malformed announcements and UUID collisions do not replace another provider", async t => {
  const { target, discover } = await setup(t); const original = { request() {} };
  target.addEventListener("eip6963:requestProvider", () => {
    announce(target, first, "Original", original);
    announce(target, first, "Impersonator", { request() {} });
    announce(target, "invalid", "Invalid", { request() {} });
    announce(target, second, "x".repeat(129), { request() {} });
    announce(target, second, "Invalid provider", {});
  });
  const wallets = await discover(); assert.equal(wallets.length, 1); assert.equal(wallets[0].provider, original);
});

test("legacy multi-wallet browsers retain separate providers and prefer Rabby detection", async t => {
  const { target, discover } = await setup(t);
  const rabby = { request() {}, isMetaMask: true, isRabby: true }, meta = { request() {}, isMetaMask: true };
  target.ethereum = { providers: [rabby, meta, rabby] };
  const wallets = await discover(); assert.equal(wallets.length, 2); assert.equal(wallets.find(wallet => wallet.provider === rabby).name, "Rabby");
});
