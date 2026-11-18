import puppeteer from "puppeteer-core";
import { nftContract, nftInstance, sampleNftHolder } from "./public-nft-fixture.mjs";

const base = process.env.BASE_URL || "http://127.0.0.1:4188";
const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox"],
});
const failures = [];
const overview = await fetch(`${base}/api/overview`).then((response) =>
  response.json(),
);
const tokens = await fetch(`${base}/api/explorer/tokens`).then((response) =>
  response.json(),
);
const pools = await fetch(`${base}/api/contract-info/pools`).then((response) =>
  response.json(),
);
const nftHolder = await sampleNftHolder(base);

const routes = [
  ["home", "/"],
  ["blocks", "/blocks"],
  ["transactions", "/txs"],
  ["filtered-activity", "/txs?activity=filtered"],
  ["tokens", "/tokens"],
  ["pools", "/pools"],
  ["contracts", "/contracts"],
  ["analytics", "/analytics"],
  ["advanced", "/advanced"],
  ["developers", "/developers"],
  ["network", "/network"],
  ["search", "/search?q=WETH"],
  ["block", `/block/${overview.blocks[0].height}`],
  ["transaction", `/tx/${overview.transactions[0].hash}`],
  ["address", `/address/${overview.transactions[0].from.hash}`],
  ["token", `/token/${tokens.items[0].address_hash}`],
  ["pool", `/pools/${pools.items[0].pool_id}`],
  ["nft", `/token/${nftContract}/instance/${nftInstance}`],
  ["address-nfts", `/address/${nftHolder}`, "NFTs"],
  ["token-instances", `/token/${nftContract}`, "Token instances"],
].filter(([name]) => !process.env.LAYOUT_ROUTES || process.env.LAYOUT_ROUTES.split(",").includes(name));

const viewports = [
  [2560, 1440, "ultrawide"],
  [1920, 1080, "wide-desktop"],
  [1440, 900, "desktop"],
  [1280, 800, "laptop"],
  [1024, 768, "small-desktop"],
  [900, 1000, "tablet"],
  [768, 1024, "compact-tablet"],
  [844, 390, "landscape"],
  [430, 932, "large-mobile"],
  [390, 844, "mobile"],
  [360, 800, "compact-mobile"],
  [320, 700, "small-mobile"],
].filter(([width]) => !process.env.LAYOUT_WIDTHS || process.env.LAYOUT_WIDTHS.split(",").map(Number).includes(width));

const groups = [
  ".activity-filter-grid",
  ".activity-actions",
  ".activity-record-meta",
  ".home-overview",
  ".metric-grid",
  ".address-summary",
  ".health-grid",
  ".live-columns",
  ".detail-layout",
  ".definitions",
  ".entity-profile",
  ".nft-detail",
  ".nft-attributes > div",
  ".pool-detail-grid",
  ".analytics-counters",
  ".analytics-grid",
  ".stat-chart-grid",
  ".developer-grid",
  ".contract-grid",
  ".token-hero",
  ".pool-hero",
  ".page-intro",
  ".generic-row",
  ".tx-row",
  ".block-row",
  ".pool-row",
  ".token-row",
  ".asset-row",
  ".state-row",
  ".protocol-row",
  ".network-detail",
  ".pool-filter-top",
  ".pool-filter-grid",
  ".pool-pagination",
  ".site-footer",
];

