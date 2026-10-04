import assert from 'node:assert/strict';
import { chromium, firefox, webkit } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.BASE_URL || 'http://127.0.0.1:4188';
const output = process.env.READABILITY_DIR || 'reports/address-readability';
const address = `0x${'1'.repeat(40)}`, implementation = `0x${'2'.repeat(40)}`, creator = `0x${'3'.repeat(40)}`;
const hash = `0x${'a'.repeat(64)}`, creation = `0x${'b'.repeat(64)}`;
const results = [];
await mkdir(output, { recursive: true });

// Synthetic index fixtures exercise information hierarchy and absence of data;
// live chain values are checked separately by the reconciliation campaign.
for (const [engine, browserType] of [['chromium', chromium], ['firefox', firefox], ['webkit', webkit]]) {
  const browser = await browserType.launch(engine === 'chromium' ? { executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] } : {});
  try {
    for (const prefix of ['', '/testnet']) {
      const views = [[320, 'ar'], [390, 'fr'], [768, 'en'], [1440, 'en']];
      if (engine === 'chromium') for (const locale of ['en', 'zh', 'hi', 'es', 'bn', 'pt', 'ru', 'ja']) views.push([320, locale]);
      for (const [width, locale] of views) {
        const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 500 });
        await context.routeWebSocket(/\/api\/live$/, socket => socket.close());
        await context.route('**/api/live/snapshot', route => route.fulfill({ status: 503, json: { error: 'Live data disabled for deterministic fixtures' } }));
        const page = await context.newPage(), errors = [];
        page.on('pageerror', error => errors.push(error.message));
        let scenario = 'account';
        await page.route('**/api/explorer/addresses/**', route => {
          const path = new URL(route.request().url()).pathname;
          if (path.endsWith('/counters')) return route.fulfill({ json: { transactions_count: scenario === 'empty' ? 0 : 1301, token_transfers_count: 1054, gas_usage_count: 314665088 } });
          if (path.endsWith('/token-balances')) return route.fulfill({ json: [] });
          if (path.endsWith('/transactions')) return route.fulfill({ json: { items: scenario === 'empty' ? [] : [{ hash, status: 'ok', timestamp: '2026-10-01T12:00:00Z', block_number: 57000000, from: { hash: address }, to: { hash: implementation, name: 'Destination' }, method: 'deposit', transaction_types: ['contract_call'], value: '1000000000000000', fee: { value: '10000000' } }] } });
          if (path.endsWith('/tokens')) return route.fulfill({ json: { items: [] } });
          return route.fulfill({ json: { hash: path.split('/').at(-1), coin_balance: '4445987397359790', exchange_rate: '2674.25', is_contract: scenario === 'proxy', ens_domain_name: scenario === 'account' ? 'sample.ink' : null, block_number_balance_updated_at: 57504457, balance_check: { status: 'matched', source: 'local' }, ...(scenario === 'proxy' ? { name: 'Sample proxy', is_verified: true, proxy_type: 'EIP-1967', token: { type: 'ERC-20', symbol: 'SAMPLE' }, implementations: [{ address_hash: implementation, name: 'Sample implementation' }], creator_address_hash: creator, creation_transaction_hash: creation } : {}) } });
        });
        await page.route('**/api/explorer/transactions/**', route => route.fulfill({ json: { hash: creation, status: 'ok', timestamp: '2026-10-01T12:00:00Z', from: { hash: creator }, to: { hash: address }, block_number: 57000000, value: '0' } }));
        await page.route('**/api/contract-info/pools/**/check', route => route.fulfill({ json: null }));
        const choose = async value => {
          if (width <= 760) await page.locator('.section-picker select').selectOption(value);
          else await page.locator('.tabs button').nth(value === 'overview' ? 0 : value === 'transactions' ? 1 : 2).click();
        };
        for (scenario of ['account', 'empty', 'proxy']) {
          await page.goto(`${base}${prefix}/address/${address}?lang=${locale}`, { waitUntil: 'domcontentloaded' });
          await page.locator('.address-summary').waitFor();
          await page.locator('.address-activity .loading').waitFor({ state: 'detached' });
          await page.evaluate(() => document.fonts.ready);
          assert.equal(await page.locator('.section-picker select').inputValue(), 'transactions', 'Opening an address must show activity');
          if (scenario === 'account') assert.equal(await page.locator('h1').innerText(), 'sample.ink');
          const identity = page.locator('.detail-header .copyable > .mono');
          assert.equal(await identity.innerText(), address, 'Full address must remain visible and copyable');
          await page.locator('.detail-header .copy-button').click();
          await page.locator('.detail-header .copy-button.copied').waitFor();
          await page.evaluate(() => scrollTo(0, 0));
          const metrics = await page.evaluate(() => {
            const visible = element => element.getBoundingClientRect().height > 0;
            const first = document.querySelector('.address-activity .tx-row,.address-activity .empty');
            return {
              overflow: document.documentElement.scrollWidth - innerWidth,
              activityTop: document.querySelector('.address-activity').getBoundingClientRect().top,
              firstRow: first?.getBoundingClientRect().toJSON(),
              clippedValues: [...document.querySelectorAll('.address-summary strong,.detail-header .mono')].filter(element => element.scrollWidth > element.clientWidth + 1).map(element => element.textContent),
              tinyText: [...document.querySelectorAll('.address-page *')].filter(visible).filter(element => [...element.childNodes].some(node => node.nodeType === 3 && node.textContent.trim()) && parseFloat(getComputedStyle(element).fontSize) < 11.99).map(element => element.textContent.slice(0, 60)),
            };
          });
          assert(metrics.overflow <= 1, 'No horizontal scrolling for the page');
          assert.deepEqual(metrics.clippedValues, [], 'Essential identity and values cannot be clipped');
          assert.deepEqual(metrics.tinyText, [], 'Supporting information must remain readable');
          assert(metrics.activityTop <= (width <= 760 ? 700 : 550), `Activity starts too far down: ${metrics.activityTop}`);
          if (scenario !== 'empty') {
            assert.equal(await page.locator('.address-activity .tx-row').count(), 1);
            assert.equal((await page.locator('.address-activity .method').innerText()).toLowerCase(), 'deposit', 'Decoded method must take precedence over generic transaction type');
          }
          else assert.equal(await page.locator('.address-activity .tx-row').count(), 0);
          await choose('overview');
          const facts = page.locator('.address-facts');
          await facts.waitFor();
          if (scenario === 'proxy') {
            assert.match(await facts.innerText(), /EIP-1967/);
            assert.match(await facts.innerText(), /Sample implementation/);
            assert.equal(await facts.locator('.copyable .text-link').count(), 3, 'Deployment and implementation links remain available');
            for (const [index, route] of [`/address/${implementation}`, `/address/${creator}`, `/tx/${creation}`].entries()) {
              const targetPath = `${prefix}/api/explorer/${route.startsWith('/tx/') ? 'transactions' : 'addresses'}/${route.split('/').at(-1)}`;
              const destination = page.waitForResponse(response => new URL(response.url()).pathname === targetPath);
              await facts.locator('.copyable .text-link').nth(index).click();
              await page.waitForURL(url => url.pathname === prefix + route);
              await destination;
              await page.waitForFunction(() => !document.querySelector('main > .loading'));
              await page.locator('.detail-header').waitFor();
              const returned = page.waitForResponse(response => new URL(response.url()).pathname === `${prefix}/api/explorer/addresses/${address}`);
              await page.goBack();
              await returned;
              await page.locator('.address-summary').waitFor();
              await choose('overview');
              await facts.waitFor();
            }
          } else {
            assert.equal(await facts.locator('.copyable .text-link').count(), 0, 'Accounts have no fake deployment or proxy links');
            assert.doesNotMatch(await facts.innerText(), /Genesis|unavailable|Not a proxy|Contract profile|EIP-1967/);
          }
          await choose('tokens');
          await page.locator('.address-activity .loading').waitFor({ state: 'detached' });
          assert.equal(await page.locator('.address-activity .tx-row').count(), 0, 'Changing sections clears earlier activity');
          await choose('transactions');
          await page.locator('.address-activity .loading').waitFor({ state: 'detached' });
          assert.deepEqual(errors, [], `${engine} ${prefix} ${width}px ${locale} ${scenario}`);
          results.push({ engine, prefix, width, locale, scenario, ...metrics });
          if (engine === 'chromium' && locale !== 'ar' && [390, 1440].includes(width) && scenario === 'account') await page.screenshot({ path: `${output}/account-${prefix ? 'sepolia' : 'mainnet'}-${width}.png` });
        }
        console.log(`${engine} ${prefix || '/'} ${width}px ${locale}: account, empty and proxy checked`);
        await context.close();
      }
    }
  } finally { await browser.close(); }
}
await writeFile(`${output}/results.json`, JSON.stringify({ recordedAt: new Date().toISOString(), results }, null, 2));
console.log(`Address readability passed (${results.length} account/empty/proxy cases, both networks, 3 browser engines and all 10 locales).`);
