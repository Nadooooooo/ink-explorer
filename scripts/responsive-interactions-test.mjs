import { readFile } from "node:fs/promises";
import puppeteer from "puppeteer-core";

const base = process.env.BASE_URL || "http://127.0.0.1:4188";
const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox"],
});
const failures = [];
const requiredWidths = [320, 360, 390, 430, 768, 1024, 1280, 1440, 1920, 2560];
const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
const breakpoints = [
  ...new Set(
    [...css.matchAll(/\((?:min|max)-width:\s*(\d+)px\)/g)].map((match) =>
      Number(match[1]),
    ),
  ),
].filter((width) => width >= 320 && width <= 2560);
const widths = [
  ...new Set([
    ...requiredWidths,
    ...breakpoints.flatMap((width) => [width - 1, width, width + 1]),
  ]),
].sort((a, b) => a - b);

async function inspect(page, label) {
  const state = await page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        rect.width > 0 &&
        rect.height > 0
      );
    };
    const outside = [...document.querySelectorAll("body *")]
      .filter(visible)
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        if (["absolute", "fixed"].includes(style.position)) return false;
        if (["auto", "scroll"].includes(style.overflowX)) return false;
        return rect.left < -1 || rect.right > innerWidth + 1;
      })
      .slice(0, 8)
      .map((element) => `${element.tagName}.${element.className}`);
    const brokenImages = [...document.images]
      .filter((image) => image.complete && image.naturalWidth === 0)
      .map((image) => image.currentSrc || image.src)
      .slice(0, 5);
    const headerTargets = [
      ...document.querySelectorAll(
        "header .language-picker, header .header-search, header .menu",
      ),
    ]
      .filter(visible)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          name: element.className,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      });
    return {
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      outside,
      brokenImages,
      headerTargets,
    };
  });
  if (state.scrollWidth > state.clientWidth + 1)
    failures.push(
      `${label}: horizontal overflow ${state.scrollWidth - state.clientWidth}px`,
    );
  if (state.outside.length)
    failures.push(`${label}: elements leave viewport: ${state.outside.join(", ")}`);
  if (state.brokenImages.length)
    failures.push(`${label}: broken images: ${state.brokenImages.join(", ")}`);
  if (
    state.clientWidth <= 760 &&
    state.headerTargets.some((target) => target.width < 44 || target.height < 44)
  )
    failures.push(
      `${label}: undersized header target ${JSON.stringify(state.headerTargets)}`,
    );
}

