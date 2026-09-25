import puppeteer from "puppeteer-core";
import { nftContract, nftInstance, sampleNftHolder } from "./public-nft-fixture.mjs";

const base = process.env.BASE_URL || "http://127.0.0.1:4188";
const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox"],
});
const failures = [];
const routes = [
  ["/", "Ink Mainnet"],
  ["/blocks", "Blocks"],
  ["/txs", "Transactions"],
  ["/tokens", "Tokens"],
  ["/pools", "Liquidity pools"],
  ["/contracts", "Verified contracts"],
  ["/analytics", "Ink analytics"],
  ["/advanced", "Advanced activity"],
  ["/developers", "Developer API"],
  ["/network", "Network health"],
  ["/search?q=WETH", "Results for"],
];
const overview = await fetch(`${base}/api/overview`).then((r) => r.json());
const tokenPage = await fetch(`${base}/api/explorer/tokens`).then((r) =>
  r.json(),
);
const poolPage = await fetch(`${base}/api/contract-info/pools`).then((r) =>
  r.json(),
);
const nftHolder = await sampleNftHolder(base);
const sampleTx = overview.transactions[0];
routes.push(
  [`/block/${overview.blocks[0].height}`, "TRANSACTIONS IN THIS BLOCK"],
  [`/tx/${sampleTx.hash}`, "TRANSACTION HASH"],
  [`/address/${sampleTx.from.hash}`, "ETH BALANCE"],
  [`/token/${tokenPage.items[0].address_hash}`, "Transfers"],
  [`/pools/${poolPage.items[0].pool_id}`, "LIQUIDITY POOL"],
  [
    `/token/${nftContract}/instance/${nftInstance}`,
    "NFT INSTANCE",
  ],
);

const viewports = [
  { width: 1440, height: 1000, name: "desktop" },
  { width: 1024, height: 768, name: "small-desktop" },
  { width: 900, height: 1000, name: "tablet" },
  { width: 844, height: 390, name: "mobile-landscape" },
  { width: 390, height: 844, name: "mobile" },
  { width: 320, height: 700, name: "small-mobile" },
];
for (const viewport of viewports) {
  const page = await browser.newPage();
  await page.setViewport({
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
  });
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  for (const [route, expected] of routes) {
    const response = await page.goto(`${base}${route}`, {
      waitUntil: "networkidle0",
      timeout: 30000,
    });
    const body = await page.$eval("body", (el) => el.innerText);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    const layout = await page.evaluate(() => {
      const rect = (selector) =>
        document.querySelector(selector)?.getBoundingClientRect();
      const main = rect("main"),
        brand = rect("header .brand"),
        nav = rect("header nav"),
        search = rect("header .header-search");
      return {
        mainWidth: main?.width || 0,
        mainLeft: main?.left || 0,
        brandLeft: brand?.left || 0,
        navRight: nav?.right || 0,
        searchLeft: search?.left || 0,
      };
    });
    if (!response?.ok())
      failures.push(`${viewport.name} ${route}: HTTP ${response?.status()}`);
    if (!body.includes(expected))
      failures.push(`${viewport.name} ${route}: missing ${expected}`);
    if (body.includes("Data temporarily unavailable"))
      failures.push(`${viewport.name} ${route}: upstream error state`);
    if (overflow)
      failures.push(`${viewport.name} ${route}: horizontal overflow`);
    if (viewport.width >= 1200 && Math.abs(layout.mainWidth - Math.min(2200, viewport.width - 64)) > 1)
      failures.push(
        `${viewport.name} ${route}: content rail does not use the available width (${layout.mainWidth}px)`,
      );
    if (viewport.width > 760 && layout.navRight > layout.searchLeft + 1)
      failures.push(`${viewport.name} ${route}: navigation overlaps search`);
    if (
      viewport.width > 760 &&
      Math.abs(layout.brandLeft - layout.mainLeft) > 1
    )
      failures.push(
        `${viewport.name} ${route}: header and content rails are misaligned`,
      );
    await page.evaluate(() =>
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }),
    );
    const footerReachable = await page.$eval(
      ".site-footer",
      (element) => element.getBoundingClientRect().top < innerHeight + 2,
    );
    if (!footerReachable)
      failures.push(
        `${viewport.name} ${route}: footer is not reachable after full scroll`,
      );
    const { stickyTop, expectedTop } = await page.evaluate(() => ({
      stickyTop: document.querySelector("header").getBoundingClientRect().top,
      expectedTop: Math.max(0, document.querySelector(".network-ribbon").getBoundingClientRect().bottom),
    }));
    if (Math.abs(stickyTop - expectedTop) > 1)
      failures.push(
        `${viewport.name} ${route}: sticky header left the viewport (${stickyTop}px)`,
      );
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  }
  if (consoleErrors.length)
    failures.push(
      `${viewport.name}: console errors: ${consoleErrors.join(" | ")}`,
    );
  await page.close();
}

