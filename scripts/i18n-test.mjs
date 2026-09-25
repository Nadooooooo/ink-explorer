import puppeteer from "puppeteer-core";

const base = process.env.BASE_URL || "http://127.0.0.1:4188";
const locales = ["en", "zh", "hi", "es", "fr", "ar", "bn", "pt", "ru", "ja"];
const browser = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 320, height: 700, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const failures = [];

for (const locale of locales) {
  await page.goto(`${base}/?lang=${locale}`, { waitUntil: "networkidle0", timeout: 30_000 });
  const state = await page.evaluate(() => ({
    lang: document.documentElement.lang,
    dir: document.documentElement.dir,
    selected: document.querySelector(".language-picker select")?.value,
    choices: document.querySelectorAll(".language-picker option").length,
    overflow: document.documentElement.scrollWidth > innerWidth + 1,
  }));
  if (state.lang !== locale || state.selected !== locale) failures.push(`${locale}: URL locale was not applied`);
  if (state.choices !== locales.length) failures.push(`${locale}: language picker contains ${state.choices} choices`);
  if (state.dir !== (locale === "ar" ? "rtl" : "ltr")) failures.push(`${locale}: incorrect text direction ${state.dir}`);
  if (state.overflow) failures.push(`${locale}: horizontal overflow at 320px`);
  // A real picker change, unlike a shareable URL override, is persisted.
  await page.select(".language-picker select", locale);
  if (await page.evaluate(() => localStorage.getItem("ink-observer-language")) !== locale) failures.push(`${locale}: picker choice was not persisted`);
}

// Locale query state must survive client-side navigation.
await page.goto(`${base}/?lang=ja`, { waitUntil: "networkidle0", timeout: 30_000 });
await page.click(".menu");
const blocks = await page.$$("header nav button");
await blocks[0]?.click();
await page.waitForFunction(() => location.pathname === "/blocks");
if (!page.url().includes("lang=ja") || await page.$eval("html", node => node.lang) !== "ja") failures.push("ja: client navigation dropped locale state");

await browser.close();
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("Internationalisation test passed (10 locales, 320px layout, RTL and navigation persistence).");
