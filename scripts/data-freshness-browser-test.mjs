import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, firefox, webkit } from 'playwright-core';
import axe from 'axe-core';

const base = process.env.BASE_URL || 'http://127.0.0.1:4188';
const output = 'reports/data-freshness';
const fetchedAt = '2026-10-08T12:30:00.000Z';
const hash = `0x${'1'.repeat(64)}`;
const block = { height: 100, hash, parent_hash: `0x${'2'.repeat(64)}`, timestamp: fetchedAt, transactions_count: 0, gas_used: '21000', gas_limit: '1000000', gas_used_percentage: 2.1, transaction_fees: '24003533088', size: 1024 };
const results = [];
async function verifyPoolRefresh(browser, prefix, engine) {
  const context = await browser.newContext({viewport:{width:390,height:844}});
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.routeWebSocket(/\/api\/live$/, socket => socket.close());
  let failed = false, stale = false, version = 1, hits = 0;
  await context.route(/\/api\/contract-info\/pools(?:\?|$)/, route => {
    hits++;
    return route.fulfill(failed ? {status:503,json:{error:'Controlled market outage'}} : {
      headers:{'x-ink-data-status':stale?'stale':'fresh','x-ink-data-fetched-at':stale?fetchedAt:new Date().toISOString()},
      json:{items:[{pool_id:'0x'+'1'.repeat(40),base_token_symbol:'AAA',quote_token_symbol:'BBB',liquidity:String(12345*version),volume_usd_24h:'4321',fee:'0.05',dex:{name:'Fixture DEX'}}],next_page_params:null}
    });
  });
  try {
    await page.goto(base+prefix+'/pools?lang=fr');await page.locator('.pool-row').waitFor();
    const initialUpdate = await page.locator('.pool-live-refresh').getAttribute('title');
    failed = true;await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
    await page.locator('.pool-refresh-error [role="alert"]').waitFor();
    assert.equal(await page.locator('.pool-row').count(),1,'Failed refresh keeps useful market rows');
    assert.match(await page.locator('.pool-live-refresh').innerText(),/Actualisation indisponible/i);
    assert.match(await page.locator('.pool-refresh-error').innerText(),/valeurs précédentes/);
    assert.equal(await page.locator('.pool-live-refresh').getAttribute('title'),initialUpdate,'Outage must not renew the update time');
    assert(await page.locator('.pool-last-update time').isVisible(),'Last update is visible without hover');
    assert(Number.isFinite(Date.parse(await page.locator('.pool-last-update time').getAttribute('datetime'))));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
    failed = false;version = 2;await page.locator('.pool-refresh-error button').click();
    await page.locator('.pool-row[data-liquidity="24690"]').waitFor();
    assert.equal(await page.locator('.pool-refresh-error').count(),0);
    assert.match(await page.locator('.pool-live-refresh').innerText(),/En direct/i);
    stale = true;await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
    await page.locator('.data-freshness').waitFor();
    assert.match(await page.locator('.pool-live-refresh').innerText(),/Données en cache/i,'Saved snapshots cannot retain a live badge');
    failed = true;await page.reload();await page.getByRole('alert').waitFor();
    assert.match(await page.locator('.pool-live-refresh').innerText(),/Actualisation indisponible/i,'Initial failure cannot claim live refresh');
    stale = false;failed = false;await page.getByRole('button',{name:'Réessayer',exact:true}).click();await page.locator('.pool-row').waitFor();
    assert.equal(await page.getByRole('alert').count(),0);assert.match(await page.locator('.pool-live-refresh').innerText(),/En direct/i);
    assert.deepEqual(errors,[]);
    results.push({name:`${engine}-${prefix?'sepolia':'mainnet'}-pool-refresh`,hits,passed:true,checks:'retained rows, visible last successful date, non-live outage/cache badges, retry recovery, initial error recovery, mobile overflow'});
    console.log(`PASS ${engine} ${prefix||'mainnet'} pool refresh`);
  } finally {await context.close();}
}
await mkdir(output, { recursive: true });
for (const engine of [chromium, firefox, webkit]) {
  const browser = await engine.launch({
    ...(engine === chromium ? { executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] } : {}),
    env: { ...process.env, ...(process.env.INK_BROWSER_LIBS ? { LD_LIBRARY_PATH: process.env.INK_BROWSER_LIBS } : {}) },
  });
  try {
    for (const prefix of ['', '/testnet']) {
      for (const [width, locale, title] of [[320, 'ar', 'بيانات مخزنة مؤقتاً'], [390, 'fr', 'Données en cache'], [1440, 'en', 'Cached data']]) {
        const context = await browser.newContext({ viewport: { width, height: 900 }, bypassCSP: true });
        await context.routeWebSocket(/\/api\/live$/, socket => socket.close());
        await context.route('**/api/live/snapshot', route => route.fulfill({ status: 503, json: { error: 'Live fixtures disabled' } }));
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        let stale = true;
        await context.route('**/api/explorer/**', route => {
          const path = new URL(route.request().url()).pathname.split('/api/explorer/')[1];
          return route.fulfill({
            headers: { 'x-ink-data-status': stale && path === 'blocks' ? 'stale' : 'fresh', 'x-ink-data-fetched-at': fetchedAt },
            json: path === 'blocks' ? { items: [block] } : path === 'blocks/100' ? block : { items: [] },
          });
        });
        await page.goto(`${base}${prefix}/blocks?lang=${locale}`);
        const notice = page.locator('.data-freshness');
        await notice.waitFor();
        assert.equal(await notice.locator('strong').textContent(), title);
        if (locale !== 'en') assert.doesNotMatch(await page.locator('header').innerText(), /RECONNECTING/);
        assert.equal(await notice.getAttribute('role'), 'status');
        assert.equal(await notice.locator('time').getAttribute('datetime'), fetchedAt);
        await page.locator('.block-row').waitFor();
        assert.match(await page.locator('.block-fee strong').textContent(), /</);
        assert.equal(await page.locator('.block-fee strong').getAttribute('title'), locale === 'fr' ? '0,000000024003533088 ETH' : '0.000000024003533088 ETH');
        const geometry = await page.evaluate(() => {
          const banner = document.querySelector('.data-freshness').getBoundingClientRect();
          const button = document.querySelector('.data-freshness button').getBoundingClientRect();
          return { overflow: document.documentElement.scrollWidth > innerWidth + 1, contained: button.left >= banner.left && button.right <= banner.right && button.bottom <= banner.bottom, height: button.height };
        });
        assert.equal(geometry.overflow, false);
        assert.equal(geometry.contained, true);
        assert(geometry.height >= 44);
        await page.addScriptTag({ content: axe.source });
        const accessibility = await page.evaluate(async () => (await axe.run('.data-freshness')).violations.filter(violation => ['serious', 'critical'].includes(violation.impact)).map(violation => violation.id));
        assert.deepEqual(accessibility, []);
        const name = `${engine.name()}-${prefix ? 'sepolia' : 'mainnet'}-${width}`;
        await page.screenshot({ path: `${output}/${name}.png` });
        stale = false;
        await notice.locator('button').click();
        await page.waitForLoadState('domcontentloaded');
        await page.locator('.block-row').waitFor();
        assert.equal(await notice.count(), 0, 'A successful retry clears the fallback warning');
        stale = true;
        await page.reload();
        await notice.waitFor();
        await page.locator('.block-height a[href]').click();
        await page.locator('.detail-header').waitFor();
        assert.equal(await notice.count(), 0, 'Client navigation does not carry a warning to an unrelated entity');
        assert.deepEqual(errors, []);
        results.push({ name, geometry, accessibility, recovered: true, navigation: true });
        await context.close();
        console.log(`PASS ${name}`);
      }
      await verifyPoolRefresh(browser, prefix, engine.name());
    }
  } finally { await browser.close(); }
}
await writeFile(`${output}/results.json`, JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2));
