import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { preview } from 'vite';

// Capture the actual UI before chain data arrives. No build-time blockchain
// observations are published: the browser still subscribes to current blocks.
const server = await preview({ configFile: false, build: { outDir: 'dist' }, preview: { host: '127.0.0.1', port: 0, open: false } });
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const manifest = [];
try {
  await mkdir('dist/snapshots', { recursive: true });
  for (const network of ['mainnet', 'sepolia']) for (const language of ['en', 'fr', 'es', 'pt', 'ar', 'ru', 'hi', 'bn', 'zh', 'ja']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: language, colorScheme: 'light' });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    // Leave every API read pending; this prevents stale/fake numbers and makes
    // the HTML independent of data-provider availability during a build.
    await context.route('**/api/**', () => {});
    await context.routeWebSocket(/\/api\/live$/, () => {});
    try {
      await page.goto(`${origin}${network === 'sepolia' ? '/testnet' : ''}/?lang=${language}`, { waitUntil: 'domcontentloaded' });
      await page.locator('.home-overview').waitFor();
      await page.locator('.site-footer').waitFor();
      await page.waitForFunction(lang => document.documentElement.lang === lang, language);
      assert.deepEqual(errors, []);
      assert.equal(await page.locator('.tx-row,.block-row:not(.home-block-placeholder)').count(), 0, 'No chain observations may enter the build');
      const html = await page.locator('#root').evaluate(root => {
        root.querySelector('main')?.setAttribute('aria-busy', 'true');
        // innerHTML does not serialize live select/input properties. Preserve
        // the actual network, language and chart period in the first document.
        for (const select of root.querySelectorAll('select')) {
          for (const option of select.options) option.toggleAttribute('selected', option.selected);
        }
        for (const input of root.querySelectorAll('input')) {
          if (input.type === 'checkbox' || input.type === 'radio') input.toggleAttribute('checked', input.checked);
          else input.setAttribute('value', input.value);
        }
        // Use native GET search until React attaches its richer search behavior.
        const form = root.querySelector('.global-search');
        if (form?.tagName === 'FORM') {
          form.setAttribute('action', location.pathname.startsWith('/testnet') ? '/testnet/search' : '/search');
          form.setAttribute('method', 'get');
          const field = form.querySelector('input');
          if (field) field.name = 'q';
          const language = new URLSearchParams(location.search).get('lang');
          if (language && language !== 'en') { const hidden = document.createElement('input'); hidden.type = 'hidden'; hidden.name = 'lang'; hidden.value = language; form.append(hidden); }
        }
        return root.innerHTML;
      });
      assert(!html.includes(origin), 'Preview origin must not be published');
      assert(!html.includes('ink-startup'), 'The application must have replaced the loading fallback');
      await writeFile(`dist/snapshots/home-${network}-${language}.html`, html);
      manifest.push({ network, language, bytes: Buffer.byteLength(html), chainObservations: 0 });
    } finally { await context.close(); }
  }
  await writeFile('dist/snapshots/manifest.json', JSON.stringify(manifest, null, 2));
  console.log(`Prerendered ${manifest.length} localized home pages without blockchain snapshots.`);
} finally { await browser.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
