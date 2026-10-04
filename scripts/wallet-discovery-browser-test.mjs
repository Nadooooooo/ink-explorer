import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, firefox, webkit } from "playwright";
import axe from "axe-core";
const base = process.env.BASE_URL || "http://127.0.0.1:4188";
const checks = [];
let browser;
try {
  for (const [engine, locale, width] of [[chromium, "fr", 390], [firefox, "en", 1440], [webkit, "ar", 320]]) {
    browser = await engine.launch({ headless: true, ...(engine === chromium ? { executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] } : {}) });
    for (const [prefix, chain] of [["", 57073], ["/testnet", 763373]]) {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      const requests = [], external = [], errors = [];
      const label = `${engine.name()} ${chain} ${width}px`;
      const check = (name, condition) => { assert(condition, `${label}: ${name}`); checks.push(`${label}: ${name}`); };
      page.on("pageerror", error => errors.push(error.message));
      page.on("request", request => { const url = new URL(request.url()); if (/walletconnect|reown/i.test(url.hostname) || /WalletConnectProvider/.test(url.pathname)) external.push(url.hostname + url.pathname); });
      await page.exposeFunction("injectedRequest", async (name, args) => {
        requests.push({ name, method: args.method });
        if (args.method === "eth_requestAccounts" || args.method === "eth_accounts") return [name === "Rabby" ? `0x${"1".repeat(40)}` : `0x${"2".repeat(40)}`];
        if (args.method === "eth_chainId") return `0x${chain.toString(16)}`;
        throw new Error("Unexpected native wallet request");
      });
      await page.addInitScript(() => {
        const providers = {}, handlers = {};
        for (const name of ["Rabby", "MetaMask", "Frame"]) {
          handlers[name] = {};
          providers[name] = { request: args => window.injectedRequest(name, args), on: (event, listener) => (handlers[name][event] ||= []).push(listener), removeListener: (event, listener) => handlers[name][event] = (handlers[name][event] || []).filter(value => value !== listener) };
        }
        window.ethereum = providers.MetaMask;
        window.announceWallet = (name, uuid) => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: { info: { uuid, name, rdns: "io.example", icon: "data:image/svg+xml,<svg/>" }, provider: providers[name] } }));
        window.walletEvent = (name, event, data) => handlers[name][event]?.forEach(listener => listener(data));
        window.addEventListener("eip6963:requestProvider", () => {
          window.announceWallet("Rabby", "11111111-1111-4111-8111-111111111111");
          window.announceWallet("MetaMask", "22222222-2222-4222-8222-222222222222");
          window.announceWallet("MetaMask", "22222222-2222-4222-8222-222222222222");
        });
      });
      await page.goto(`${base}${prefix}/approvals?lang=${locale}`, { waitUntil: "domcontentloaded" });
      await page.locator(".contract-wallet button.primary-action").click();
      await page.locator(".wallet-picker-dialog[open]").waitFor();
      check("open wallet selection fits the viewport", await page.evaluate(() => document.querySelector(".wallet-picker-dialog").scrollWidth <= document.querySelector(".wallet-picker-dialog").clientWidth && document.documentElement.scrollWidth <= innerWidth));
      await page.evaluate(axe.source);
      const accessibility = await page.evaluate(async () => window.axe.run(document.querySelector(".wallet-picker-dialog"), { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } }));
      check("wallet selection passes accessibility checks", accessibility.violations.length === 0);
      check("two announced wallets are listed without duplicate legacy entry", await page.locator(".wallet-picker-options button").count() === 2);
      check("discovery does not request accounts or contact a connection service", requests.length === 0 && external.length === 0);
      const config = await (await fetch(`${base}${prefix}/api/wallet/config`)).json();
      if (!/^[\da-f]{32}$/i.test(config.projectId || "")) check("an unconfigured WalletConnect button is absent", await page.locator(".contract-wallet button").filter({ hasText: "WalletConnect" }).count() === 0);
      await page.evaluate(() => window.announceWallet("Frame", "33333333-3333-4333-8333-333333333333"));
      await page.waitForFunction(() => document.querySelectorAll(".wallet-picker-options button").length === 3);
      check("late wallet injection updates the open dialog", await page.getByRole("button", { name: "Frame", exact: true }).isVisible());
      await page.getByRole("button", { name: "Rabby", exact: true }).click();
      await page.locator(".contract-wallet bdi").waitFor();
      check("the chosen Rabby provider supplies the account", await page.locator(".contract-wallet bdi").textContent() === `0x${"1".repeat(40)}` && requests.every(request => request.name === "Rabby"));
      await page.locator(".contract-wallet button").click();
      requests.length = 0;
      await page.locator(".contract-wallet button.primary-action").click();
      await page.getByRole("button", { name: "MetaMask", exact: true }).click();
      await page.locator(".contract-wallet bdi").waitFor();
      check("a different chosen provider supplies its own account", await page.locator(".contract-wallet bdi").textContent() === `0x${"2".repeat(40)}` && requests.every(request => request.name === "MetaMask"));
      await page.evaluate(() => window.walletEvent("Rabby", "accountsChanged", []));
      check("an unselected wallet event cannot disconnect the selected wallet", await page.locator(".contract-wallet bdi").count() === 1);
      await page.evaluate(() => window.walletEvent("MetaMask", "accountsChanged", []));
      await page.locator(".contract-wallet bdi").waitFor({ state: "hidden" });
      check("a selected wallet account change requires a new connection", await page.locator(".wallet-connection [role=alert]").count() === 1);
      await page.locator(".contract-wallet button.primary-action").click();
      await page.locator(".wallet-picker-dialog[open]").waitFor();
      await page.keyboard.press("Escape");
      await page.locator(".wallet-picker-dialog[open]").waitFor({ state: "hidden" });
      check("Escape closes selection without connecting", await page.locator(".contract-wallet button.primary-action").isEnabled() && await page.locator(".contract-wallet bdi").count() === 0);
      check("no connection service or message signature is requested", external.length === 0 && !requests.some(request => /sign/i.test(request.method)));
      check("no runtime errors or horizontal overflow", errors.length === 0 && await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.close();
      const empty = await browser.newPage({ viewport: { width, height: 844 } });
      await empty.goto(`${base}${prefix}/approvals?lang=${locale}`, { waitUntil: "domcontentloaded" });
      await empty.locator(".contract-wallet button.primary-action").click();
      await empty.locator(".wallet-picker-dialog[open]").waitFor();
      check("a browser without an installed wallet shows guidance", await empty.locator(".wallet-picker-options button").count() === 0 && (await empty.locator(".wallet-picker-dialog p").count()) === 3);
      await empty.keyboard.press("Escape");
      check("missing-wallet guidance can be canceled", await empty.locator(".contract-wallet button.primary-action").isEnabled());
      await empty.close();
      console.log(`PASS ${label}: native discovery, selection, cancellation, missing-wallet guidance; zero connection-service requests`);
    }
    await browser.close(); browser = undefined;
  }
  await mkdir("reports/wallet-discovery", { recursive: true });
  await writeFile("reports/wallet-discovery/results.json", JSON.stringify({ checks, connectionServiceRequests: 0, publicTransactions: 0 }, null, 2) + "\n");
} finally { await browser?.close(); }