async function inspect(page, label, headerDocumentTop) {
  const result = await page.evaluate((selectors) => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity) !== 0 &&
        rect.width > 1 &&
        rect.height > 1
      );
    };
    const box = (element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    };
    const collisions = [];
    for (const selector of selectors) {
      for (const container of document.querySelectorAll(selector)) {
        if (!visible(container)) continue;
        const children = [...container.children].filter(
          (child) =>
            visible(child) &&
            !["absolute", "fixed"].includes(getComputedStyle(child).position),
        );
        for (let i = 0; i < children.length; i++) {
          const a = box(children[i]);
          for (let j = i + 1; j < children.length; j++) {
            const b = box(children[j]);
            const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
            const height =
              Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
            if (width > 2 && height > 2)
              collisions.push(
                `${selector}: ${children[i].tagName}.${children[i].className} overlaps ${children[j].tagName}.${children[j].className} (${Math.round(width)}×${Math.round(height)})`,
              );
          }
        }
      }
    }
    const header = document.querySelector("header");
    const headerParts = [
      ".brand",
      ".language-picker",
      ".header-search-field",
      ".drawer-trigger",
    ]
      .map((selector) => header?.querySelector(selector))
      .filter((element) => element && visible(element));
    const headerBoxes = headerParts.map((element) => ({
      element,
      rect: box(element),
    }));
    for (let i = 0; i < headerBoxes.length; i++) {
      const current = headerBoxes[i];
      if (current.rect.left < -1 || current.rect.right > innerWidth + 1)
        collisions.push(`header: ${current.element.className} leaves viewport`);
      for (let j = i + 1; j < headerBoxes.length; j++) {
        const next = headerBoxes[j];
        if (
          Math.min(current.rect.right, next.rect.right) -
            Math.max(current.rect.left, next.rect.left) >
            1 &&
          Math.min(current.rect.bottom, next.rect.bottom) -
            Math.max(current.rect.top, next.rect.top) >
            1
        )
          collisions.push(
            `header: ${current.element.className} overlaps ${next.element.className}`,
          );
      }
    }
    const clipped = [
      ...document.querySelectorAll(
        "h1,h2,h3,.metric > strong,.nft-item > span,.nft-item > strong,.pool-pair strong",
      ),
    ]
      .filter(visible)
      .filter((element) => {
        const style = getComputedStyle(element);
        if (
          style.textOverflow === "ellipsis" ||
          ["auto", "scroll"].includes(style.overflowX) ||
          ["anywhere", "break-word"].includes(style.overflowWrap) ||
          style.wordBreak === "break-all"
        )
          return false;
        return element.scrollWidth > element.clientWidth + 1;
      })
      .map(
        (element) =>
          `${element.tagName}.${element.className}: ${String(
            element.textContent || "",
          )
            .trim()
            .slice(0, 60)}`,
      );
    const headerRect = header ? box(header) : null;
    return {
      width:innerWidth,
      overflowX: document.documentElement.scrollWidth - innerWidth,
      collisions: [...new Set(collisions)],
      clipped: [...new Set(clipped)],
      headerTop: headerRect?.top,
      headerPosition: header && getComputedStyle(header).position,
      headerInset: header ? parseFloat(getComputedStyle(header).top) : NaN,
      scrollY,
      body: document.body.innerText,
    };
  }, groups);
  if (result.overflowX > 1)
    failures.push(`${label}: horizontal overflow ${result.overflowX}px`);
  if (result.width > 760 && headerDocumentTop !== undefined) {
    if (result.headerPosition !== "sticky" || !Number.isFinite(result.headerInset)) {
      failures.push(`${label}: desktop header must retain a finite sticky inset`);
    } else {
      const expectedTop = Math.max(result.headerInset, headerDocumentTop - result.scrollY);
      if (Math.abs(result.headerTop - expectedTop) > 1)
        failures.push(`${label}: sticky header top ${result.headerTop}px, expected ${expectedTop}px at scroll ${result.scrollY}px`);
    }
  }
  for (const message of result.collisions)
    failures.push(`${label}: ${message}`);
  for (const message of result.clipped)
    failures.push(`${label}: clipped text ${message}`);
  return result;
}