const page = await browser.newPage();
await page.goto(base, { waitUntil: "networkidle0", timeout: 30000 });
await page.waitForFunction(
  () => document.body.innerText.includes("WEBSOCKET LIVE"),
  { timeout: 10000 },
);
const logoReady = await page.$eval(
  ".brand img",
  (img) => img.complete && img.naturalWidth > 0,
);
if (!logoReady) failures.push("brand: generated logo did not load");
const txHref = await page.$eval(
  ".tx-row .copyable .text-link",
  (el) => el.getAttribute("data-none") || el.textContent,
);
if (!txHref) failures.push("home: no live transaction rendered");
await page.goto(`${base}/blocks`, {
  waitUntil: "networkidle0",
  timeout: 30000,
});
const initialBlockHeight = await page.$eval(
  ".block-list .block-height button",
  (element) => Number((element.textContent || "").replace(/\D/g, "")),
);
await page
  .waitForFunction(
    (initial) =>
      Number(
        (
          document.querySelector(".block-list .block-height button")
            ?.textContent || ""
        ).replace(/\D/g, ""),
      ) > initial,
    { timeout: 15000 },
    initialBlockHeight,
  )
  .catch(() => {});
const liveBlockState = await page.evaluate(
  (initial) => ({
    height: Number(
      (
        document.querySelector(".block-list .block-height button")
          ?.textContent || ""
      ).replace(/\D/g, ""),
    ),
    status:
      document.querySelector(".table-toolbar span:last-child")?.textContent ||
      "",
  }),
  initialBlockHeight,
);
if (
  liveBlockState.height <= initialBlockHeight ||
  !liveBlockState.status.includes("Live · head")
)
  failures.push(
    `blocks: live head did not advance (${initialBlockHeight} → ${liveBlockState.height}, ${liveBlockState.status})`,
  );
await page.goto(`${base}/txs`, { waitUntil: "networkidle0", timeout: 30000 });
await page.waitForSelector(".tx-list .tx-row");
await page
  .waitForSelector(".tx-list .tx-row.live-arrival", { timeout: 20000 })
  .catch(() => {});
const liveTransactionState = await page.evaluate(() => ({
  liveRows: document.querySelectorAll(".tx-list .tx-row.live-arrival").length,
  marks: document.querySelectorAll(".tx-list .tx-row .entity-mark").length,
  status:
    document.querySelector(".table-toolbar span:last-child")?.textContent || "",
}));
if (
  !liveTransactionState.liveRows ||
  liveTransactionState.marks < 2 ||
  !liveTransactionState.status.includes("Live · head")
)
  failures.push(
    `transactions: live rows or identity marks missing (${JSON.stringify(liveTransactionState)})`,
  );
