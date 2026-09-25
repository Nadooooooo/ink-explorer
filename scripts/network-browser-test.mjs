import assert from "node:assert/strict";
import { chromium, firefox, webkit } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import axe from "axe-core";
const base = process.env.BASE_URL || "http://127.0.0.1:4188";
const dir = process.env.NETWORK_REVIEW_DIR || "screenshots/network-browsers";
await mkdir(dir, { recursive: true });
const results = [],
  failures = [];
const fetchJson = async (path) => {
  const response = await fetch(base + path);
  assert(response.ok, `${path}: ${response.status}`);
  return response.json();
};
for (const [name, browserType] of [
  ["chromium", chromium],
  ["firefox", firefox],
  ["webkit", webkit],
]) {
  if (process.env.BROWSERS && !process.env.BROWSERS.split(",").includes(name))
    continue;
  const browser = await browserType.launch({
    ...(name === "chromium"
      ? { executablePath: "/usr/bin/google-chrome" }
      : {}),
    env: {
      ...process.env,
      ...(process.env.INK_BROWSER_LIBS
        ? { LD_LIBRARY_PATH: process.env.INK_BROWSER_LIBS }
        : {}),
    },
  });
  try {
    for (const prefix of ["", "/testnet"]) {
      const overview = await fetchJson(`${prefix}/api/overview`);
      const tokens = await fetchJson(`${prefix}/api/explorer/tokens`);
      const contracts = await fetchJson(
        `${prefix}/api/explorer/smart-contracts`,
      );
      const chain = prefix ? 763373 : 57073;
      const routes = [
        "/",
        "/blocks",
        "/txs",
        "/tokens",
        "/pools",
        "/contracts",
        "/analytics",
        "/advanced",
        "/network",
        "/developers",
        "/search?q=WETH",
        `/block/${overview.blocks[0].height}`,
        `/tx/${overview.transactions[0].hash}`,
        `/address/${contracts.items[0].address.hash}`,
        `/token/${tokens.items[0].address_hash}`,
      ];
      assert.equal(overview.network.chainId, chain);
      const selectedRoutes = process.env.NETWORK_ROUTES
        ? process.env.NETWORK_ROUTES.split(",")
        : routes;
      for (const width of [390, 1440]) {
        const context = await browser.newContext({
          viewport: { width, height: 900 },
          hasTouch: width < 500,
        });
        const page = await context.newPage();
        for (const route of selectedRoutes) {
          const errors = [],
            leaks = [];
          const listener = (error) => errors.push(error.message);
          const requests = (request) => {
            const url = new URL(request.url());
            if (
              prefix &&
              url.origin === new URL(base).origin &&
              url.pathname.startsWith("/api/")
            )
              leaks.push(url.pathname);
          };
          page.on("pageerror", listener);
          page.on("request", requests);
          await page.goto(`${base}${prefix}${route}`, {
            waitUntil: "networkidle",
            timeout: 45000,
          });
          await page.locator("main").waitFor();
          await page.waitForFunction(
            () => !document.querySelector("main > .loading"),
            { timeout: 30000 },
          );
          const measurement = await page.evaluate(() => ({
            overflow: document.documentElement.scrollWidth - innerWidth,
            heading: document.querySelector("h1")?.textContent,
            error: document.querySelector("main > .error-state")?.textContent,
            title: document.title,
          }));
          const row = {
            browser: name,
            network: chain,
            route,
            width,
            ...measurement,
            errors,
            leaks,
          };
          results.push(row);
          if (
            measurement.overflow > 1 ||
            errors.length ||
            leaks.length ||
            measurement.error
          )
            failures.push(row);
          if (["/", "/network"].includes(route))
            await page.screenshot({
              path: `${dir}/${name}-${chain}-${width}-${route === "/" ? "home" : "network"}.png`,
              fullPage: true,
            });
          page.off("pageerror", listener);
          page.off("request", requests);
        }
        const weth = "0x4200000000000000000000000000000000000006";
        await page.goto(`${base}${prefix}/address/${weth}`, {
          waitUntil: "networkidle",
        });
        await page
          .getByRole("button", { name: "Read contract", exact: true })
          .click();
        await page.locator(".contract-interaction").waitFor();
        if (prefix) {
          await page
            .locator(".contract-interaction select")
            .selectOption("custom");
          await page
            .locator(".contract-interaction textarea")
            .fill(
              '[{"type":"function","name":"name","stateMutability":"view","inputs":[],"outputs":[{"type":"string"}]}]',
            );
          await page
            .getByRole("button", { name: "Use ABI", exact: true })
            .click();
        }
        await page
          .locator('.contract-interaction input[type="search"]')
          .fill("name()");
        await page.locator(".contract-method:not([hidden]) summary").first().click();
        await page.getByRole("button", { name: "Query", exact: true }).click();
        await page
          .locator(".contract-result")
          .filter({ hasText: "Wrapped Ether" })
          .waitFor();
        await page.evaluate(axe.source);
        const violations = await page.evaluate(async () =>
          (await window.axe.run()).violations
            .filter((item) => ["serious", "critical"].includes(item.impact))
            .map((item) => ({
              id: item.id,
              nodes: item.nodes.map((node) => node.target),
            })),
        );
        if (violations.length)
          failures.push({ browser: name, chain, width, violations });
        results.push({
          browser: name,
          network: chain,
          width,
          route: `/address/${weth}#read`,
          realRpcRead: "Wrapped Ether",
          violations,
        });
        await page.screenshot({
          path: `${dir}/${name}-${chain}-${width}-read.png`,
          fullPage: true,
        });
        await context.close();
      }
    }
  } finally {
    await browser.close();
    await writeFile(
      `${dir}/results.json`,
      JSON.stringify({ results, failures }, null, 2),
    );
  }
  console.log(
    `${name}: ${results.length} cumulative checks, ${failures.length} failures`,
  );
}
assert.equal(failures.length, 0, JSON.stringify(failures, null, 2));
console.log(`Network browser audit passed: ${results.length} cases.`);
