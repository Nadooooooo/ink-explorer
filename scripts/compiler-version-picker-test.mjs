import assert from "node:assert/strict";

const solidity = [
  "v0.8.36+commit.8a079791",
  ...Array.from({ length: 1657 }, (_, i) => `v0.8.36-nightly.${i}+commit.1234abcd`),
  "v0.4.26+commit.4563c3fc",
];
const vyper = ["v0.4.2", "v0.3.10"];
const address = "0x" + "a".repeat(40);
const values = picker => picker.evaluate(select => Array.from(select.options, option => option.value));

// A fully intercepted form exercises a real native picker with a production-sized catalogue.
export async function checkCompilerVersionPicker(browser, base) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, serviceWorkers: "block" });
  let solidityCatalogue = solidity;
  let finishRequest;
  const pending = new Promise(resolve => { finishRequest = resolve; });
  try {
    await context.routeWebSocket(/\/api\/live$/, socket => socket.close());
    await context.route("**/api/**", async route => {
      const req = route.request(), { pathname } = new URL(req.url());
      if (pathname.endsWith("/smart-contracts/verification/config")) {
        return route.fulfill({ json: {
          solidity_compiler_versions: solidityCatalogue, vyper_compiler_versions: vyper,
          verification_options: ["standard-input", "vyper-standard-input", "sourcify"],
        } });
      }
      if (req.method() === "POST") {
        if (!pathname.endsWith("/verification/submit")) return route.abort();
        await pending;
        return route.fulfill({ json: { status: "verified", address } });
      }
      return route.fulfill({ json: { items: [] } });
    });
    const page = await context.newPage();
    await page.goto(base + "/contract-verification?lang=en", { waitUntil: "domcontentloaded" });
    await page.locator("#ink-startup").waitFor({ state: "detached" });
    const form = page.locator(".explorer-form");
    const picker = form.getByRole("combobox", { name: /Compiler version/ });
    const method = form.getByRole("combobox", { name: /Verification method/ });
    await picker.waitFor();
    assert.deepEqual(await values(picker), [solidity[0]]);
    assert.equal(await picker.inputValue(), solidity[0]);
    assert.equal(await picker.evaluate(select => select.required && select.validity.valid), true);

    const source = form.locator("textarea").first();
    await source.focus();
    await page.keyboard.press("Tab");
    assert.equal(await picker.evaluate(select => select === document.activeElement), true);
    assert.deepEqual(await values(picker), solidity);
    await picker.press("End");
    assert.equal(await picker.inputValue(), solidity.at(-1));
    const lastOption = await picker.locator("option").last().elementHandle();
    await form.getByLabel("Contract name (optional)").fill("Fixture");
    assert.equal(await lastOption.evaluate(option => option.isConnected && option.selected), true);

    await method.selectOption("vyper-standard-input");
    assert.deepEqual(await values(picker), [vyper[0]]);
    await picker.evaluate(select => {
      document.addEventListener("pointerdown", event => {
        if (event.target === select) select.dataset.touchOptions = event.pointerType + ":" + select.options.length;
      }, { once: true });
    });
    await picker.tap();
    assert.equal(await picker.getAttribute("data-touch-options"), "touch:" + vyper.length);
    await page.keyboard.press("Escape");
    assert.deepEqual(await values(picker), vyper);
    await picker.selectOption(vyper[1]);
    assert.equal(await picker.inputValue(), vyper[1]);

    await method.selectOption("sourcify");
    assert.equal(await picker.count(), 0);
    await method.selectOption("solidity-hardhat");
    assert.deepEqual(await values(picker), [solidity[0]]);
    const input = { language: "Solidity", sources: { "Fixture.sol": { content: "contract Fixture {}" } }, settings: {} };
    const importBuild = async version => {
      await form.locator("input[type=file]").setInputFiles({
        name: "build-info.json", mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify({ solcLongVersion: version.slice(1), input })),
      });
      await page.waitForFunction(version => document.querySelector(".explorer-form select[required]")?.value === version, version);
    };
    await importBuild(solidity.at(-1));
    assert.deepEqual(await values(picker), [solidity.at(-1)]);
    const unlisted = "v0.8.28";
    await importBuild(unlisted);
    assert.deepEqual(await values(picker), [unlisted]);
    await picker.focus();
    assert.deepEqual(await values(picker), [...solidity, unlisted]);
    await form.getByLabel("Contract address").fill(address);
    await form.locator("button[type=submit]").click();
    assert.equal(await form.locator("input[type=checkbox]").last().evaluate(input => input.validity.valueMissing), true);
    await form.locator("input[type=checkbox]").last().check();
    const submitted = page.waitForRequest(req => req.method() === "POST" && new URL(req.url()).pathname.endsWith("/verification/submit"));
    await form.locator("button[type=submit]").click();
    const body = (await submitted).postDataJSON();
    assert.equal(body.compiler_version, unlisted);
    assert.equal(body.method, "standard-input");
    assert.deepEqual(JSON.parse(body.source), input);
    await page.waitForFunction(() => document.querySelector(".explorer-form select[required]")?.disabled);
    finishRequest();
    await form.locator("select[required]:enabled").waitFor();
    assert.equal(await picker.inputValue(), unlisted);

    solidityCatalogue = [];
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("#ink-startup").waitFor({ state: "detached" });
    await picker.waitFor();
    assert.deepEqual(await values(picker), []);
    assert.equal(await picker.evaluate(select => select.required && select.validity.valueMissing), true);
  } finally {
    finishRequest();
    await context.close();
  }
}
