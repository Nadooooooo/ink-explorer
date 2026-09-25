import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import puppeteer from 'puppeteer-core';

const base = process.env.BASE_URL || 'http://127.0.0.1:4188';
const output = process.env.SPACE_REVIEW_DIR || 'screenshots/space-review';
await mkdir(output, { recursive: true });
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const results = [];
const failures = [];
try {
  for (const width of [320, 390, 768, 1920, 2560]) {
    const page = await browser.newPage();
    await page.setViewport({ width, height: width < 500 ? 844 : 1080, isMobile: width < 500, hasTouch: width < 500 });
    for (const [name, route] of [['home', '/'], ['blocks', '/blocks'], ['analytics', '/analytics'], ['network', '/network'], ['search', '/search?q=WETH']]) {
      await page.goto(base + route, { waitUntil: 'networkidle0', timeout: 30000 });
      await page.waitForFunction(() => !document.querySelector('main > .loading'));
      const metrics = await page.evaluate(() => {
        const rect = selector => document.querySelector(selector)?.getBoundingClientRect().toJSON();
        const main = rect('main');
        const children = [...document.querySelector('main').children].map(el => el.getBoundingClientRect()).filter(r => r.height > 0);
        return {
          main, intro: rect('.home-intro'), search: rect('.home-command'), counters: rect('.home-overview .metric-grid'), trend: rect('.signal-grid'), live: rect('.live-section'),
          chartHeights: [...document.querySelectorAll('.interactive-chart')].map(el => el.getBoundingClientRect().height),
          gap: Math.max(0, ...children.slice(1).map((r, i) => r.top - children[i].bottom)),
          metricClipping: [...document.querySelectorAll('.home-overview .metric > strong')].filter(el => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1).map(el => el.textContent),
          overflow: document.documentElement.scrollWidth - innerWidth,
          error: !!document.querySelector('main > .error-state'),
        };
      });
      const checks = {
        contentLoaded: !metrics.error,
        documentFits: metrics.overflow <= 1,
        wideCanvasUsed: width < 1920 || metrics.main.width / width >= 0.85,
        sectionSpacing: metrics.gap <= 56,
        chartsBounded: metrics.chartHeights.every(height => height <= 320),
        valuesReadable: metrics.metricClipping.length === 0,
      };
      if (name === 'home') {
        checks.searchReachable = width > 430 || metrics.search.bottom <= 620;
        checks.compactMobileCounters = width > 430 || metrics.counters.height <= 430;
        checks.desktopSummarySideBySide = width < 1200 || (Math.abs(metrics.counters.top - metrics.trend.top) <= 1 && Math.abs(metrics.counters.bottom - metrics.trend.bottom) <= 24);
        checks.liveContentReachable = width < 1200 || metrics.live.top <= 1000;
      }
      for (const [check, passed] of Object.entries(checks)) if (!passed) failures.push(`${name} ${width}px: ${check}`);
      const proof = `after-${name}-${width}.png`;
      await page.screenshot({ path: `${output}/${proof}`, fullPage: true });
      results.push({ name, route, width, metrics, checks, proof, result: Object.values(checks).every(Boolean) ? 'passed' : 'failed' });
    }
    await page.close();
  }
} finally {
  await browser.close();
  await writeFile(`${output}/results.json`, JSON.stringify({ recordedAt: new Date().toISOString(), results, failures }, null, 2));
}
assert.deepEqual(failures, [], failures.join('\n'));
console.log(`Space usage test passed (${results.length} route/viewport cases, measured density and full-page visual proofs).`);
