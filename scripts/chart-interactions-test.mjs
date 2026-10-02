import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, firefox, webkit } from 'playwright';

const base = process.env.BASE_URL || 'http://127.0.0.1:4188';
const output = process.env.CHART_REVIEW_DIR || 'screenshots/chart-interactions';
const engines = (process.env.CHART_BROWSERS || 'chromium').split(',');
const results = [];
await mkdir(output, { recursive: true });
// Controlled histories make range, race and failure checks independent of live
// chain values. Other routes and the surrounding UI still use the real API.
function history(url) {
  const from = new Date(url.searchParams.get('from'));
  const to = new Date(url.searchParams.get('to'));
  const step = url.searchParams.get('resolution') === 'WEEK' ? 7 : 1;
  const metric = url.pathname.split('/').at(-1);
  const chart = [];
  for (let date = +from, index = 0; date <= +to; date += step * 86400000, index++) {
    const value = metric === 'txnsSuccessRate' ? .98 : metric === 'averageTxnFee' ? .000000003 + index * .000000001 : 1000 + index * 17;
    chart.push({ date: new Date(date).toISOString().slice(0, 10), value: String(value), is_approximate: date === +to });
  }
  return { chart };
}
for (const engine of engines) {
  const browser = await ({ chromium, firefox, webkit }[engine]).launch(engine === 'chromium' ? { executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] } : {});
  try {
    for (const width of [320, 390, 768, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 500, ...(engine !== 'firefox' ? { isMobile: width < 500 } : {}) });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      let failure = false, empty = false, race = false;
      const requests = [];
      let releaseBlocks;
      let blockFailure = true;
      let blockRequests = 0;
      const blocksReady = new Promise(resolve => { releaseBlocks = resolve; });
      await page.route('**/api/explorer/blocks', async route => {
        blockRequests++;
        if (blockRequests === 1) await blocksReady;
        if (blockFailure) return route.fulfill({ status: 503, json: { error: 'Deliberate utilization test failure' } });
        await route.fulfill({ json: { items: Array.from({ length: 50 }, (_, index) => ({
          gas_used_percentage: 20 + index, timestamp: new Date(Date.UTC(2026, 8, 30, 12, 0, 50 - index)).toISOString(),
        })) } });
      });
      await page.route('**/api/stats/lines/**', async route => {
        const url = new URL(route.request().url());
        const metric = url.pathname.split('/').at(-1);
        requests.push(metric);
        if (metric === 'newAccounts' && failure) return route.fulfill({ status: 503, json: { error: 'Deliberate chart test failure' } });
        if (metric === 'newAccounts' && empty) return route.fulfill({ json: { chart: [] } });
        const payload = history(url);
        if (metric === 'activeAccounts' && race && payload.chart.length === 90) await new Promise(resolve => setTimeout(resolve, 650));
        await route.fulfill({ json: payload }).catch(() => {});
      });
      await page.goto(`${base}/analytics`, { waitUntil: 'domcontentloaded' });
      await page.locator('.analytics-lead .interactive-chart').waitFor();
      await page.locator('.block-utilization .chart-loading').waitFor();
      assert.ok(await page.locator('main h1').isVisible(), 'Title renders while blocks remain pending');
      assert.equal(await page.locator('.analytics-actions button').nth(1).isEnabled(), true, 'Slow blocks never block CSV histories');
      const readyLead = { points: await page.locator('.analytics-lead .interactive-chart').getAttribute('data-points'), value: await page.locator('.analytics-lead > div > strong').textContent() };
      releaseBlocks();
      await page.locator('.block-utilization .chart-error').waitFor();
      assert.deepEqual({ points: await page.locator('.analytics-lead .interactive-chart').getAttribute('data-points'), value: await page.locator('.analytics-lead > div > strong').textContent() }, readyLead, 'Block failure leaves statistics observations available');
      blockFailure = false;
      await page.locator('.block-utilization .chart-error button').click();
      await page.locator('.block-utilization .interactive-chart[data-points="50"]').waitFor();
      await page.locator('.block-utilization select').selectOption('10');
      await page.locator('.block-utilization .interactive-chart[data-points="10"]').waitFor();
      assert.equal(blockRequests, 2, 'Block range reuses observations; retry requests just the failed feed');
      await page.locator('.stat-chart[aria-busy="false"]').last().waitFor();
      const lead = page.locator('.analytics-lead');
      const cards = page.locator('article.stat-chart');
      assert.equal(await page.locator('.page-intro .chart-range, .period-switch').count(), 0, 'No global timeframe');
      assert.equal(await page.locator('.chart-range select').count(), 7, 'Each of seven analytics charts has its own range');
      const first = cards.nth(0), second = cards.nth(1);
      const secondPath = await second.locator('.sparkline path[fill="none"]').getAttribute('d');
      requests.length = 0;
      await first.locator('select').selectOption('7');
      await first.locator('.interactive-chart[data-points="7"]').waitFor();
      assert.equal(await second.locator('select').inputValue(), '30');
      assert.equal(await second.locator('.sparkline path[fill="none"]').getAttribute('d'), secondPath);
      assert.equal(await lead.locator('select').inputValue(), '30');
      assert.deepEqual(requests, ['activeAccounts'], 'One range change requests only its own history');
      // Native touch, pointer and keyboard all activate only one local inspector.
      async function inspect(chart, fraction) {
        await chart.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const box = await chart.boundingBox();
        if (width < 500) await page.touchscreen.tap(box.x + box.width * fraction, box.y + box.height * .6);
        else await page.mouse.move(box.x + box.width * fraction, box.y + box.height * .6);
        await chart.locator('.chart-tooltip').waitFor({ timeout: 5000 }).catch(async error => {
          await page.screenshot({ path: `${output}/${engine}-${width}-failed.png` });
          throw error;
        });
        assert.equal(await page.locator('.chart-tooltip').count(), 1);
        const tip = await chart.locator('.chart-tooltip').boundingBox();
        assert.ok(tip.x >= box.x - 1 && tip.x + tip.width <= box.x + box.width + 1, 'Tooltip remains within its chart');
        assert.ok(tip.width <= 201 && tip.height <= 90, 'Tooltip stays compact with just date and value');
        const content = await chart.locator('.chart-tooltip').evaluate(element => ({
          fields: [...element.children].map(child => child.tagName),
          date: element.querySelector('span')?.textContent.trim(),
          value: element.querySelector('strong')?.textContent.trim(),
        }));
        assert.deepEqual(content.fields, ['SPAN', 'STRONG'], 'No prose or comparison paragraph in the tooltip');
        assert.ok(content.date && content.value, 'The observation date and value remain available');
      }
      await inspect(first.locator('.interactive-chart'), .02);
      await inspect(second.locator('.interactive-chart'), .98);
      await page.screenshot({ path: `${output}/${engine}-${width}-tooltip.png` });
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('.chart-tooltip').count(), 0);
      await first.locator('.interactive-chart').focus();
      // Let the browser's focus scroll finish before inspecting a point;
      // scrolling intentionally dismisses chart tooltips.
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.keyboard.press('End');
      await page.keyboard.press('ArrowLeft');
      assert.equal(await page.locator('.chart-tooltip').count(), 1);
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('.chart-tooltip').count(), 0, 'Blur dismisses inspector');
      await inspect(first.locator('.interactive-chart'), .6);
      await first.locator('h3').click();
      assert.equal(await page.locator('.chart-tooltip').count(), 0, 'Outside tap dismisses inspector');
      await inspect(first.locator('.interactive-chart'), .4);
      await page.evaluate(() => window.scrollBy({ top: 100, behavior: "instant" }));
      await page.waitForFunction(() => !document.querySelector(".chart-tooltip"));
      assert.equal(await page.locator('.chart-tooltip').count(), 0, 'Scrolling dismisses inspector');
      // Range changes leave neighbouring cards mounted and discard late results.
      race = true;
      await first.locator('select').selectOption('90');
      await page.waitForTimeout(50);
      await first.locator('select').selectOption('7');
      await page.waitForTimeout(800);
      assert.equal(await first.locator('.interactive-chart').getAttribute('data-points'), '7');
      failure = true;
      await second.locator('select').selectOption('90');
      await second.locator('.chart-error').waitFor();
      assert.equal(await first.locator('.interactive-chart').getAttribute('data-points'), '7');
      failure = false;
      await second.locator('.chart-error button').click();
      await second.locator('.interactive-chart[data-points="90"]').waitFor();
      empty = true;
      await second.locator('select').selectOption('7');
      await second.locator('.chart-empty').waitFor();
      empty = false;
      await second.locator('select').selectOption('30');
      await second.locator('.interactive-chart').waitFor();
      const dailySummary = await page.locator('.analytics-counters .metric').first().textContent();
      const comparison = await page.locator('.stat-chart.statement strong').textContent();
      await lead.locator('select').selectOption('365');
      await lead.locator('.interactive-chart[data-points="53"]').waitFor();
      assert.ok(page.url().includes('range=365'));
      assert.equal(await page.locator('.analytics-counters .metric').first().textContent(), dailySummary);
      assert.equal(await page.locator('.stat-chart.statement strong').textContent(), comparison);
      assert.equal(await first.locator('select').inputValue(), '7');
      assert.equal(await second.locator('select').inputValue(), '30');
      assert.equal(await page.locator('.block-utilization select').inputValue(), '10');
      assert.equal(blockRequests, 2, 'Transaction period leaves the independent block feed mounted');
      // Arabic long labels, RTL positions, and shortened history on the home chart.
      await page.goto(`${base}/analytics?lang=ar`, { waitUntil: 'networkidle' });
      await inspect(page.locator('article.stat-chart .interactive-chart').first(), .01);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      assert.ok(overflow <= 1, `RTL document overflow: ${overflow}`);
      await page.goto(`${base}/?lang=en`, { waitUntil: 'networkidle' });
      const home = page.locator('.signal-main');
      await home.locator('select').selectOption('7');
      assert.equal(await home.locator('.interactive-chart').getAttribute('data-points'), '7');
      await inspect(home.locator('.interactive-chart'), .98);
      assert.deepEqual(errors, []);
      results.push({ engine, width, result: 'passed' });
      console.log(`${engine} ${width}px passed`);
      await context.close();
    }
  } finally { await browser.close(); }
}
await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
console.log(`Chart regression checks passed (${results.length} browser/viewport combinations).`);
