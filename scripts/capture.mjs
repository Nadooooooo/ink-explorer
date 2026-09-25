import puppeteer from "puppeteer-core";
import { mkdir } from "node:fs/promises";
import { nftContract, nftInstance, sampleNftHolder } from "./public-nft-fixture.mjs";

const outputDir = process.env.CAPTURE_DIR || "screenshots";
const base = process.env.BASE_URL || "http://127.0.0.1:4188";
await mkdir(outputDir, { recursive: true });
const browser = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox"] });
const overview = await fetch(`${base}/api/overview`).then(r => r.json());
const pools = await fetch(`${base}/api/contract-info/pools`).then(r => r.json());
const samplePool = pools.items[0].pool_id;
const nftHolder = await sampleNftHolder(base);
for (const shot of [
  { name: "home-desktop", path: "/", width: 1440, height: 1100 },
  { name: "blocks-desktop", path: "/blocks", width: 1440, height: 1100 },
  { name: "transactions-desktop", path: "/txs", width: 1440, height: 1100 },
  { name: "tokens-desktop", path: "/tokens", width: 1440, height: 1100 },
  { name: "pools-desktop", path: "/pools", width: 1440, height: 1100 },
  { name: "pool-detail-desktop", path: `/pools/${samplePool}`, width: 1440, height: 1100 },
  { name: "nft-detail-desktop", path: `/token/${nftContract}/instance/${nftInstance}`, width: 1440, height: 1100 },
  { name: "contracts-desktop", path: "/contracts", width: 1440, height: 1100 },
  { name: "analytics-desktop", path: "/analytics", width: 1440, height: 1100 },
  { name: "network-desktop", path: "/network", width: 1440, height: 1100 },
  { name: "advanced-desktop", path: "/advanced", width: 1440, height: 1100 },
  { name: "developers-desktop", path: "/developers", width: 1440, height: 1100 },
  { name: "search-desktop", path: "/search?q=WETH", width: 1440, height: 1100 },
  { name: "blocks-tablet", path: "/blocks", width: 900, height: 1000 },
  { name: "nfts-desktop", path: `/address/${nftHolder}`, width: 1440, height: 1100, action: "show-nfts" },
  { name: "home-mobile", path: "/", width: 390, height: 844 },
  { name: "home-arabic-mobile", path: "/?lang=ar", width: 390, height: 844 },
  { name: "pools-mobile", path: "/pools?lang=fr", width: 390, height: 844 },
  { name: "pool-detail-mobile", path: `/pools/${samplePool}`, width: 390, height: 844 },
  { name: "nft-detail-mobile", path: `/token/${nftContract}/instance/${nftInstance}`, width: 390, height: 844 },
  { name: "analytics-mobile", path: "/analytics", width: 390, height: 844 },
  { name: "analytics-touch-mobile", path: "/analytics?range=7", width: 390, height: 844, action: "touch-chart" },
  { name: "analytics-data-mobile", path: "/analytics?range=7", width: 390, height: 844, action: "show-data" },
  { name: "advanced-mobile", path: "/advanced", width: 390, height: 844 },
  { name: "developers-mobile", path: "/developers", width: 390, height: 844 },
  { name: "transactions-mobile", path: "/txs", width: 390, height: 844 },
  { name: "transaction-mobile", path: `/tx/${overview.transactions[0].hash}`, width: 390, height: 844 },
  { name: "contract-address-mobile", path: "/address/0x4200000000000000000000000000000000000006", width: 390, height: 844 },
  { name: "nfts-mobile", path: `/address/${nftHolder}`, width: 390, height: 844, action: "show-nfts" },
  { name: "home-menu-small-mobile", path: "/", width: 320, height: 700, action: "open-menu" },
  { name: "contracts-small-mobile", path: "/contracts", width: 320, height: 700 },
]) {
  const page = await browser.newPage();
  await page.setViewport({ width: shot.width, height: shot.height, deviceScaleFactor: 1, isMobile: shot.width <= 430, hasTouch: shot.width <= 430 });
  await page.goto(`${base}${shot.path}`, { waitUntil: "networkidle0", timeout: 30000 });
  if (shot.action === "touch-chart") {
    await page.$eval(".analytics-lead .interactive-chart", el => window.scrollTo({top:el.getBoundingClientRect().top+scrollY-innerHeight*.4,behavior:"instant"}));
    await new Promise(resolve => setTimeout(resolve, 100));
    const box = await page.$eval(".analytics-lead .interactive-chart", el => { const r=el.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}; });
    await page.touchscreen.tap(box.x + box.width * .46, box.y + box.height * .55);
  }
  if (shot.action === "show-data") {
    await page.$$eval("button", buttons => buttons.find(button => button.textContent?.trim() === "Data")?.click());
    await page.waitForSelector(".analytics-data");
    await new Promise(resolve => setTimeout(resolve, 700));
  }
  if (shot.action === "show-nfts") {
    await page.$$eval("button", buttons => buttons.find(button => button.textContent?.trim() === "NFTs")?.click());
    await page.waitForSelector(".nft-grid");
    await new Promise(resolve => setTimeout(resolve, 1200));
    await page.$eval(".nft-grid", el => window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - 150, behavior: "instant" }));
  }
  if (shot.action === "open-menu") {
    await page.click(".menu");
    await page.waitForSelector("header nav.open");
  }
  await page.screenshot({ path: `${outputDir}/${shot.name}.png`, fullPage: false });
  await page.close();
}
await browser.close();
