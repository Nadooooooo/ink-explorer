import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import puppeteer from "puppeteer-core";
import solc from "solc";
import { ContractFactory, JsonRpcProvider, Interface, ParamType } from "ethers";
import { parseArgument } from "../src/contract-abi.ts";
import { validateRpc } from "../server/contract-rpc.mjs";

const report = {
  environment:
    "Isolated Anvil EVM; synthetic ABI/index fixtures; no public transaction broadcast",
  checks: [],
  errors: [],
};
const check = (name, condition) => {
  assert(condition, name);
  report.checks.push(name);
};
const artifact = "screenshots/contract-integration";
await mkdir(artifact, { recursive: true });
check(
  "ABI integers preserve 256-bit precision",
  parseArgument(ParamType.from("uint256"), (2n ** 256n - 1n).toString()) ===
    2n ** 256n - 1n,
);
for (const [type, invalid] of [
  ["uint8", "256"],
  ["uint256", "-1"],
  ["uint256", ""],
  ["bool", "yes"],
  ["bytes4", "0x12"],
  ["address", "0x1234"],
  ["uint256[]", "[9007199254740993]"],
]) {
  assert.throws(() => parseArgument(ParamType.from(type), invalid));
  report.checks.push(`Reject invalid ${type}: ${invalid}`);
}
for (const method of [
  "eth_sendTransaction",
  "eth_sendRawTransaction",
  "debug_traceTransaction",
  "admin_peers",
  "personal_unlockAccount",
]) {
  assert.throws(() => validateRpc(method, []));
  report.checks.push(`Server rejects ${method}`);
}
const anvil = spawn(
  "node_modules/.bin/anvil",
  ["--host", "127.0.0.1", "--port", "18546", "--chain-id", "57073", "--silent"],
  { stdio: "ignore" },
);
let fixture, server, browser;
const provider = new JsonRpcProvider("http://127.0.0.1:18546", 57073, {
  staticNetwork: true,
  batchMaxCount: 1,
});
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
try {
  for (let attempt = 0; ; attempt++) {
    try {
      await provider.getBlockNumber();
      break;
    } catch (error) {
      if (attempt > 30) throw error;
      await wait(200);
    }
  }
  const source = await readFile("scripts/fixtures/Interaction.sol", "utf8");
  const compiled = JSON.parse(
    solc.compile(
      JSON.stringify({
        language: "Solidity",
        sources: { "Interaction.sol": { content: source } },
        settings: {
          evmVersion: "paris",
          outputSelection: { "*": { "*": ["abi", "evm.bytecode"] } },
        },
      }),
    ),
  );
  assert(
    !compiled.errors?.some((error) => error.severity === "error"),
    JSON.stringify(compiled.errors),
  );
  const contracts = compiled.contracts["Interaction.sol"];
  const signer = await provider.getSigner(0),
    account = await signer.getAddress();
  const deploy = async (name, args = []) => {
    const entry = contracts[name];
    const deployed = await new ContractFactory(
      entry.abi,
      entry.evm.bytecode.object,
      signer,
    ).deploy(...args);
    await deployed.waitForDeployment();
    return deployed;
  };
  const direct = await deploy("Interaction"),
    address = await direct.getAddress();
  const proxy = await deploy("TestProxy", [address]),
    proxyAddress = await proxy.getAddress();
  fixture = http.createServer((req, res) => {
    const path = new URL(req.url, "http://localhost").pathname;
    let data = { items: [] };
    if (/^\/pools\/0x[\da-f]+\/check$/i.test(path)) data = null;
    if (/\/addresses\/0x[\da-f]+$/i.test(path))
      data = {
        hash: path.split("/").pop(),
        is_contract: true,
        is_verified: true,
        name: "Interaction test fixture",
        coin_balance: "0",
        implementations: [],
      };
    if (path.endsWith(`/smart-contracts/${address}`))
      data = {
        abi: contracts.Interaction.abi,
        source_code: source,
        name: "Interaction",
        is_fully_verified: true,
      };
    if (path.endsWith(`/smart-contracts/${proxyAddress}`))
      data = {
        abi: contracts.TestProxy.abi,
        implementations: [{ address_hash: address, name: "Interaction" }],
        name: "TestProxy",
      };
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(data));
  });
  await new Promise((resolve) => fixture.listen(18547, "127.0.0.1", resolve));
  server = spawn(process.execPath, ["server/server.mjs"], {
    env: {
      ...process.env,
      PORT: "4192",
      HOST: "127.0.0.1",
      INK_NETWORK: "mainnet",
      INK_RPC: "http://127.0.0.1:18546",
      BLOCKSCOUT_API: "http://127.0.0.1:18547/v2",
      CONTRACT_INFO_API: "http://127.0.0.1:18547",
      BLOCKSCOUT_STATS_API: "http://127.0.0.1:18547",
    },
    stdio: "ignore",
  });
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch("http://127.0.0.1:4192/api/health");
      if (response.ok) break;
    } catch {}
    if (attempt > 30) throw new Error("Fixture explorer failed to start");
    await wait(200);
  }
  browser = await puppeteer.launch({
    executablePath: "/usr/bin/google-chrome",
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  page.on("pageerror", (error) => report.errors.push(error.message));
  let reject = false,
    walletChain = "0x1",
    sends = 0;
  let holdNextHash = false, releaseHash;
  await page.exposeFunction("fixtureWallet", async ({ method, params }) => {
    if (method === "eth_chainId") return walletChain;
    if (["eth_accounts", "eth_requestAccounts"].includes(method))
      return [account];
    if (method === "wallet_switchEthereumChain") {
      walletChain = params[0].chainId;
      return null;
    }
    if (method === "eth_sendTransaction") {
      if (reject) return { rejected: true };
      sends++;
      const hash = await provider.send(method, params);
      if (holdNextHash) await new Promise(resolve => { releaseHash = resolve; });
      return hash;
    }
    throw new Error(`Unexpected wallet method ${method}`);
  });
  await page.evaluateOnNewDocument(() => {
    window.fixtureListeners = {};
    window.ethereum = {
      request: async (args) => {
        const value = await window.fixtureWallet(args);
        if (value?.rejected)
          throw Object.assign(new Error("Rejected"), { code: 4001 });
        return value;
      },
      on: (event, listener) => {
        (window.fixtureListeners[event] ||= []).push(listener);
      },
      removeListener: (event, listener) => {
        window.fixtureListeners[event] = (
          window.fixtureListeners[event] || []
        ).filter((item) => item !== listener);
      },
    };
  });
  const button = (text) => page.locator(`button:not([hidden] button)::-p-text(${text})`);
  const method = async (signature) => {
    await page
      .locator('.contract-interaction input[type="search"]')
      .fill(signature);
    const visible = await page.$(".contract-method:not([hidden])");
    if (!(await visible.evaluate(element => element.open)))
      await page.locator(".contract-method:not([hidden]) summary").click();
  };
  const input = async (index, value) => {
    const elements = await page.$$(".contract-method:not([hidden]) form input");
    await elements[index].click({ clickCount: 3 });
    await elements[index].type(value);
  };
  const text = async () =>
    page.$eval(".contract-interaction", (element) => element.innerText);
  const waitText = (value) =>
    page.waitForFunction(
      (value) =>
        document
          .querySelector(".contract-interaction")
          ?.innerText.includes(value),
      {},
      value,
    );
  await page.goto(`http://127.0.0.1:4192/address/${address}`, {
    waitUntil: "networkidle0",
  });
  await button("Read contract").click();
  await method("value()");
  await button("Query").click();
  await waitText("Output 1");
  check(
    "Reads zero without wallet and preserves zero",
    (await text()).includes('"0"'),
  );
  await method("echo(");
  await input(0, '[["900719925474099312345",true]]');
  await input(1, "-128");
  await input(2, "0x12345678");
  await button("Query").click();
  await waitText("900719925474099312345");
  check(
    "Tuple arrays, signed integers and bytes decode exactly",
    (await text()).includes("0x12345678"),
  );
  await button("Write contract").click();
  await method("set(");
  await input(0, "900719925474099312345");
  check(
    "Write disabled without wallet",
    await page.$eval(
      ".contract-method:not([hidden]) form button",
      (element) => element.disabled,
    ),
  );
  await button("Connect wallet").click();
  await page.waitForFunction(() =>
    document
      .querySelector(".contract-wallet")
      ?.innerText.includes("Disconnect"),
  );
  check("Wallet switches to selected chain", Number(walletChain) === 57073);
  await button("Simulate transaction").click();
  await waitText("Simulation succeeded");
  check(
    "Simulation does not broadcast",
    sends === 0 && (await direct.value()) === 0n,
  );
  reject = true;
  await button("Confirm in wallet").click();
  await waitText("Request rejected");
  check("Rejected signature does not broadcast", sends === 0);
  reject = false;
  await button("Confirm in wallet").click();
  await waitText("Confirmed successfully");
  check(
    "Write executes on EVM with exact uint256",
    (await direct.value()) === 900719925474099312345n,
  );
  await page.screenshot({
    path: `${artifact}/write-confirmed-mobile.png`,
    fullPage: true,
  });
  await method("deposit()");
  await input(0, "0.00001");
  await button("Simulate transaction").click();
  await waitText("Simulation succeeded");
  holdNextHash = true;
  await button("Confirm in wallet").click();
  for (let attempt = 0; !releaseHash && attempt < 100; attempt++) await wait(20);
  assert(releaseHash, "Wallet transaction reached the EVM");
  await page.evaluate(() => window.fixtureListeners.accountsChanged.forEach(listener => listener([])));
  await waitText("Wallet changed");
  await page.locator('.contract-interaction input[type="search"]').fill("no_such_function");
  await waitText("No matching write functions");
  releaseHash();
  holdNextHash = false;
  await wait(100);
  await method("deposit()");
  await waitText("Confirmed successfully");
  check("Submitted hash survives an account change before wallet response", Boolean(await page.$('.contract-method:not([hidden]) a[href*="/tx/"]')));
  check("Function filtering preserves a transaction awaiting the wallet response", (await text()).includes("Confirmed successfully"));
  await button("Connect wallet").click();
  await page.waitForFunction(() => document.querySelector('.contract-wallet')?.innerText.includes('Disconnect'));
  check(
    "Payable value reaches contract",
    (await provider.getBalance(address)) === 10000000000000n,
  );
  await method("fail()");
  await button("Simulate transaction").click();
  await waitText("DeliberateFailure");
  check(
    "Decoded revert prevents confirmation",
    !(await page.$(".contract-method:not([hidden]) .transaction-review")),
  );
  await method("set(");
  await input(0, "10");
  await button("Simulate transaction").click();
  await waitText("Simulation succeeded");
  await page.evaluate(() =>
    window.fixtureListeners.accountsChanged.forEach((listener) => listener([])),
  );
  await waitText("Wallet changed");
  check(
    "Account change invalidates prepared transaction",
    !(await page.$(".contract-method:not([hidden]) .transaction-review")),
  );
  await page.goto(`http://127.0.0.1:4192/address/${proxyAddress}`, {
    waitUntil: "networkidle0",
  });
  await button("Write contract").click();
  await page.waitForSelector(".contract-interaction select");
  await page.select(".contract-interaction select", address);
  await method("set(");
  await input(0, "77");
  await button("Connect wallet").click();
  await page.waitForFunction(() =>
    document
      .querySelector(".contract-wallet")
      ?.innerText.includes("Disconnect"),
  );
  await button("Simulate transaction").click();
  await waitText("Simulation succeeded");
  await button("Confirm in wallet").click();
  await waitText("Confirmed successfully");
  const abi = new Interface(contracts.Interaction.abi);
  const result = await provider.call({
    to: proxyAddress,
    data: abi.encodeFunctionData("value"),
  });
  check(
    "Proxy ABI writes proxy storage, not implementation",
    abi.decodeFunctionResult("value", result)[0] === 77n &&
      (await direct.value()) !== 77n,
  );
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewport({ width, height: 900 });
    check(
      `Contract UI fits ${width}px`,
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
  }
  check("No JavaScript errors", report.errors.length === 0);
  console.log(
    `Contract integration passed: ${report.checks.length} checks, ${sends} isolated EVM transactions.`,
  );
} finally {
  await browser?.close();
  provider.destroy();
  server?.kill("SIGTERM");
  fixture?.close();
  anvil.kill("SIGTERM");
  await writeFile(`${artifact}/results.json`, JSON.stringify(report, null, 2));
}