try {
  for (const [width, height, viewportName] of viewports) {
    console.log(`Checking ${viewportName} (${width}×${height})…`);
    const page = await browser.newPage();
    await page.setViewport({
      width,
      height,
      deviceScaleFactor: 1,
      isMobile: width <= 430 || viewportName === "landscape",
      hasTouch: width <= 430 || viewportName === "landscape",
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const [routeName, route, action] of routes) {
      process.stdout.write(`  ${routeName}\n`);
      const response = await page.goto(`${base}${route}`, {
        waitUntil: "networkidle0",
        timeout: 30000,
      });
      if (!response?.ok() && response?.status() !== 304)
        failures.push(
          `${viewportName} ${routeName}: HTTP ${response?.status()}`,
        );
      if (action) {
        let clicked=false;
        const picker=await page.$('.section-picker select');
        if(picker && await picker.evaluate(el=>el.getClientRects().length>0)) {
          const value=await picker.evaluate((el,label)=>[...el.options].find(option=>option.textContent.trim()===label)?.value,action);
          if(value){await page.select('.section-picker select',value);clicked=true;}
        } else for(const button of await page.$$('.tabs button')) {
          if(await button.evaluate((el,label)=>el.textContent.trim()===label && el.getClientRects().length>0,action)){await button.click();clicked=true;break;}
        }
        if (!clicked)
          failures.push(
            `${viewportName} ${routeName}: missing ${action} control`,
          );
        await page
          .waitForSelector(".nft-grid", { timeout: 15000 })
          .catch(() => {});
      }
      const body = await page.$eval("body", (element) => element.innerText);
      if (body.includes("Data temporarily unavailable"))
        failures.push(`${viewportName} ${routeName}: upstream error state`);
      // The utility bar precedes the sticky header. Sample both its natural
      // position and its pinned position, including short pages whose entire
      // scroll range is smaller than the utility bar. CSS smooth scrolling must
      // not leave a sample between the requested coordinates.
      const headerDocumentTop = await page.evaluate(() => {
        window.scrollTo({ top: 0, left: 0, behavior: "instant" });
        return document.querySelector("header").getBoundingClientRect().top;
      });
      const maxScroll = await page.evaluate(() =>
        Math.max(0, document.documentElement.scrollHeight - innerHeight),
      );
      const positions = [
        ...new Set(
          [0, 0.25, 0.5, 0.75, 1].map((ratio) => Math.round(maxScroll * ratio)),
        ),
      ];
      for (const position of positions) {
        await page.evaluate((y) => window.scrollTo({ top: y, left: 0, behavior: "instant" }), position);
        await new Promise((resolve) => setTimeout(resolve, 35));
        await inspect(page, `${viewportName} ${routeName} @${position}`, headerDocumentTop);
      }
    }
    if (errors.length)
      failures.push(`${viewportName}: page errors: ${errors.join(" | ")}`);
    await page.close();
  }

  const nftPage = await browser.newPage();
  console.log("Checking NFT pagination and media fallbacks…");
  await nftPage.setViewport({
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  await nftPage.goto(`${base}/address/${nftHolder}`, {
    waitUntil: "networkidle0",
    timeout: 30000,
  });
  await nftPage.waitForSelector('.section-picker select');
  await nftPage.select('.section-picker select','nft');
  await nftPage.waitForSelector(".nft-grid", { timeout: 15000 });
  const firstPage=await nftPage.$$eval('.nft-item',items=>items.map(el=>el.getAttribute('href')));
  const beforeScroll=await nftPage.evaluate(()=>scrollY);
  await nftPage.click('.token-list-controls .cursor-pagination button[aria-label="Next page"]');
  await nftPage.waitForFunction(first=>document.querySelector('.nft-item')?.getAttribute('href')!==first && document.querySelector('.nft-item'),{},firstPage[0]);
  const secondPage=await nftPage.$$eval('.nft-item',items=>items.map(el=>el.getAttribute('href')));
  if(firstPage.length!==50 || !secondPage.length || secondPage.length>50 || secondPage.some(href=>firstPage.includes(href))) failures.push('NFT cursor did not display a separate next page');
  const height = await nftPage.evaluate(
    () => document.documentElement.scrollHeight,
  );
  for (let y = beforeScroll; y < height; y += 650) {
    await nftPage.evaluate((position) => window.scrollTo(0, position), y);
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
  const media = await nftPage.$$eval(".nft-item", (items) =>
    items.map((item) => ({
      image: Boolean(
        item.querySelector("img")?.complete &&
        item.querySelector("img")?.naturalWidth,
      ),
      placeholder: Boolean(item.querySelector(".nft-placeholder")),
    })),
  );
  if (media.some((item) => !item.image && !item.placeholder))
    failures.push(
      "NFT media: at least one card has neither a loaded image nor a placeholder",
    );
  await nftPage.close();

  console.log("Checking pool filters in every locale…");
  for (const locale of [
    "en",
    "zh",
    "hi",
    "es",
    "fr",
    "ar",
    "bn",
    "pt",
    "ru",
    "ja",
  ]) {
    const localePage = await browser.newPage();
    await localePage.setViewport({
      width: 320,
      height: 700,
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
    });
    await localePage.goto(`${base}/pools?lang=${locale}`, {
      waitUntil: "networkidle0",
      timeout: 30000,
    });
    await localePage.waitForSelector(".pool-row");
    const language = await localePage.$eval("html", (element) => element.lang);
    if (language !== locale)
      failures.push(`pool locale ${locale}: document language is ${language}`);
    await inspect(localePage, `pool locale ${locale} @top`);
    await localePage.$eval(".pool-workbench", (element) =>
      element.scrollIntoView({ block: "start" }),
    );
    await inspect(localePage, `pool locale ${locale} @filters`);
    await localePage.close();
  }
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(
  `Layout stress test passed (${routes.length} routes × ${viewports.length} viewports × full-page scroll, distinct NFT cursor pages and pool filters in 10 locales).`,
);
