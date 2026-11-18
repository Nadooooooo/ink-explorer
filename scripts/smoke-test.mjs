import puppeteer from "puppeteer-core";
import {writeFile} from "node:fs/promises";
import { nftContract, nftInstance, sampleNftHolder } from "./public-nft-fixture.mjs";

const base = process.env.BASE_URL || "http://127.0.0.1:4188";
function isLocalCachedNftSource(source, baseUrl) {
  try {
    const origin = new URL(baseUrl).origin;
    const url = new URL(source, origin);
    const kind = url.searchParams.get("kind") ?? "original";
    return url.origin === origin && url.pathname === "/api/media" &&
      url.searchParams.getAll("url").length === 1 &&
      Boolean(url.searchParams.get("url")?.trim()) &&
      url.searchParams.getAll("kind").length <= 1 &&
      ["original", "thumbnail"].includes(kind);
  } catch {
    return false;
  }
}

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
  ["/analytics", "Chain stats"],
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
  [`/block/${overview.blocks[0].height}`, "Block hash"],
  [`/tx/${sampleTx.hash}`, "Transaction details"],
  [`/address/${sampleTx.from.hash}`, "ETH BALANCE"],
  [`/token/${tokenPage.items[0].address_hash}`, "Token transfers"],
  [`/pools/${poolPage.items[0].pool_id}`, "LIQUIDITY POOL"],
  [
    `/token/${nftContract}/instance/${nftInstance}`,
    "Token ID",
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
const routeViewports=process.env.UI_INTERACTIONS_ONLY==='1'?[]:viewports;
for (const viewport of routeViewports) {
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
        search = rect("header .header-search-field");
      return {
        mainWidth: main?.width || 0,
        mainLeft: main?.left || 0,
        brandLeft: brand?.left || 0,
        navRight: nav?.right || 0,
        searchLeft: search?.left || 0,
      };
    });
    if (!response?.ok() && response?.status() !== 304)
      failures.push(`${viewport.name} ${route}: HTTP ${response?.status()}`);
    if (!body.toLocaleLowerCase().includes(expected.toLocaleLowerCase()))
      failures.push(`${viewport.name} ${route}: missing ${expected}`);
    if (body.includes("Data temporarily unavailable"))
      failures.push(`${viewport.name} ${route}: upstream error state`);
    if (overflow)
      failures.push(`${viewport.name} ${route}: horizontal overflow`);
    if (viewport.width >= 1200 && Math.abs(layout.mainWidth - Math.min(1800, viewport.width - 64)) > 1)
      failures.push(
        `${viewport.name} ${route}: content rail does not use the available width (${layout.mainWidth}px)`,
      );
    if (viewport.width >= 1180 && layout.searchLeft > 0 && layout.navRight > layout.searchLeft + 1)
      failures.push(`${viewport.name} ${route}: navigation overlaps search`);
    if (
      viewport.width >= 1180 &&
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
      expectedTop: Math.max(0, document.querySelector(".utility-bar").getBoundingClientRect().bottom),
    }));
    if (viewport.width > 760 && Math.abs(stickyTop - expectedTop) > 1)
      failures.push(
        `${viewport.name} ${route}: sticky header left the viewport (${stickyTop}px)`,
      );
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  }
  if (consoleErrors.length)
    failures.push(
      `${viewport.name}: console errors: ${consoleErrors.join(" | ")}`,
    );
  console.log(`Route overview passed through ${viewport.name}`);
  await page.close();
}

await writeFile('reports/ui-route-preflight.json',JSON.stringify({failures},null,2));
console.log('Route overview findings',JSON.stringify(failures));
const page = await browser.newPage();
await page.goto(base, { waitUntil: "networkidle0", timeout: 30000 });
await page.waitForFunction(
  () => document.querySelector('[data-live-transport="websocket"][data-live-head]:not([data-live-head=""])'),
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
  ".activity-ledger-blocks .block-height a[href]",
  (element) => Number((element.textContent || "").replace(/\D/g, "")),
);
await page
  .waitForFunction(
    (initial) =>
      Number(
        (
          document.querySelector(".activity-ledger-blocks .block-height a[href]")
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
        document.querySelector(".activity-ledger-blocks .block-height a[href]")
          ?.textContent || ""
      ).replace(/\D/g, ""),
    ),
    status:
      document.querySelector("[data-live-transport]")?.getAttribute("data-live-transport") || "",
  }),
  initialBlockHeight,
);
if (
  liveBlockState.height <= initialBlockHeight ||
  liveBlockState.status !== "websocket"
)
  failures.push(
    `blocks: live head did not advance (${initialBlockHeight} → ${liveBlockState.height}, ${liveBlockState.status})`,
  );
await page.goto(`${base}/txs`, { waitUntil: "networkidle0", timeout: 30000 });
await page.waitForSelector(".activity-ledger-transactions .tx-row");
await page
  .waitForSelector(".activity-ledger-transactions .tx-row.live-arrival", { timeout: 20000 })
  .catch(() => {});
