import { chromium, firefox, webkit } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.BASE_URL || 'https://inkexplorer.xyz';
const out = process.env.NAMES_REAL_OUTPUT || 'reports/name-gateway/public-real';
const address = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
const results = [];
await mkdir(out, { recursive: true });
for (const [engine, launcher] of [['chromium', chromium], ['firefox', firefox], ['webkit', webkit]]) {
  const browser = await launcher.launch(engine === 'chromium' ? { args: ['--no-sandbox'] } : {});
  try {
    for (const prefix of ['', '/testnet']) for (const width of [390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 950 }, colorScheme: 'dark' });
      const row = { engine, prefix, width, passed: false }, requests = [], responses = [], errors = [];
      page.on('request', req => { if (/\/api\/names\//.test(req.url())) requests.push(req.url()); });
      page.on('response', res => { if (/\/api\/names\//.test(res.url())) responses.push({ path: new URL(res.url()).pathname, status: res.status() }); });
      page.on('pageerror', error => errors.push(error.message));
      const shot = label => page.screenshot({ path: `${out}/${engine}-${prefix ? 'sepolia' : 'mainnet'}-${width}-${label}.png` });
      try {
        await page.goto(base + prefix + '/name-services?lang=fr', { waitUntil: 'domcontentloaded' });
        const input = page.locator('.explorer-search input');
        await input.waitFor();
        await page.locator('.explorer-search select option[value="ens"]').waitFor({ state: 'attached' });
        assert.equal(requests.filter(url => url.includes(':lookup')).length, 0);
        assert.equal(await page.locator('main [role="alert"]').count(), 0);
        await input.fill('  vitalik.eth  ');
        await input.press('Enter');
        const domain = page.locator('.explorer-record-heading a').filter({ hasText: /^vitalik\.eth$/ }).first();
        await domain.waitFor({ timeout: 30000 });
        assert.equal(await input.inputValue(), 'vitalik.eth');
        const domainHref = await domain.getAttribute('href');
        assert(domainHref.startsWith(prefix + '/name-services/domains/vitalik.eth?'));
        assert.equal(new URL(domainHref, base).searchParams.get('protocol_id'), 'ens');
        assert.equal(new URL(domainHref, base).searchParams.get('lang'), 'fr');
        await shot('name-result');
        await input.fill(address);
        const addressResponse = page.waitForResponse(response => new URL(response.url()).pathname === prefix + '/api/names/addresses:lookup');
        await input.press('Enter');
        assert.equal((await addressResponse).status(), 200);
        await page.locator('.explorer-list .explorer-record').first().waitFor({ timeout: 30000 });
        assert(requests.some(url => new URL(url).pathname === prefix + '/api/names/addresses:lookup' && new URL(url).searchParams.get('address') === address));
        await shot('address-results');
        await input.fill('vitalik.eth');
        await input.press('Enter');
        await domain.waitFor({ timeout: 30000 });
        await domain.click();
        await page.waitForURL(url => url.pathname === prefix + '/name-services/domains/vitalik.eth');
        const addressLinks = page.locator('.explorer-detail a[href*="/address/"]');
        await addressLinks.first().waitFor({ timeout: 30000 });
        for (const href of await addressLinks.evaluateAll(links => links.map(link => link.getAttribute('href')))) {
          assert(href.startsWith(prefix + '/address/'));
          assert.equal(new URL(href, base).searchParams.get('lang'), 'fr');
        }
        await page.locator('.explorer-list .explorer-record').first().waitFor({ timeout: 30000 });
        assert.equal(await page.locator('main [role="alert"]').count(), 0);
        assert.equal(await page.locator('h1').count(), 1);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
        assert.deepEqual(errors, []);
        assert(responses.every(response => response.status === 200), JSON.stringify(responses));
        await shot('domain-detail');
        row.passed = true; row.responses = responses;
      } catch (error) {
        row.error = error.stack; row.responses = responses; row.errors = errors;
        await shot('failure').catch(() => {});
      }
      results.push(row); console.log(JSON.stringify(row)); await page.close();
    }
  } finally { await browser.close(); }
}
await writeFile(out + '/results.json', JSON.stringify({ base, complete: true, passed: results.every(row => row.passed), realApi: true, physicalDeviceTest: false, results }, null, 2));
if (results.some(row => !row.passed)) process.exitCode = 1;
