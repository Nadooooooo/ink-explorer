import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.BASE_URL;
if (!base) throw new Error('BASE_URL must identify the site to validate');
const out = process.env.TOKEN_REAL_OUTPUT || 'reports/token-ergonomics/public-real';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ args: ['--no-sandbox'] }), results = [];
try {
  for (const prefix of ['', '/testnet']) for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 }, colorScheme: width === 390 ? 'light' : 'dark' });
    page.setDefaultTimeout(30000);
    const row = { prefix, width, passed: false }, errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const choose = async section => {
      const select = page.locator('.section-picker select');
      if (await select.isVisible()) await select.selectOption(section);
      else await page.locator('.tabs button').filter({ hasText: await select.locator(`option[value="${section}"]`).textContent() }).click();
    };
    try {
      await page.goto(base + prefix + '/tokens?type=ERC-20&sort=holders_count&lang=fr', { waitUntil: 'domcontentloaded' });
      await page.locator('.token-row').first().waitFor();
      const first = await page.locator('.token-row').first().getAttribute('href');
      row.tokenPath = first;
      assert.equal(await page.locator('.token-directory-filters select').first().inputValue(), 'ERC-20');
      const request = page.waitForResponse(r => new URL(r.url()).pathname === prefix + '/api/explorer/tokens');
      await page.locator('.token-list-controls .cursor-pagination button').last().click();
      const second = await (await request).json();
      assert(second.items?.length > 0);
      await page.locator(`.token-row[href*="/token/${second.items[0].address_hash}?"]`).waitFor();
      assert.notEqual(await page.locator('.token-row').first().getAttribute('href'), first);
      await page.locator('.token-list-controls .cursor-pagination button').first().click();
      await page.locator(`.token-row[href="${first}"]`).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      await page.screenshot({ path: `${out}/${prefix ? 'sepolia' : 'mainnet'}-${width}-directory.png` });
      const profile = page.waitForResponse(r => /\/api\/explorer\/tokens\/0x[a-f\d]{40}$/i.test(new URL(r.url()).pathname));
      await page.locator('.token-row').first().click();
      const token = await (await profile).json();
      await page.locator('.token-summary').waitFor();
      assert.equal(await page.locator('.token-id h1').textContent(), token.name);
      assert.equal(await page.locator('.token-contract-id a').textContent(), token.address_hash);
      row.priced = token.exchange_rate !== null && token.exchange_rate !== undefined;
      if (!row.priced) assert.equal(await page.locator('.token-price strong').textContent(), 'N/A');
      await page.screenshot({ path: `${out}/${prefix ? 'sepolia' : 'mainnet'}-${width}-overview.png` });
      for (const section of ['holders', 'transfers']) {
        const response = page.waitForResponse(r => new URL(r.url()).pathname.endsWith('/tokens/' + token.address_hash + '/' + section));
        await choose(section);
        const data = await (await response).json(); assert(Array.isArray(data.items));
        await page.locator('.token-activity .loading').waitFor({ state: 'detached' });
        const selector = section === 'holders' ? '.holder-row' : '.generic-row';
        if (data.items.length) await page.locator(selector).first().waitFor();
        assert.equal(await page.locator(selector).count(), data.items.length);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
        row[section] = data.items.length;
        await page.screenshot({ path: `${out}/${prefix ? 'sepolia' : 'mainnet'}-${width}-${section}.png` });
      }
      assert.deepEqual(errors, []); row.passed = true;
    } catch (error) { row.error = error.stack; await page.screenshot({ path: `${out}/failure-${prefix ? 'sepolia' : 'mainnet'}-${width}.png` }).catch(() => {}); }
    finally { await page.close(); }
    results.push(row); console.log(JSON.stringify(row));
    await writeFile(out + '/results.json', JSON.stringify({ base, complete: false, results }, null, 2));
  }
} finally { await browser.close(); }
await writeFile(out + '/results.json', JSON.stringify({ base, complete: true, passed: results.every(row => row.passed), physicalDeviceTest: false, results }, null, 2));
if (results.some(row => !row.passed)) process.exitCode = 1;