const clickText = async (label) => {
  const clicked = await page.$$eval(
    "button",
    (buttons, wanted) => {
      const button = buttons.find((el) => el.textContent?.trim() === wanted);
      button?.click();
      return Boolean(button);
    },
    label,
  );
  if (!clicked) failures.push(`interaction: button '${label}' not found`);
};
await page.goto(`${base}/tx/${sampleTx.hash}`, {
  waitUntil: "networkidle0",
  timeout: 30000,
});
await clickText("Input data");
if (!(await page.$eval("body", (el) => el.innerText)).includes("METHOD"))
  failures.push("transaction: input data tab failed");
await clickText("State changes");
await page
  .waitForFunction(
    () =>
      document.querySelector(".tabs button.active")?.textContent?.trim() ===
        "State changes" && Boolean(document.querySelector(".address-activity")),
    { timeout: 5000 },
  )
  .catch(() => {});
await page
  .waitForFunction(
    () => !document.querySelector(".address-activity .loading"),
    { timeout: 10000 },
  )
  .catch(() => {});
if (
  !(await page.$eval("body", (el) => el.innerText)).match(
    /Native balance|No balance|coin/,
  )
)
  failures.push("transaction: state changes tab failed");
await page.goto(`${base}/address/0x4200000000000000000000000000000000000006`, {
  waitUntil: "networkidle0",
  timeout: 30000,
});
await clickText("Assets");
await new Promise((r) => setTimeout(r, 500));
if (!(await page.$eval("body", (el) => el.innerText)).includes("Wrapped Ether"))
  failures.push("address: assets tab failed");
await clickText("Contract source");
await new Promise((r) => setTimeout(r, 500));
if (
  !(await page.$eval("body", (el) => el.innerText)).includes("pragma solidity")
)
  failures.push("address: verified source tab failed");
const sourceFiles = await page.$$(".source-file");
if (!sourceFiles.length)
  failures.push(
    "contract: verified source files are not individually inspectable",
  );
await page.goto(`${base}/address/${nftHolder}`, {
  waitUntil: "networkidle0",
  timeout: 30000,
});
await clickText("NFTs");
await page.waitForSelector(".nft-grid", { timeout: 10000 });
const firstNftPage = await page.$$(".nft-item");
await clickText("Load more");
await page
  .waitForFunction(
    (count) => document.querySelectorAll(".nft-item").length > count,
    { timeout: 30000 },
    firstNftPage.length,
  )
  .catch(() => {});
const expandedNftCount = await page.$$eval(
  ".nft-item",
  (items) => items.length,
);
if (firstNftPage.length !== 50 || expandedNftCount <= firstNftPage.length)
  failures.push(
    `NFTs: pagination did not append results (${firstNftPage.length} → ${expandedNftCount})`,
  );
const nftMedia = await page.$$eval(".nft-item img", (images) =>
  images.map((img) => img.getAttribute("src")).filter(Boolean),
);
if (!nftMedia.some((src) => src.startsWith("/api/media?url=")))
  failures.push("NFTs: remote media does not use the local cache");
const cachedNfts = nftMedia.filter((src) => src.startsWith("/api/media?url="));
if (cachedNfts.length) {
  const validMedia = await page.evaluate(async (sources) => {
    for (const src of sources) {
      const response = await fetch(src);
      if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) continue;
      if ((await response.blob()).size >= 100) return true;
    }
    return false;
  }, cachedNfts.slice(0, 10));
  if (!validMedia) failures.push("NFTs: none of the sampled cached media responses is a valid image");
}
const blockedMedia = await page.evaluate(
  async () =>
    (await fetch("/api/media?url=http%3A%2F%2F127.0.0.1%3A8545")).status,
);
if (blockedMedia !== 502)
  failures.push(
    `NFTs: private media origin should be blocked, received ${blockedMedia}`,
  );
await page.goto(
  `${base}/token/${nftContract}/instance/${nftInstance}`,
  { waitUntil: "networkidle0", timeout: 30000 },
);
if (!(await page.$eval("body", (el) => el.innerText)).includes("Token ID"))
  failures.push("NFT instance: metadata facts are missing");
