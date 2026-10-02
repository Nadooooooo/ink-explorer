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
      await page.setRequestInterception(true);
      page.on('request', request => {
        if (/\/api\/(overview|explorer\/(blocks|tokens|stats))$/.test(request.url())) held.push(request);
        else request.continue();
      });
      await page.goto(base + route, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('main .loading');
      assert(held.length > 0, 'The real data request must still be pending');
      assert(await page.$eval('main h1', el => el.textContent.trim().length > 0), 'Title must be available before data');
      assert(await page.$eval('.site-footer', el => el.getBoundingClientRect().top >= innerHeight), 'Loading should reserve space before the footer');
      if (route === '/analytics') {
        assert(await page.$eval('.analytics-actions button:nth-child(1)', el => el.disabled), 'Data table waits for actual observations');
        assert(await page.$eval('.analytics-actions button:nth-child(2)', el => el.disabled), 'CSV waits for actual observations');
      }
      if (route === '/') {
        await page.type('.global-search input', '12345');
        await page.click('.search-submit');
        await page.waitForFunction(() => location.pathname === '/block/12345');
      }
      for (const request of held) if (!request.isInterceptResolutionHandled()) await request.continue();
      await page.close();
    }
  }
  console.log('Loading regression passed: home search works before data; list and analytics loading expose titles and keep footer below viewport (mobile/desktop).');
} finally { await browser.close(); }
