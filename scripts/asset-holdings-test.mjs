import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base = process.env.BASE_URL || 'http://127.0.0.1:4188';
const address = '0x4200000000000000000000000000000000000006';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
try {
  for (const width of [320, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    // Incomplete token metadata previously shadowed the translation function
    // and crashed the whole React tree when the fallback label was rendered.
    await page.route(`**/api/explorer/addresses/${address}/tokens`, route => route.fulfill({ json: { items: [
      { value: '1000000', token: { address_hash: address, decimals: '6', name: null, exchange_rate: null } },
      { value: '2000000', token: { address_hash: address, decimals: '6', name: 'Priced fixture', symbol: 'TEST', exchange_rate: '3', type: 'ERC-20' } },
      { value: '0' },
    ] } }));
    await page.goto(`${base}/address/${address}?lang=en`, { waitUntil: 'networkidle' });
    if (width < 500) await page.locator('.section-picker select').selectOption('tokens');
    else await page.getByRole('button', { name: 'Assets', exact: true }).click();
    await page.locator('.asset-row').last().waitFor();
    assert.equal(await page.locator('.asset-row').count(), 3);
    assert.match(await page.locator('.asset-row').first().textContent(), /Unknown asset.*No price data/);
    assert.match(await page.locator('.asset-row').nth(1).textContent(), /Priced fixture.*\$6/);
    assert.equal(await page.locator('.asset-row').last().isDisabled(), true);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    if (width < 500) await page.locator('.section-picker select').selectOption('contract');
    else await page.getByRole('button', { name: 'Contract source', exact: true }).click();
    await page.locator('.source-file').first().waitFor();
    assert.deepEqual(errors, []);
    console.log(`Asset metadata fallback and tab recovery passed at ${width}px`);
    await page.close();
  }
} finally { await browser.close(); }