if (
  !(await page.$eval(
    ".nft-media img",
    (img) => img.complete && img.naturalWidth > 0,
  ))
)
  failures.push("NFT instance: media failed to render");
let poolCatalogueResponses = 0;
page.on("response", (response) => {
  if (response.url().includes("/api/contract-info/pools?page_size=100"))
    poolCatalogueResponses += 1;
});
await page.goto(`${base}/pools`, { waitUntil: "networkidle0", timeout: 30000 });
if (
  !(await page.$eval("body", (el) => el.innerText)).match(
    /Liquidity|24H VOLUME/,
  )
)
  failures.push("pools: market columns are missing");
await page.waitForSelector(".pool-row");
await new Promise((resolve) => setTimeout(resolve, 10_500));
if (poolCatalogueResponses < 2)
  failures.push(
    `pools: expected a live refresh after 10 seconds, received ${poolCatalogueResponses} catalogue response(s)`,
  );
if (
  !(
    await page.$eval(
      ".pool-live-refresh",
      (element) => element.textContent || "",
    )
  ).includes("10")
)
  failures.push("pools: 10-second refresh status is missing");
const poolNumbers = async (attribute) =>
  page.$$eval(
    ".pool-row",
    (rows, name) => rows.map((row) => Number(row.getAttribute(name))),
    attribute,
  );
const isAscending = (values) =>
  values.every((value, index) => index === 0 || values[index - 1] <= value);
const isDescending = (values) =>
  values.every((value, index) => index === 0 || values[index - 1] >= value);
const defaultVolumes = await poolNumbers("data-volume");
if (!isDescending(defaultVolumes))
  failures.push("pools: default 24h volume sort is not descending");
await page.select(".pool-filter-grid label:nth-child(1) select", "liquidity");
await page.select(".pool-filter-grid label:nth-child(2) select", "asc");
const ascendingLiquidity = await poolNumbers("data-liquidity");
if (
  !isAscending(ascendingLiquidity) ||
  !page.url().includes("sort=liquidity") ||
  !page.url().includes("order=asc")
)
  failures.push("pools: liquidity sorting or URL persistence failed");
await page.select(".pool-filter-grid label:nth-child(3) select", "100000");
const thresholdLiquidity = await poolNumbers("data-liquidity");
if (
  !thresholdLiquidity.length ||
  thresholdLiquidity.some((value) => value < 100000)
)
  failures.push("pools: minimum liquidity filter failed");
await page.$$eval(".pool-filter-status button", (buttons) =>
  buttons.find((button) => button.textContent?.includes("Reset"))?.click(),
);
await page.select(".pool-filter-grid label:nth-child(4) select", "10000");
const thresholdVolume = await poolNumbers("data-volume");
if (!thresholdVolume.length || thresholdVolume.some((value) => value < 10000))
  failures.push("pools: minimum 24h volume filter failed");
await page.click(".pool-filter-status button");
await page.select(".pool-filter-grid label:nth-child(5) select", "0.3");
const filteredFees = await page.$$eval(".pool-row", (rows) =>
  rows.map((row) => row.getAttribute("data-fee")),
);
if (!filteredFees.length || filteredFees.some((value) => value !== "0.3"))
  failures.push("pools: fee tier filter failed");
await page.click(".pool-filter-status button");
const selectedDex = await page.$eval(
  ".pool-filter-grid label:nth-child(6) select",
  (select) => select.options[1]?.value || "",
);
await page.select(".pool-filter-grid label:nth-child(6) select", selectedDex);
const filteredDexes = await page.$$eval(".pool-row", (rows) =>
  rows.map((row) => row.children[1]?.textContent?.trim()),
);
if (
  !selectedDex ||
  !filteredDexes.length ||
  filteredDexes.some((value) => value !== selectedDex)
)
  failures.push("pools: DEX filter failed");
