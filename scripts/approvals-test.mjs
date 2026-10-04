import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import solc from "solc";
import { ContractFactory, JsonRpcProvider, zeroPadValue, id } from "ethers";
import { chromium, firefox, webkit } from "playwright";
import { createApprovals, decodeApproval, validateApproval } from "../server/approvals.mjs";
import { walletCopy } from "../src/wallet-copy.ts";
import { revokeData, approvalAmount } from "../src/approval-data.ts";

const checks = [], check = (name, condition) => { assert(condition, name); checks.push(name); console.log(`PASS ${name}`); };
const base = process.env.BASE_URL || "http://127.0.0.1:4298";
let anvil = spawn("node_modules/.bin/anvil", ["--host", "127.0.0.1", "--port", "18548", "--chain-id", "57073", "--silent"], { stdio: "ignore" });
const rpcUrl = "http://127.0.0.1:18548";
let rpc = new JsonRpcProvider(rpcUrl, 57073, { staticNetwork: true, batchMaxCount: 1 });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let browser;
try {
  for (let i = 0; ; i++) { try { await rpc.send("eth_chainId", []); break; } catch (e) { if (i > 40) throw e; await wait(150); } }
  let signer = await rpc.getSigner(0);
  const owner = (await signer.getAddress()).toLowerCase(), spender = (await (await rpc.getSigner(1)).getAddress()).toLowerCase();
  const source = await readFile("scripts/fixtures/Approvals.sol", "utf8");
  const compiled = JSON.parse(solc.compile(JSON.stringify({ language: "Solidity", sources: { "Approvals.sol": { content: source } }, settings: { evmVersion: "paris", outputSelection: { "*": { "*": ["abi", "evm.bytecode"] } } } })));
  assert(!compiled.errors?.some(error => error.severity === "error"));
  const deployed = [];
  for (const name of ["Approval20", "Approval721", "Approval1155"]) {
    const artifact = compiled.contracts["Approvals.sol"][name];
    const contract = await new ContractFactory(artifact.abi, artifact.evm.bytecode.object, signer).deploy(); await contract.waitForDeployment(); deployed.push(contract);
  }
  let [erc20, erc721, erc1155] = deployed;
  const tokenId = "900719925474099312345";
  const approve = async () => {
    await (await erc20.approve(spender, 2n ** 256n - 1n)).wait();
    await (await erc721.approve(spender, tokenId)).wait();
    await (await erc721.setApprovalForAll(spender, true)).wait();
    await (await erc1155.setApprovalForAll(spender, true)).wait();
  };
  await approve();
  const fetcher = async (url, init) => {
    if (String(url).startsWith("https://index.invalid")) {
      const q = new URL(url).searchParams;
      const logs = await rpc.send("eth_getLogs", [{ fromBlock: `0x${Number(q.get("fromBlock")).toString(16)}`, toBlock: `0x${Number(q.get("toBlock")).toString(16)}`, topics: [q.get("topic0"), q.get("topic1")] }]);
      return Response.json({ status: logs.length ? "1" : "0", message: logs.length ? "OK" : "No logs found", result: logs });
    }
    return fetch(url, init);
  };
  const approvals = createApprovals({ chainId: 57073, localUrl: rpcUrl, publicUrl: rpcUrl, logsUrl: "https://index.invalid/api", fetcher });
  const events = await approvals.events(owner, new URLSearchParams());
  check("all ERC-20 / ERC-721 token and operator / ERC-1155 events discovered", events.complete && events.items.length === 4);
  let state = await approvals.state(owner, events.items);
  check("current state checked against the isolated canonical EVM", state.items.every(item => item.active === true) && /^0x[\da-f]{64}$/i.test(state.blockHash));
  check("ERC-1155 classified through ERC-165", state.items.some(item => item.standard === "erc1155"));
  const nft = state.items.find(item => item.kind === "erc721");
  check("NFT IDs retain precision beyond JavaScript integers", nft.tokenId === tokenId);
  const twenty = state.items.find(item => item.kind === "erc20");
  check("uint256 unlimited allowance stays exact", approvalAmount(twenty, "Unlimited", "raw") === "Unlimited");
  assert.throws(() => validateApproval({ ...nft, tokenId: (2n ** 256n).toString() }));
  assert.throws(() => decodeApproval({ address: nft.token, topics: [id("Approval(address,address,uint256)"), zeroPadValue(spender, 32), zeroPadValue(owner, 32)], data: zeroPadValue("0x01", 32), blockNumber: "0x1", logIndex: "0x0", transactionHash: `0x${"1".repeat(64)}` }, owner, 0, 10));
  checks.push("reject out-of-scope owner and oversized NFT IDs");
  for (const item of state.items) await (await signer.sendTransaction({ to: item.token, data: revokeData(item) })).wait();
  state = await approvals.state(owner, events.items);
  check("each actual revoke transaction clears its permission", state.items.every(item => item.active === false));
  check("ERC-20 revoke sets zero without changing NFT grants", await erc20.allowance(owner, spender) === 0n);
  assert.throws(() => revokeData({ ...twenty, active: null })); checks.push("unverified state cannot generate a revoke transaction");
  // Simulate a saturated index and same-block boundary; discovery must split,
  // and must refuse to certify an unsplittable block with >= 1000 events.
  const rangedCalls = [];
  const saturated = createApprovals({ chainId: 57073, localUrl: rpcUrl, publicUrl: rpcUrl, logsUrl: "https://index.invalid/api", fetcher: async (url, init) => {
    if (!String(url).startsWith("https://index.invalid")) return fetch(url, init);
    const q = new URL(url).searchParams; const from = Number(q.get("fromBlock")), to = Number(q.get("toBlock")); rangedCalls.push([from, to]);
    if (to - from > 2) return Response.json({ status: "1", message: "OK", result: Array(1000).fill({}) });
    return Response.json({ status: "0", message: "No logs found", result: [] });
  } });
  const partial = await saturated.events(owner, new URLSearchParams());
  check("saturated history returns a contiguous continuation instead of false completeness", !partial.complete && partial.next.from === partial.through + 1 && rangedCalls.length > 2);
  const unsplittable = createApprovals({ chainId: 57073, localUrl: rpcUrl, publicUrl: rpcUrl, logsUrl: "https://index.invalid/api", fetcher: async (url, init) => String(url).startsWith("https://index.invalid") ? Response.json({ status: "1", message: "OK", result: Array(1000).fill({}) }) : fetch(url, init) });
  await assert.rejects(unsplittable.events(owner, new URLSearchParams("from=1&to=1")), /approvalHistoryIncomplete/); checks.push("single saturated block produces a visible failure");
  for (const [engine, locale, width, prefix, testChain] of [
    [chromium, "fr", 390, "", 57073], [firefox, "en", 1440, "", 57073], [webkit, "ar", 320, "", 57073],
    [chromium, "fr", 390, "/testnet", 763373], [firefox, "en", 1440, "/testnet", 763373], [webkit, "ar", 320, "/testnet", 763373],
  ]) {
    if (Number(await rpc.send("eth_chainId", [])) !== testChain) {
      await rpc.destroy();
      const exited = new Promise(resolve => anvil.once("exit", resolve)); anvil.kill("SIGTERM"); await exited;
      anvil = spawn("node_modules/.bin/anvil", ["--host", "127.0.0.1", "--port", "18548", "--chain-id", String(testChain), "--silent"], { stdio: "ignore" });
      rpc = new JsonRpcProvider(rpcUrl, testChain, { staticNetwork: true, batchMaxCount: 1 });
      for (let attempt = 0; ; attempt++) { try { await rpc.send("eth_chainId", []); break; } catch (e) { if (attempt > 40) throw e; await wait(150); } }
      signer = await rpc.getSigner(0);
      const fresh = [];
      for (const name of ["Approval20", "Approval721", "Approval1155"]) {
        const artifact = compiled.contracts["Approvals.sol"][name];
        const contract = await new ContractFactory(artifact.abi, artifact.evm.bytecode.object, signer).deploy(); await contract.waitForDeployment(); fresh.push(contract);
      }
      [erc20, erc721, erc1155] = fresh;
    }
    const networkApprovals = createApprovals({ chainId: testChain, localUrl: rpcUrl, publicUrl: rpcUrl, logsUrl: "https://index.invalid/api", fetcher });
    await approve();
    browser = await engine.launch({ headless: true, ...(engine === chromium ? { executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] } : {}) });
    const page = await browser.newPage({ viewport: { width, height: 850 } });
    const runtime = [], sent = [];
    page.on("pageerror", error => runtime.push(error.message));
    await page.exposeFunction("approvalTestRequest", async request => {
      if (request.method === "eth_requestAccounts" || request.method === "eth_accounts") return [owner];
      if (request.method === "eth_chainId") return `0x${testChain.toString(16)}`;
      if (request.method === "eth_sendTransaction") {
        sent.push(request.params[0]);
        check(`${engine.name()} ${testChain}: wallet receives zero-value transaction on correct chain`, request.params[0].value === "0x0" && Number(request.params[0].chainId) === testChain);
        const { chainId, ...tx } = request.params[0]; return rpc.send("eth_sendTransaction", [tx]);
      }
      throw new Error("Unexpected wallet method");
    });
    await page.addInitScript(() => {
      const listeners = {};
      window.ethereum = { request: args => args.method === "eth_sendTransaction" && window.approvalTestReject ? Promise.reject(Object.assign(new Error("Rejected"), { code: 4001 })) : window.approvalTestRequest(args), on: (name, listener) => { (listeners[name] ||= []).push(listener); }, removeListener: (name, listener) => { listeners[name] = (listeners[name] || []).filter(value => value !== listener); } };
      window.approvalTestEvent = (name, value) => listeners[name]?.forEach(listener => listener(value));
    });
    await page.route("**/api/approvals/**", async route => {
      const request = route.request(), url = new URL(request.url());
      const result = url.pathname.endsWith("/events") ? await networkApprovals.events(owner, url.searchParams) : await networkApprovals.state(owner, request.postDataJSON().items);
      await route.fulfill({ json: result });
    });
    await page.route("**/api/contract-rpc", async route => {
      const { method, params } = route.request().postDataJSON();
      assert(["eth_call", "eth_estimateGas", "eth_getTransactionReceipt"].includes(method));
      try { const result = await rpc.send(method, params); await route.fulfill({ json: { result, chainId: testChain, source: "local" } }); }
      catch (error) { await route.fulfill({ status: 502, json: { error: error.message } }); }
    });
    await page.goto(`${base}${prefix}/approvals/${owner}?lang=${locale}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelectorAll(".approval-card").length === 4);
    check(`${engine.name()} ${testChain}: four native permission cards render at ${width}px`, await page.locator(".approval-card").count() === 4);
    check(`${engine.name()} ${testChain}: disconnected wallet cannot revoke`, await page.locator(".approval-action > button:disabled").count() === 4);
    check(`${engine.name()} ${testChain}: token amount label is localized`, await page.locator(".approval-card").filter({ has: page.locator("strong", { hasText: "TEST" }) }).locator("dt").last().textContent() === walletCopy[locale].approvalAmount);
    await page.locator(".contract-wallet button.primary-action").click();
    await page.waitForFunction(() => document.querySelectorAll(".approval-action > button:not(:disabled)").length === 4);
    const card = page.locator(".approval-card").filter({ has: page.locator("strong", { hasText: "TEST" }) });
    await card.locator(".approval-action > button").click();
    await card.locator(".transaction-review").waitFor();
    check(`${engine.name()} ${testChain}: simulation does not broadcast`, sent.length === 0);
    await page.evaluate(() => window.approvalTestEvent("accountsChanged", ["0x1111111111111111111111111111111111111111"]));
    await page.waitForFunction(() => !document.querySelector(".transaction-review"));
    check(`${engine.name()} ${testChain}: changing wallet invalidates a prepared revoke`, sent.length === 0);
    await page.locator(".contract-wallet button.primary-action").click();
    await card.locator(".approval-action > button").click();
    await page.evaluate(() => window.approvalTestReject = true);
    await card.locator(".transaction-review button").first().click();
    await card.locator("[role=alert]").waitFor();
    check(`${engine.name()} ${testChain}: rejected confirmation never broadcasts`, sent.length === 0);
    await page.evaluate(() => window.approvalTestReject = false);
    await card.locator(".transaction-review button").first().click();
    await page.waitForFunction(() => document.querySelectorAll(".approval-card").length === 3, undefined, { timeout: 20000 });
    check(`${engine.name()} ${testChain}: confirmed revoke refreshes actual state`, await erc20.allowance(owner, spender) === 0n && sent.length === 1);
    check(`${engine.name()} ${testChain}: confirmation hash remains visible after filtering the revoked row`, await page.locator(".approval-submissions a").count() === 1);
    check(`${engine.name()} ${testChain}: remaining NFTs stay authorized`, await erc721.isApprovedForAll(owner, spender) && await erc1155.isApprovedForAll(owner, spender));
    check(`${engine.name()} ${testChain}: no overflow or runtime errors`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1) && runtime.length === 0);
    // Native connections remain usable without a configured external relay.
    await page.locator(".contract-wallet button").last().click();
    const config = await (await fetch(`${base}${prefix}/api/wallet/config`)).json();
    const qr = page.locator(".contract-wallet button").filter({ hasText: "WalletConnect" });
    if (!/^[\da-f]{32}$/i.test(config.projectId || "")) {
      check(`${engine.name()} ${testChain}: unconfigured external connection is not offered`, await qr.count() === 0);
    } else {
    await qr.click();
    const walletResult = await Promise.race([
      page.locator(".wallet-qr-dialog[open] svg").waitFor({timeout:20000}).then(() => "qr"),
      page.locator(".wallet-connection [role=alert]").waitFor({timeout:20000}).then(() => "error"),
    ]);
    if (walletResult === "error") check(`${engine.name()} ${testChain}: unconfigured SDK reports the expected localized setup error`, (await page.locator(".wallet-connection [role=alert]").textContent()).trim() === walletCopy[locale].walletConnectUnconfigured);
    if (walletResult === "qr") {
      check(`${engine.name()} ${testChain}: actual SDK pairing URI renders a QR`, await page.locator(".wallet-qr-dialog svg").count() === 1);
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => !document.querySelector(".wallet-qr-dialog[open]"));
    }
    }
    check(`${engine.name()} ${testChain}: native wallet or optional QR remains retryable`, await page.locator(".contract-wallet button:disabled").count() === 0);
    await browser.close(); browser = undefined;
  }
} finally {
  await browser?.close(); await rpc.destroy(); anvil.kill("SIGTERM");
  await mkdir("reports/approvals", { recursive: true }); await writeFile("reports/approvals/results.json", JSON.stringify({ checks, publicTransactions: 0 }, null, 2));
}
