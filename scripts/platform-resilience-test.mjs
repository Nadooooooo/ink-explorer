import { chooseLanguage } from './navigation-actions.mjs';
import assert from "node:assert/strict";
import { chromium, firefox, webkit } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const base = process.env.BASE_URL || "http://127.0.0.1:4298";
const output = process.env.PLATFORM_OUTPUT || "reports/platform-resilience";
const results = [];
const address = "0x4200000000000000000000000000000000000006";
await mkdir(output, { recursive: true });
for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
  const browser = await engine.launch(name === "chromium" ? { executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] } : {});
  try {
    if (!process.env.COPY_ONLY) for (const prefix of ["", "/testnet"]) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.addInitScript(() => Object.defineProperty(window, "localStorage", { get() { throw new DOMException("Storage disabled", "SecurityError"); } }));
      await page.goto(`${base}${prefix}/?lang=fr`);
      await page.locator("main h1").waitFor();
      assert.equal(await page.locator("html").getAttribute("lang"), "fr");
      const languages = page.locator(".language-picker select");
      await chooseLanguage(page, "ja");
      await page.waitForFunction(() => document.documentElement.lang === "ja" && new URL(location.href).searchParams.get("lang") === "ja");
      assert((await page.locator(".site-footer a[href]").first().getAttribute("href")).includes("lang=ja"));
      await page.reload();
      await page.locator("main h1").waitFor();
      assert.equal(await languages.inputValue(), "ja", "URL choice survives reload without storage");
      await page.locator('.site-footer a[href*="/blocks"]').click();
      await page.waitForURL(`**${prefix}/blocks?lang=ja`);
      // Force a cold, delayed translation load after the Japanese reload.
      // Changing history must wait for the user's language selection to finish.
      let delayedLocaleLoads=0;
      await page.route('**/assets/module-fr-*.js',async route=>{delayedLocaleLoads++;await page.waitForTimeout(500);await route.continue().catch(()=>{});});
      await chooseLanguage(page, "fr");
      assert(delayedLocaleLoads>0,"The delayed cold locale load must actually occur");
      await page.goBack();
      await page.waitForFunction(() => document.documentElement.lang === "ja");
      assert.equal(await languages.inputValue(), "ja", "Back restores the language from the earlier URL");
      await page.goForward();
      await page.waitForFunction(() => document.documentElement.lang === "fr");
      assert.equal(await languages.inputValue(), "fr", "Forward restores the later URL language");
      assert.deepEqual(errors, [], "Storage denial must not crash rendering or language selection");
      results.push({ engine: name, network: prefix || "mainnet", case: "storage-denied", passed: true });
      await context.close();
    }
    for (const mode of ["native", "fallback", "denied"]) {
      const context = await browser.newContext({ viewport: { width: 320, height: 844 } });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.addInitScript(mode => {
        window.copiedValue = null;
        Object.defineProperty(navigator, "clipboard", { value: { async writeText(value) {
          if (mode !== "native") throw new DOMException("Denied", "NotAllowedError");
          window.copiedValue = value;
        } } });
        document.execCommand = command => {
          if (command === "copy" && mode === "fallback") {
            window.copiedValue = document.activeElement.value;
            return true;
          }
          return false;
        };
      }, mode);
      await page.goto(`${base}/address/${address}?lang=fr`);
      const button = page.locator(".copy-button").first();
      await button.waitFor();
      await page.waitForFunction(() => { const button = document.querySelector(".copy-button"); return button && !button.disabled; });
      await button.focus();
      await page.keyboard.press("Enter");
      if (mode === "denied") {
        const field = page.locator(".copy-fallback input").first();
        await field.waitFor();
        assert.equal(await button.getAttribute("class"), "copy-button", "Failed copies must never announce success");
        assert.equal((await field.inputValue()).toLowerCase(), address);
        assert.equal(await field.getAttribute("readonly"), "");
        assert(await field.evaluate(element => element === document.activeElement && element.selectionStart === 0 && element.selectionEnd === element.value.length));
        assert.match(await page.locator(".copy-fallback [role=status]").first().innerText(), /Copie indisponible/);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Manual copy must fit narrow screens");
      } else {
        await page.waitForFunction(() => Boolean(document.querySelector(".copy-button.copied")));
        assert.equal((await page.evaluate(() => window.copiedValue)).toLowerCase(), address);
        assert(await button.evaluate(element => element === document.activeElement), "Copy preserves keyboard focus");
      }
      assert.deepEqual(errors, []);
      results.push({ engine: name, case: `clipboard-${mode}`, passed: true });
      await context.close();
    }
  } finally { await browser.close(); }
  console.log(`${name}: restricted storage and all three clipboard paths passed`);
}
await writeFile(`${output}/results.json`, JSON.stringify({ at: new Date().toISOString(), base, results, passed: true, physicalDeviceTest: false }, null, 2));
console.log(`Platform resilience: ${results.length} cases passed`);