await page.click(".pool-filter-status button");
await page.type(".pool-search input", "WETH");
await page.waitForFunction(
  () => new URL(location.href).searchParams.get("q") === "WETH",
);
const searchedPools = await page.$$eval(".pool-row", (rows) =>
  rows.map((row) => row.textContent || ""),
);
if (
  !searchedPools.length ||
  searchedPools.some((text) => !text.toLowerCase().includes("weth"))
)
  failures.push("pools: token search returned an unrelated pair");
await page.reload({ waitUntil: "networkidle0" });
if ((await page.$eval(".pool-search input", (input) => input.value)) !== "WETH")
  failures.push("pools: token filter did not survive reload");
await page.click(".pool-filter-status button");
await page.waitForFunction(
  () => document.querySelectorAll(".pool-row").length === 25,
);
const poolRange = await page.$eval(
  ".pool-pagination > span",
  (element) => element.textContent || "",
);
const poolCount = Number(
  (await page.$eval(
    ".pool-result-bar strong",
    (element) => element.textContent || "",
  )).match(/\d+/)?.[0] || 0,
);
if (!poolRange.match(new RegExp(`1.?25 of ${poolCount}$`)) || poolCount <= 25)
  failures.push(
    `pools: complete catalogue pagination is missing (${poolRange.trim()})`,
  );
await page.click('.pool-pagination button[aria-label="Next pool page"]');
await page.waitForFunction(
  (count) =>
    new RegExp(`26.?50 of ${count}$`).test(
      document.querySelector(".pool-pagination > span")?.textContent?.trim() ||
        "",
    ),
  { timeout: 5_000 },
  poolCount,
).catch(() => {});
const nextPoolRange = await page.$eval(
  ".pool-pagination > span",
  (element) => element.textContent || "",
);
if (!nextPoolRange.match(new RegExp(`26.?50 of ${poolCount}$`)))
  failures.push(`pools: next page failed (${nextPoolRange.trim()})`);
await page.goto(`${base}/pools/${poolPage.items[0].pool_id}`, {
  waitUntil: "networkidle0",
  timeout: 30000,
});
const poolBody = await page.$eval("body", (el) => el.innerText);
if (
  !poolBody.includes(poolPage.items[0].base_token_symbol) ||
  !poolBody.includes(poolPage.items[0].quote_token_symbol) ||
  !poolBody.includes("GeckoTerminal")
)
  failures.push("pool detail: pair or market attribution is missing");
await page.goto(`${base}/address/${poolPage.items[0].pool_id}`, {
  waitUntil: "networkidle0",
  timeout: 30000,
});
await page
  .waitForFunction(() => document.body.innerText.includes("LIQUIDITY POOL"), {
    timeout: 10000,
  })
  .catch(() => {});
if (
  !(await page.$eval("body", (el) => el.innerText)).includes(
    `${poolPage.items[0].base_token_symbol}/${poolPage.items[0].quote_token_symbol}`,
  )
)
  failures.push("pool/address: cross-link classification is missing");
await page.goto(`${base}/txs`, { waitUntil: "networkidle0", timeout: 30000 });
await clickText("Token transfers");
await new Promise((r) => setTimeout(r, 500));
if (
  (await page.$eval("body", (el) => el.innerText)).includes(
    "Data temporarily unavailable",
  )
)
  failures.push("transactions: token transfer filter failed");
await page.goto(`${base}/token/0x4200000000000000000000000000000000000006`, {
  waitUntil: "networkidle0",
  timeout: 30000,
});
await clickText("Holders");
await page
  .waitForFunction(
    () => !document.querySelector(".address-activity .loading"),
    { timeout: 10_000 },
  )
  .catch(() => {});
if (!(await page.$eval("body", (el) => el.innerText)).match(/Account|Contract/))
  failures.push("token: holders tab failed");
