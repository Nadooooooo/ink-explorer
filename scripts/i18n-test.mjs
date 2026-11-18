import { walletCopy } from "../src/wallet-copy.ts";
import { explorerCopy } from "../src/explorer-copy.ts";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import puppeteer from "puppeteer-core";

const base = process.env.BASE_URL || "http://127.0.0.1:4188";
const locales = ["en", "zh", "hi", "es", "fr", "ar", "bn", "pt", "ru", "ja"];
const fontOutput = process.env.I18N_OUTPUT || "reports/i18n-fonts";
const fontResults = [];
let coldEnglish;
await mkdir(fontOutput, { recursive: true });
const browser = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
const fontSession = await page.createCDPSession();
await fontSession.send("DOM.enable");
await fontSession.send("CSS.enable");
await page.setViewport({ width: 320, height: 700, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const failures = [];
async function saveFontEvidence() {
  await writeFile(`${fontOutput}/fonts.json`, JSON.stringify({ recordedAt: new Date().toISOString(), base, browser: "Chromium", viewport: { width: 320, height: 700 }, method: "Cold English resource timing and CSS.getPlatformFontsForNode on real Hindi/Bengali footer text after document.fonts.ready", limitations: "CDP proves the custom font actually drew glyphs and no system fallback drew the reviewed paragraphs; it does not expose individual glyph IDs or prove all text on every physical device.", coldEnglish, results: fontResults, complete: Boolean(coldEnglish) && fontResults.length === 2, passed: coldEnglish?.passed === true && fontResults.length === 2 && fontResults.every(result => result.passed) }, null, 2));
}
async function verifyColdEnglishFonts() {
  const row = { locale: "en", url: page.url(), browserCacheDisabled: true, budgetBytes: 20_000, passed: false };
  try {
    row.labels = await page.$$eval('.language-picker option[value="hi"],.language-picker option[value="bn"]', options => options.map(option => ({ value: option.value, text: option.textContent.trim(), fontFamily: getComputedStyle(option).fontFamily })));
    assert.deepEqual(row.labels.map(({ value, text }) => ({ value, text })), [{ value: "hi", text: "हिन्दी" }, { value: "bn", text: "বাংলা" }], "Native language names remain unchanged");
    assert(row.labels[0].fontFamily.includes("Ink Language Names Devanagari"), "Hindi option uses the dedicated language-name font");
    assert(row.labels[1].fontFamily.includes("Ink Language Names Bengali"), "Bengali option uses the dedicated language-name font");
    await page.waitForFunction(() => document.fonts.status === "loaded", { timeout: 20_000 });
    row.fontResources = await page.evaluate(() => performance.getEntriesByType("resource").filter(entry => /\.woff2(?:\?|$)/.test(entry.name)).map(entry => ({ url: entry.name, decodedBodySize: entry.decodedBodySize, transferSize: entry.transferSize })));
    row.fullIndicFonts = row.fontResources.filter(entry => /\/noto-sans-[^/?]*-wght-normal(?:-[^/?]+)?\.woff2(?:\?|$)/.test(entry.url));
    assert.deepEqual(row.fullIndicFonts, [], "A cold English homepage must not download the full Hindi/Bengali body fonts");
    row.labelFonts = row.fontResources.filter(entry => /\/ink-language-names-(?:devanagari|bengali)(?:-[^/?]+)?\.woff2(?:\?|$)/.test(entry.url));
    row.pickerVisible = await page.$eval(".language-picker select", node => node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0);
    assert(row.labelFonts.length === 2 || !row.pickerVisible && row.labelFonts.length === 0, "Hidden language choices may defer both fonts; visible choices load both small label fonts");
    if (row.labelFonts.length) assert(row.labelFonts.some(entry => /ink-language-names-devanagari/.test(entry.url)) && row.labelFonts.some(entry => /ink-language-names-bengali/.test(entry.url)), "One font is present for each rendered native language name");
    assert(row.labelFonts.every(entry => Number.isFinite(entry.decodedBodySize) && entry.decodedBodySize > 0), "Resource timing supplies actual decoded bytes, not a cache-dependent transfer-size zero");
    row.decodedLabelBytes = row.labelFonts.reduce((sum, entry) => sum + entry.decodedBodySize, 0);
    assert(row.decodedLabelBytes <= row.budgetBytes, `Language-name fonts exceed the combined 20 kB budget: ${row.decodedLabelBytes} bytes`);
    row.passed = true;
  } catch (error) {
    row.error = error.message;
    failures.push(`en: cold font budget: ${error.message}`);
  }
  coldEnglish = row;
  await page.screenshot({ path: `${fontOutput}/en-cold-home-fonts.png` });
  await saveFontEvidence();
}
async function verifyScriptFont(locale) {
  const expected = locale === "hi" ? "Noto Sans Devanagari" : "Noto Sans Bengali";
  const row = { locale, url: page.url(), selector: ".site-footer .footer-brand > p", expected, passed: false };
  try {
    // Inspect the actual translated footer paragraph. Computed font-family
    // or a successful font download alone cannot establish which font drew it.
    await page.waitForFunction(() => document.fonts.status === "loaded", { timeout: 20_000 });
    row.content = await page.$eval(row.selector, node => ({ text: node.textContent, fontFamily: getComputedStyle(node).fontFamily }));
    const script = locale === "hi" ? /[\u0900-\u097f]/g : /[\u0980-\u09ff]/g;
    row.scriptCharacters = row.content.text.match(script)?.length || 0;
    assert(row.scriptCharacters > 10, "Reviewed footer text must contain the requested writing system");
    const { root } = await fontSession.send("DOM.getDocument");
    const { nodeId } = await fontSession.send("DOM.querySelector", { nodeId: root.nodeId, selector: row.selector });
    assert(nodeId > 0, "Translated footer paragraph exists in the rendered document");
    row.fonts = (await fontSession.send("CSS.getPlatformFontsForNode", { nodeId })).fonts;
    const normalize = value => value.replace(/\s/g, "").toLowerCase();
    row.customScriptGlyphs = row.fonts.filter(font => font.isCustomFont && normalize(font.familyName).includes(normalize(expected))).reduce((count, font) => count + font.glyphCount, 0);
    row.systemFallbacks = row.fonts.filter(font => !font.isCustomFont && font.glyphCount > 0);
    row.downloadedFonts = await page.evaluate(() => performance.getEntriesByType("resource").filter(entry => /noto-sans-(?:devanagari|bengali).*\.woff2/.test(entry.name)).map(entry => ({ url: entry.name, decodedBodySize: entry.decodedBodySize, transferSize: entry.transferSize })));
    assert(row.customScriptGlyphs > 0, `The bundled ${expected} must actually draw glyphs, not only appear in the CSS fallback list`);
    assert.deepEqual(row.systemFallbacks, [], "The translated paragraph must not fall back to Arial or an unavailable system script font");
    assert.doesNotMatch(row.content.text, /\uFFFD|\u25A1/, "Translated source contains no replacement or square placeholder characters");
    row.passed = true;
  } catch (error) {
    row.error = error.message;
    failures.push(`${locale}: font rendering: ${error.message}`);
  }
  await page.screenshot({ path: `${fontOutput}/${locale}-home-fonts.png` });
  fontResults.push(row);
  await saveFontEvidence();
}
async function loadHome(locale) {
  // Wait for the content under review, rather than an idle network: the live
  // explorer continues polling while these locale checks run.
  await page.goto(`${base}/?lang=${locale}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector(".metric-grid .metric");
  try {
    await page.waitForFunction(() => document.fonts.status === "loaded", { timeout: 20_000 });
  } catch (error) {
    const fonts = await page.evaluate(() => ({ status: document.fonts.status, pending: [...document.fonts].filter(font => font.status === "loading").map(font => font.family) }));
    throw new Error(`Font loading did not settle for ${locale}: ${JSON.stringify(fonts)}`, { cause: error });
  }
}

for (const locale of locales) {
  if (locale === "en") await page.setCacheEnabled(false);
  await loadHome(locale);
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
  if (locale === "en") {
    await verifyColdEnglishFonts();
    await page.setCacheEnabled(true);
  }
  if (locale === "hi" || locale === "bn") await verifyScriptFont(locale);
  await page.goto(`${base}/stats/newBlocks?lang=${locale}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".stat-chart h2");
  const chartTitle = await page.$eval(".stat-chart h2", node => node.textContent.trim());
  if (chartTitle !== walletCopy[locale]["New blocks"]) failures.push(`${locale}: New blocks title is not translated: ${chartTitle}`);
  // A real picker change, unlike a shareable URL override, is persisted.
  const utilityVisible = await page.$eval('.utility-bar .language-picker select', node => node.getClientRects().length > 0);
  if (!utilityVisible) await page.click('.drawer-trigger');
  await page.select(utilityVisible ? '.utility-bar .language-picker select' : '.drawer-preferences .language-picker select', locale);
  if (!utilityVisible) await page.keyboard.press('Escape');
  if (await page.evaluate(() => localStorage.getItem("ink-observer-language")) !== locale) failures.push(`${locale}: picker choice was not persisted`);
  for (const [prefix, networkName] of [["", "Ink Mainnet"], ["/testnet", "Ink Sepolia"]]) {
    await page.goto(`${base}${prefix}/tokens?lang=${locale}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("main h1");
    const description = await page.$eval('meta[name="description"]', node => node.content);
    if (!description.includes(networkName) || description.includes("{network}") || description.includes(prefix ? "Ink Mainnet" : "Ink Sepolia")) failures.push(`${locale}${prefix}: wrong token-directory network: ${description}`);
  }
  const directory = explorerCopy[locale];
  const keys = ["Ink ecosystem", "Find an application", "Official Ink directory"];
  if (locale !== "en" && keys.some(key => !directory[key] || directory[key] === key)) {
    failures.push(`${locale}: missing translation for an ecosystem control`);
  }
  await page.goto(`${base}/apps?lang=${locale}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".ecosystem-controls input");
  const controls = await page.evaluate(() => [
    document.querySelector(".explorer-page h1").textContent,
    document.querySelector(".ecosystem-controls input").labels[0].textContent,
    document.querySelector(".ecosystem-source a").textContent,
  ].map(text => text.trim()));
  assert.deepEqual(controls, keys.map(key => directory[key] || key), `${locale}: ecosystem controls`);
  await page.goto(`${base}/apps/ecosystem-concero?lang=${locale}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".ecosystem-detail");
  const template = "Explore {app} in the Ink ecosystem and find its website, links and supported networks.";
  const expectedDescription = (directory[template] || template).replace("{app}", "Concero");
  if (locale !== "en" && !directory[template]) failures.push(`${locale}: missing ecosystem detail description`);
  assert.equal(await page.title(), `Concero · ${directory["Ink ecosystem"] || "Ink ecosystem"} — Ink Explorer`);
  assert.equal(await page.$eval('meta[name="description"]', node => node.content), expectedDescription);
}

// Locale query state must survive client-side navigation.
await loadHome("ja");
await page.click(".drawer-trigger");
await page.waitForSelector(".mobile-drawer .drawer-category");
await page.click(".mobile-drawer .drawer-category");
await page.waitForSelector('.mobile-drawer a[href="/blocks?lang=ja"]');
await page.click('.mobile-drawer a[href="/blocks?lang=ja"]');
await page.waitForFunction(() => location.pathname === "/blocks");
if (!page.url().includes("lang=ja") || await page.$eval("html", node => node.lang) !== "ja") failures.push("ja: client navigation dropped locale state");

await browser.close();
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`Internationalisation test passed (10 locales, 320px layout, RTL, navigation persistence, ecosystem controls and metadata, token descriptions on both networks, cold English font budget and actual custom Hindi/Bengali glyph rendering). Font evidence: ${fontOutput}/fonts.json`);
