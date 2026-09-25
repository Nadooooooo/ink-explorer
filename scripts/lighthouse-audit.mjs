import lighthouse from 'lighthouse';
import desktopConfig from 'lighthouse/core/config/desktop-config.js';
import { launch } from 'chrome-launcher';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.BASE_URL || 'http://127.0.0.1:4188';
const output = process.env.LIGHTHOUSE_DIR || 'reports/lighthouse';
const routes = (process.env.LIGHTHOUSE_ROUTES || '/,/blocks,/tokens,/pools,/contracts,/analytics').split(',');
const profiles = (process.env.LIGHTHOUSE_PROFILES || 'mobile,desktop').split(',');
await mkdir(output, { recursive: true });
const summary = [];
for (const route of routes) {
  for (const profile of profiles) {
    const chrome = await launch({ chromePath: '/usr/bin/google-chrome', chromeFlags: ['--headless', '--no-sandbox'] });
    try {
      const result = await lighthouse(base + route, {
        port: chrome.port, logLevel: 'error', output: ['json', 'html'],
        onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
      }, profile === 'desktop' ? desktopConfig : undefined);
      if (result.lhr.runtimeError) throw new Error(JSON.stringify(result.lhr.runtimeError));
      const name = `${route === '/' ? 'home' : route.replace(/[^a-z0-9]+/gi, '-').replace(/^-/, '')}-${profile}`;
      await writeFile(`${output}/${name}.json`, result.report[0]);
      await writeFile(`${output}/${name}.html`, result.report[1]);
      const record = {
        route, profile, url: result.lhr.finalDisplayedUrl, version: result.lhr.lighthouseVersion,
        scores: Object.fromEntries(Object.entries(result.lhr.categories).map(([key, value]) => [key, Math.round(value.score * 100)])),
        metrics: Object.fromEntries(['first-contentful-paint', 'largest-contentful-paint', 'total-blocking-time', 'cumulative-layout-shift', 'speed-index'].map(key => [key, result.lhr.audits[key].numericValue])),
        failures: Object.values(result.lhr.audits).filter(a => a.score !== null && a.score < 1 && !['manual', 'informative', 'notApplicable'].includes(a.scoreDisplayMode)).map(a => ({ id: a.id, score: a.score, title: a.title, value: a.displayValue })),
        warnings: result.lhr.runWarnings,
      };
      summary.push(record);
      await writeFile(`${output}/summary.json`, JSON.stringify(summary, null, 2));
      console.log(name, JSON.stringify(record.scores), JSON.stringify(record.metrics));
    } finally { await chrome.kill(); }
  }
}