await page.goto(`${base}/advanced`, {
  waitUntil: "networkidle0",
  timeout: 30000,
});
await clickText("L2 → L1 withdrawals");
await new Promise((r) => setTimeout(r, 500));
if (
  !(await page.$eval("body", (el) => el.innerText)).includes(
    "Messages exiting Ink",
  )
)
  failures.push("advanced: withdrawals tab failed");
await clickText("User operations");
await new Promise((r) => setTimeout(r, 500));
if (
  !(await page.$eval("body", (el) => el.innerText)).includes(
    "ERC‑4337 smart accounts",
  )
)
  failures.push("advanced: user operations tab failed");
await page.setViewport({
  width: 390,
  height: 844,
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});
await page.goto(`${base}/analytics`, {
  waitUntil: "networkidle0",
  timeout: 30000,
});
await clickText("7D");
await page.waitForFunction(
  () => document.body.innerText.toLowerCase().includes("7 observations"),
  { timeout: 30000 },
);
if (!page.url().includes("range=7"))
  failures.push("analytics: timeframe is not persisted in URL");
await page.$eval(".analytics-lead .interactive-chart", (el) =>
  window.scrollTo({
    top: el.getBoundingClientRect().top + scrollY - innerHeight * 0.4,
    behavior: "instant",
  }),
);
await new Promise((r) => setTimeout(r, 100));
const chartBox = await page.$eval(
  ".analytics-lead .interactive-chart",
  (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  },
);
await page.touchscreen.tap(
  chartBox.x + chartBox.width * 0.42,
  chartBox.y + chartBox.height * 0.55,
);
await new Promise((r) => setTimeout(r, 150));
const tooltips = await page.$$(".chart-tooltip");
if (tooltips.length < 6)
  failures.push(
    `analytics: shared mobile tooltip expected on 6 aligned charts, found ${tooltips.length}`,
  );
const tooltipText = tooltips.length
  ? await tooltips[0].evaluate((el) => el.textContent)
  : "";
if (!tooltipText?.match(/ago|today/))
  failures.push("analytics: tooltip does not include relative time");
const focusedValue = await page.$eval(".analytics-lead>div>strong", (el) =>
  el.textContent?.trim(),
);
const tooltipValue = tooltips.length
  ? await tooltips[0].$eval("strong", (el) => el.textContent?.trim())
  : "";
if (focusedValue !== tooltipValue)
  failures.push(
    "analytics: headline value is not synchronized with chart focus",
  );
await clickText("Data");
await new Promise((r) => setTimeout(r, 700));
if (
  !(await page.$eval("body", (el) => el.innerText.toLowerCase())).includes(
    "exact values",
  )
)
  failures.push("analytics: exact data table failed");
await page.evaluate(() => {
  window.__capturedCsv = "";
  URL.createObjectURL = (blob) => {
    blob.text().then((text) => {
      window.__capturedCsv = text;
    });
    return "blob:captured";
  };
  HTMLAnchorElement.prototype.click = function () {};
});
await clickText("CSV");
await page.waitForFunction(
  () => window.__capturedCsv?.startsWith("date,transactions,active_accounts"),
  { timeout: 5000 },
);
const csvRows = await page.evaluate(
  () => window.__capturedCsv.trim().split("\n").length,
);
if (csvRows !== 8)
  failures.push(
    `analytics: 7-day CSV expected 8 rows including header, found ${csvRows}`,
  );
await clickText("1Y");
await page.waitForFunction(
  () => document.body.innerText.toLowerCase().includes("weekly grain"),
  { timeout: 30000 },
);
if (!page.url().includes("range=365"))
  failures.push("analytics: one-year timeframe is not persisted");
const keyboardChart = await page.$(".analytics-lead .interactive-chart");
await keyboardChart?.focus();
await page.keyboard.press("End");
await page.keyboard.press("ArrowLeft");
if (!(await page.$(".analytics-lead .chart-tooltip")))
  failures.push("analytics: keyboard chart inspection failed");
