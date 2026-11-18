import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const base = process.env.BASE_URL || 'http://127.0.0.1:4188';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
try {
  for (const width of [390, 1440]) {
    for (const route of ['/', '/blocks', '/tokens', '/analytics']) {
      const page = await browser.newPage();
      await page.setViewport({ width, height: 900 });
      const held = [];
      const heldPath = request => /^\/api\/(overview|stats\/lines|explorer\/(blocks|tokens|stats))$/.test(new URL(request.url()).pathname);
      const expectedPath = {'/':'/api/overview','/blocks':'/api/explorer/blocks','/tokens':'/api/explorer/tokens','/analytics':'/api/stats/lines'}[route];
      await page.setRequestInterception(true);
      page.on('request', request => {
        if (heldPath(request)) held.push(request);
        else request.continue();
      });
      const pending = page.waitForRequest(request => new URL(request.url()).pathname === expectedPath, {timeout:15000});
      await page.goto(base + route, { waitUntil: 'domcontentloaded' });
      await pending;
      await page.waitForSelector('main h1');
      assert(held.length > 0, 'The real data request must still be pending');
      assert(await page.$eval('main h1', el => el.textContent.trim().length > 0), 'Title must be available before data');
      assert(await page.$eval('.site-footer', el => el.getBoundingClientRect().top >= innerHeight), 'Loading should reserve space before the footer');
      if (route === '/') {
        if (!await page.$eval('header .global-search input', input => input.getClientRects().length > 0)) await page.click('.mobile-search-trigger');
        await page.type('header .global-search input', '12345');
        await page.click('header .search-submit');
        await page.waitForFunction(() => location.pathname === '/block/12345');
      }
      for (const request of held) if (!request.isInterceptResolutionHandled()) await request.continue();
      await page.close();
    }
  }
  console.log('Loading regression passed: home search works before data; list and analytics loading expose titles and keep footer below viewport (mobile/desktop).');
} finally { await browser.close(); }