try {
  for (const width of widths) {
    const height = width === 844 ? 390 : width <= 430 ? 844 : 900;
    const page = await browser.newPage();
    await page.setViewport({
      width,
      height,
      deviceScaleFactor: 1,
      isMobile: width <= 430,
      hasTouch: width <= 430,
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const response = await page.goto(base, {
      waitUntil: "networkidle0",
      timeout: 30_000,
    });
    if (!response?.ok()) failures.push(`${width}px: HTTP ${response?.status()}`);
    await inspect(page, `${width}px home`);

    const menu = await page.$(".menu");
    const menuVisible = await menu?.evaluate((element) => {
      const style = getComputedStyle(element);
      return style.display !== "none";
    });
    if (width <= 1160 && !menuVisible)
      failures.push(`${width}px: compact menu trigger is missing`);
    if (width > 1160 && menuVisible)
      failures.push(`${width}px: compact menu trigger remains visible`);
    if (menuVisible && menu) {
      await menu.click();
      const opened = await page.$eval(
        ".menu",
        (element) => element.getAttribute("aria-expanded") === "true",
      );
      if (!opened) failures.push(`${width}px: menu did not open`);
      await inspect(page, `${width}px open menu`);
      const navState = await page.$eval("header nav", (element) => {
        const rect = element.getBoundingClientRect();
        const controls = [...element.querySelectorAll("button")].map((button) => {
          const box = button.getBoundingClientRect();
          return {
            width: box.width,
            height: box.height,
            visible: box.width > 0 && box.height > 0,
          };
        });
        return {
          left: rect.left,
          right: rect.right,
          bottom: rect.bottom,
          controls,
        };
      });
      if (
        navState.left < -1 ||
        navState.right > width + 1 ||
        navState.bottom > height + 1 ||
        navState.controls.some(
          (control) =>
            !control.visible || control.width < 44 || control.height < 44,
        )
      )
        failures.push(`${width}px: open menu is clipped or hard to tap`);

      await page.keyboard.press("Escape");
      await new Promise((resolve) => setTimeout(resolve, 50));
      const escapeState = await page.$eval(".menu", (element) => ({
        open: element.getAttribute("aria-expanded"),
        focused: document.activeElement === element,
      }));
      if (escapeState.open !== "false" || !escapeState.focused)
        failures.push(`${width}px: Escape did not close menu and restore focus`);

      await menu.click();
      await page.click("main");
      if (
        (await page.$eval(".menu", (element) =>
          element.getAttribute("aria-expanded"),
        )) !== "false"
      )
        failures.push(`${width}px: outside click did not close menu`);
    }
    if (errors.length) failures.push(`${width}px: ${errors.join(" | ")}`);
    await page.close();
  }

  const landscape = await browser.newPage();
  await landscape.setViewport({ width: 844, height: 390, deviceScaleFactor: 1 });
  await landscape.goto(`${base}/pools`, {
    waitUntil: "networkidle0",
    timeout: 30_000,
  });
  await inspect(landscape, "844×390 pools landscape");
  await landscape.close();

  const stress = await browser.newPage();
  await stress.setViewport({
    width: 320,
    height: 700,
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  await stress.goto(`${base}/txs`, {
    waitUntil: "networkidle0",
    timeout: 30_000,
  });
  await stress.evaluate(() => {
    const title = document.querySelector(".page-intro h1");
    if (title)
      title.textContent =
        "Transactions with a deliberately long localized heading for reflow";
    for (const value of document.querySelectorAll(".copyable .text-link"))
      value.textContent = `0x${"abcdef".repeat(16)}`;
  });
  await inspect(stress, "320px constrained content");
  await stress.close();

  const recovery = await browser.newPage();
  await recovery.setViewport({
    width: 320,
    height: 700,
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  let failBlocks = true;
  await recovery.setRequestInterception(true);
  recovery.on("request", (request) => {
    if (
      failBlocks &&
      new URL(request.url()).pathname === "/api/explorer/blocks"
    ) {
      request.respond({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Synthetic upstream outage" }),
      });
    } else request.continue();
  });
  await recovery.goto(`${base}/blocks`, {
    waitUntil: "networkidle0",
    timeout: 30_000,
  });
  await recovery.waitForSelector(".error-state button");
  await inspect(recovery, "320px network error");
  failBlocks = false;
  await Promise.all([
    recovery.waitForNavigation({ waitUntil: "networkidle0", timeout: 30_000 }),
    recovery.click(".error-state button"),
  ]);
  if (!(await recovery.$(".block-list .block-row")))
    failures.push("network error: retry did not recover the block ledger");
  await recovery.close();

  const empty = await browser.newPage();
  await empty.setViewport({ width: 320, height: 700, deviceScaleFactor: 1 });
  await empty.goto(`${base}/search?q=definitely-no-such-ink-result-4f87d9`, {
    waitUntil: "networkidle0",
    timeout: 30_000,
  });
  if (!(await empty.$(".search-results .empty")))
    failures.push("empty state: no-results search did not render its empty state");
  await inspect(empty, "320px empty search");
  await empty.close();

  const stale = await browser.newPage();
  await stale.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await stale.setRequestInterception(true);
  let delayedTransfer = false;
  stale.on("request", (request) => {
    if (
      !delayedTransfer &&
      new URL(request.url()).pathname.endsWith(
        "/api/explorer/tokens/0x4200000000000000000000000000000000000006/transfers",
      )
    ) {
      delayedTransfer = true;
      setTimeout(() => request.continue(), 1_500);
    } else request.continue();
  });
  await stale.goto(
    `${base}/token/0x4200000000000000000000000000000000000006`,
    { waitUntil: "domcontentloaded", timeout: 30_000 },
  );
  await stale.waitForSelector(".token-hero");
  await stale.$$eval(".tabs button", (buttons) =>
    buttons.find((button) => button.textContent?.trim() === "Holders")?.click(),
  );
  await stale.waitForSelector(".holder-row", { timeout: 10_000 });
  await new Promise((resolve) => setTimeout(resolve, 1_700));
  const staleState = await stale.evaluate(() => ({
    active: document.querySelector(".tabs button.active")?.textContent?.trim(),
    holders: document.querySelectorAll(".holder-row").length,
    transfers: document.querySelectorAll(".generic-row").length,
  }));
  if (
    staleState.active !== "Holders" ||
    !staleState.holders ||
    staleState.transfers
  )
    failures.push(
      `stale response: an older transfer request replaced the holders tab (${JSON.stringify(staleState)})`,
    );
  await stale.close();
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(
  `Responsive interaction test passed (${requiredWidths.length} required widths, ${breakpoints.length} CSS breakpoints at ±1px, landscape, menus, constrained content, empty/error recovery and stale-response protection).`,
);