const successRate = await page.$$eval(".stat-chart", (cards) =>
  Number(
    cards
      .find((card) => card.textContent?.includes("Transaction success"))
      ?.querySelector("strong")
      ?.textContent?.replace("%", ""),
  ),
);
if (!(successRate > 90 && successRate <= 100))
  failures.push(
    `analytics: success ratio is not rendered as a percentage (${successRate})`,
  );

// Language selection is persisted in both URL and local storage, and every
// supported locale remains available after client-side navigation.
await page.goto(`${base}/?lang=en`, {
  waitUntil: "networkidle0",
  timeout: 30000,
});
const localeCount = await page.$$eval(
  ".language-picker option",
  (options) => options.length,
);
if (localeCount !== 10)
  failures.push(`languages: expected 10 choices, found ${localeCount}`);
await page.select(".language-picker select", "fr");
await page.waitForFunction(() => document.documentElement.lang === "fr");
if (
  !page.url().includes("lang=fr") ||
  !(await page.$eval("body", (el) => el.innerText)).includes("Blocs")
)
  failures.push(
    "languages: French selection did not update URL and navigation",
  );
await page.goto(`${base}/pools?lang=ar`, {
  waitUntil: "networkidle0",
  timeout: 30000,
});
const arabic = await page.evaluate(() => ({
  lang: document.documentElement.lang,
  dir: document.documentElement.dir,
  text: document.body.innerText,
}));
if (
  arabic.lang !== "ar" ||
  arabic.dir !== "rtl" ||
  !arabic.text.includes("مجمعات السيولة")
)
  failures.push("languages: Arabic RTL rendering failed");

await page.setViewport({ width: 900, height: 700, deviceScaleFactor: 1 });
await page.goto(`${base}/pools?lang=en`, {
  waitUntil: "networkidle0",
  timeout: 30000,
});
await page.click(".menu");
if (
  !(await page.$eval("header nav", (element) =>
    element.classList.contains("open"),
  ))
)
  failures.push("navigation: compact menu did not open at tablet width");
await page.keyboard.press("Escape");
if (
  await page.$eval("header nav", (element) =>
    element.classList.contains("open"),
  )
)
  failures.push("navigation: Escape did not close the compact menu");
await page.goto(`${base}/pools/${poolPage.items[0].pool_id}`, {
  waitUntil: "networkidle0",
  timeout: 30000,
});
await page.click(".header-search");
await page
  .waitForFunction(
    () =>
      location.pathname === "/search" &&
      document.activeElement?.matches(".global-search input"),
    { timeout: 3000 },
  )
  .catch(() => {});
if (
  !page.url().includes("/search") ||
  !(await page.evaluate(() =>
    document.activeElement?.matches(".global-search input"),
  ))
)
  failures.push(
    "search: header control did not open and focus search from a detail page",
  );

// The server must expose crawlable metadata before the SPA executes.
const seoHtml = await fetch(`${base}/pools?lang=fr`).then((response) =>
  response.text(),
);
for (const marker of [
  "<title>Ink liquidity pools",
  'rel="canonical"',
  'hreflang="ja"',
  "application/ld+json",
  'property="og:title"',
]) {
  if (!seoHtml.includes(marker)) failures.push(`SEO: missing ${marker}`);
}
const robots = await fetch(`${base}/robots.txt`).then((response) =>
  response.text(),
);
const sitemap = await fetch(`${base}/sitemap.xml`).then((response) =>
  response.text(),
);
if (
  !robots.includes("Sitemap:") ||
  !sitemap.includes("/pools") ||
  !sitemap.includes("lang=ar")
)
  failures.push("SEO: robots or multilingual sitemap is incomplete");
await browser.close();

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(
  `Ink Explorer UI smoke test passed (${routes.length} routes × ${viewports.length} viewports).`,
);