const liveTransactionState = await page.evaluate(() => ({
  liveRows: document.querySelectorAll(".activity-ledger-transactions .tx-row.live-arrival").length,
  marks: document.querySelectorAll(".activity-ledger-transactions .tx-row .entity-mark").length,
  status:
    document.querySelector("[data-live-transport]")?.getAttribute("data-live-transport") || "",
}));
if (
  !liveTransactionState.liveRows ||
  liveTransactionState.marks < 2 ||
  liveTransactionState.status !== "websocket"
)
  failures.push(
    `transactions: live rows or identity marks missing (${JSON.stringify(liveTransactionState)})`,
  );
const clickText = async label => {
  for (const button of await page.$$('button')) {
    if (await button.evaluate((el,label)=>el.textContent?.trim()===label && el.getClientRects().length>0,label)) { await button.click();return; }
  }
  const picker=await page.$('.section-picker select');
  if (picker && await picker.evaluate(el=>el.getClientRects().length>0)) {
    const value=await picker.evaluate((el,label)=>[...el.options].find(option=>option.textContent.trim()===label)?.value,label);
    if (value) {await page.select('.section-picker select',value);return;}
  }
  throw new Error(`Visible control '${label}' not found`);
};
await page.goto(`${base}/tx/${sampleTx.hash}`, {
  waitUntil: "networkidle0",
  timeout: 30000,
});
await clickText("Input data");
if (!(await page.$eval("body", (el) => el.innerText)).toLowerCase().includes("method"))
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
    () => document.querySelector(".address-activity .state-row,.address-activity .empty,.address-activity .error-state"),
    { timeout: 15000 },
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
await page.waitForSelector(".asset-row", { timeout: 10000 });
if (!(await page.$$(".asset-row")).length)
  failures.push("address: assets tab did not render holdings");
await clickText("Contract source");
await page.waitForSelector(".contract-source,.address-activity .error-state", { timeout: 15000 });
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
const firstNftPage = await page.$$eval('.nft-item', items=>items.map(item=>item.getAttribute('href')));
await page.click('.token-list-controls .cursor-pagination button[aria-label="Next page"]');
await page.waitForFunction(first=>document.querySelector('.nft-item')?.getAttribute('href')!==first && document.querySelector('.nft-item'),{},firstNftPage[0]);
const nextNftPage=await page.$$eval('.nft-item',items=>items.map(item=>item.getAttribute('href')));
if (firstNftPage.length!==50 || !nextNftPage.length || nextNftPage.length>50 || nextNftPage.some(href=>firstNftPage.includes(href)) || new Set(nextNftPage).size!==nextNftPage.length) failures.push('NFTs: cursor pagination repeated or omitted the requested page');
await page.click('.token-list-controls .cursor-pagination button[aria-label="Previous page"]');
await page.waitForFunction(first=>document.querySelector('.nft-item')?.getAttribute('href')===first,{},firstNftPage[0]);
const restoredNfts=await page.$$eval('.nft-item',items=>items.map(item=>item.getAttribute('href')));
if (JSON.stringify(restoredNfts)!==JSON.stringify(firstNftPage)) failures.push('NFTs: previous page did not restore its records');
const nftMedia = await page.$$eval(".nft-item img", (images) =>
  images.map((img) => img.getAttribute("src")).filter(Boolean),
);
if (!nftMedia.some((src) => isLocalCachedNftSource(src, base)))
  failures.push("NFTs: remote media does not use the local cache");
const cachedNfts = nftMedia.filter((src) => isLocalCachedNftSource(src, base));
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
  !(await page.$eval("body", (el) => el.innerText.replace(/\s/g, ""))).includes(
    `${poolPage.items[0].base_token_symbol}/${poolPage.items[0].quote_token_symbol}`,
  )
)
  failures.push("pool/address: cross-link classification is missing");
await clickText("Overview");
await page.waitForSelector('.address-facts');
const poolLink = await page.$$eval('.address-facts .text-link', (buttons, pair) => {
  const button = buttons.find(element => element.textContent.replace(/\s/g, '') === pair);
  button?.click();
  return Boolean(button);
}, `${poolPage.items[0].base_token_symbol}/${poolPage.items[0].quote_token_symbol}`);
if (!poolLink) failures.push('pool/address: pool details link is missing');
else await page.waitForFunction(id => location.pathname === `/pools/${id}`, {timeout:5000}, poolPage.items[0].pool_id);
await page.goto(`${base}/txs`, { waitUntil: "networkidle0", timeout: 30000 });
await page.goto(`${base}/token-transfers`,{waitUntil:"networkidle0",timeout:30000});
await page.waitForSelector(".transfer-ledger");
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
await page.waitForSelector(".token-hero", { timeout: 30000 });
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
for (const [label,endpoint] of [['L2 → L1 withdrawals','/api/explorer/optimism/withdrawals'],['User operations','/api/explorer/proxy/account-abstraction/operations']]) {
  const response=page.waitForResponse(response=>new URL(response.url()).pathname===endpoint);
  await clickText(label);
  if (!(await response).ok()) failures.push(`Advanced activity: ${label} request failed`);
  await page.waitForFunction(()=>document.querySelector('.advanced-list[aria-busy="false"]'));
  const selected=await page.$eval('.tabs button.active',el=>el.textContent.trim());
  if(selected!==label) failures.push(`Advanced activity: ${label} did not become the active section`);
}
await page.setViewport({
  width: 390,
  height: 844,
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});
await page.goto(`${base}/stats/newTxns`, {waitUntil:'networkidle0',timeout:30000});
await page.waitForSelector('article.stat-chart .chart-range select');
await page.select('article.stat-chart .chart-range select','7');
await page.$eval('article.stat-chart',el=>el.scrollIntoView({block:'center',behavior:'instant'}));
await page.waitForSelector('article.stat-chart[aria-busy="false"] .interactive-chart');
await page.$eval('article.stat-chart .interactive-chart',el=>el.scrollIntoView({block:'center',behavior:'instant'}));
await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const chartBox=await page.$eval('article.stat-chart .interactive-chart',el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};});
await page.touchscreen.tap(chartBox.x+chartBox.width*.42,chartBox.y+chartBox.height*.55);
await page.waitForSelector('.chart-tooltip');
if((await page.$$('.chart-tooltip')).length!==1)failures.push('statistics: exactly one local inspector expected');
if(!await page.$eval('.chart-tooltip strong',el=>el.textContent.trim()))failures.push('statistics: selected point has no value');
await page.keyboard.press('Escape');
await page.click('.chart-data summary');
await page.waitForSelector('.chart-data tbody tr');
const exactRowCount=await page.$$eval('.chart-data tbody tr',rows=>rows.length);
await page.evaluate(()=>{window.__capturedCsv='';URL.createObjectURL=blob=>{blob.text().then(text=>window.__capturedCsv=text);return'blob:captured';};HTMLAnchorElement.prototype.click=function(){};});
await page.click('.chart-data button');
await page.waitForFunction(()=>window.__capturedCsv?.length>0);
const exportedRows=await page.evaluate(()=>window.__capturedCsv.trim().split('\n').length);
if(exportedRows!==exactRowCount+1)failures.push('statistics: CSV rows must exactly match the displayed observations plus header');
await page.select('article.stat-chart .chart-range select','365');
await page.waitForFunction(()=>document.querySelector('article.stat-chart')?.getAttribute('aria-busy')==='false');
await page.$eval('.interactive-chart',el=>el.scrollIntoView({block:'center',behavior:'instant'}));
const keyboardChart=await page.$('.interactive-chart');await keyboardChart.focus();
await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
await page.keyboard.press('End');await page.keyboard.press('ArrowLeft');
if(!await page.$('.chart-tooltip'))failures.push('statistics: keyboard inspection failed');

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
const utilityLanguageVisible = await page.$eval('.utility-bar .language-picker select', node => node.getClientRects().length > 0);
if (!utilityLanguageVisible) await page.click('.drawer-trigger');
await page.select(utilityLanguageVisible ? '.utility-bar .language-picker select' : '.drawer-preferences .language-picker select', 'fr');
if (!utilityLanguageVisible) await page.keyboard.press('Escape');
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
await page.click('.drawer-trigger');
if (!await page.$('.mobile-drawer')) failures.push('navigation: compact drawer did not open at tablet width');
await page.keyboard.press('Escape');
if (await page.$('.mobile-drawer')) failures.push('navigation: Escape did not close compact drawer');
await page.goto(`${base}/pools/${poolPage.items[0].pool_id}`, {
  waitUntil: "networkidle0",
  timeout: 30000,
});
const inlineSearchVisible = await page.$eval('header .global-search input', el => el.getClientRects().length > 0);
if (!inlineSearchVisible) await page.click('.mobile-search-trigger');
await page.click('header .global-search input');
if (!await page.$eval('header .global-search input', el => el === document.activeElement && el.getClientRects().length > 0)) failures.push('search: header control did not open and focus the visible inline search');

// The server must expose crawlable metadata before the SPA executes.
const serverBase = process.env.SERVER_BASE_URL || base;
const seoHtml = await fetch(`${serverBase}/pools?lang=fr`).then((response) =>
  response.text(),
);
for (const marker of [
  process.env.EDGE_SEO === "1" ? "<title>Pools — Ink Explorer</title>" : "<title>Ink liquidity pools",
  'rel="canonical"',
  'hreflang="ja"',
  "application/ld+json",
  'property="og:title"',
]) {
  if (!seoHtml.includes(marker)) failures.push(`SEO: missing ${marker}`);
}
const robots = await fetch(`${serverBase}/robots.txt`).then((response) =>
  response.text(),
);
const sitemap = await fetch(`${serverBase}/sitemap.xml`).then((response) =>
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
  `Ink Explorer UI smoke test passed (${routes.length} routes × ${routeViewports.length} viewports).`,
);
