import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import puppeteer from 'puppeteer-core';
import { nftContract, nftInstance, sampleNftHolder } from './public-nft-fixture.mjs';

const base = process.env.BASE_URL || 'http://127.0.0.1:4188';
const output = process.env.STYLE_REVIEW_DIR || 'screenshots/style-review';
const widths = (process.env.STYLE_WIDTHS || '320,390,768,1440,1920').split(',').map(Number);
const failures = [], results = [];
await mkdir(output, { recursive: true });
const api = path => fetch(base + path).then(response => response.json());
const [overview, tokens, pools] = await Promise.all([api('/api/overview'), api('/api/explorer/tokens'), api('/api/contract-info/pools')]);
const nftHolder = await sampleNftHolder(base);
const routes = [
  ['home', '/'], ['blocks', '/blocks'], ['transactions', '/txs'], ['tokens', '/tokens'], ['pools', '/pools'],
  ['contracts', '/contracts'], ['analytics', '/analytics'], ['advanced', '/advanced'], ['developers', '/developers'], ['network', '/network'], ['search', '/search?q=WETH'],
  ['block', `/block/${overview.blocks[0].height}`], ['transaction', `/tx/${overview.transactions[0].hash}`],
  ['address', `/address/${overview.transactions[0].from.hash}`], ['token', `/token/${tokens.items[0].address_hash}`], ['pool', `/pools/${pools.items[0].pool_id}`],
  ['nft', `/token/${nftContract}/instance/${nftInstance}`], ['not-found', '/missing-page'],
  ['contract-source', '/address/0x4200000000000000000000000000000000000006', 'Contract source'],
  ['nft-collection', `/address/${nftHolder}`, 'NFTs'],
  ['transaction-input', `/tx/${overview.transactions[0].hash}`, 'Input data'],
];
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
async function inspect(page, name, width) {
  const audit = await page.evaluate(() => {
    const checks = [], counts = {};
    const probe = document.createElement('div'); document.body.append(probe);
    const expected = (property, token) => {
      probe.style.cssText = `${property.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}:var(${token});`;
      return getComputedStyle(probe)[property];
    };
    const visible = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden'; };
    const families = [
      ['cards', '.metric,.analytic-card:not(.dark),.stat-chart:not(.statement),.contract-card,.nft-item,.counter-library article', { backgroundColor: '--surface-card', borderTopColor: '--line', borderTopLeftRadius: '--radius-card', boxShadow: '--shadow-card' }],
      ['panels', '.definitions,.entity-profile,.detail-feed,.table-shell,.live-columns,.raw-metadata,.code-panel,.nft-detail,.nft-attributes > div,.pool-detail-grid,.rpc-community,.developer-grid,.network-detail,.pool-workbench,.signal-main', { backgroundColor: '--surface-panel', borderTopColor: '--line', borderTopLeftRadius: '--radius-panel' }],
      ['heroes', '.page-intro,.detail-header,.token-hero,.pool-hero', { borderTopLeftRadius: '--radius-hero', borderTopColor: '--line' }],
      ['headers', '.panel-head,.table-toolbar,.token-table-head,.pool-table-head,.source-head,.source-file summary,.raw-metadata summary', { backgroundImage: '--surface-header' }],
      ['primary-actions', '.primary-action,.external-action:not(.entity-profile > .external-action),.not-found button,.pool-actions a', { backgroundImage: '--action-fill', borderTopLeftRadius: '--radius-control', fontFamily: '--font-ui' }],
      ['secondary-actions', '.pagination button,.analytics-actions button,.pool-pagination button,.pool-filter-status button,.pool-actions button,.ledger-filters button', { borderTopLeftRadius: '--radius-control', fontFamily: '--font-ui' }],
      ['search-fields', '.global-search,.pool-search', { backgroundColor: '--surface-field', borderTopColor: '--field-border', borderTopLeftRadius: '--radius-control', boxShadow: '--shadow-field' }],
      ['selectors', '.language-picker select,.pool-filter-grid select,.pool-pagination select', { fontFamily: '--font-ui' }],
      ['code', '.code-panel pre,.contract-source pre,.raw-metadata pre', { backgroundColor: '--surface-code', color: '--text-on-dark', fontFamily: '--font-mono' }],
      ['errors', '.error-state', { borderTopLeftRadius: '--radius-panel' }],
      ['empty-chart', '.chart-empty', { backgroundColor: '--surface-muted', borderTopLeftRadius: '--radius-inset' }],
      ['copy-buttons', '.copy-button', { borderTopLeftRadius: '--radius-inset' }],
      ['loading', '.loading', { borderTopLeftRadius: '--radius-panel', backgroundColor: '--surface-panel' }],
      ['selected-segment', '.period-switch button.active', { backgroundImage: '--action-fill', borderTopLeftRadius: '--radius-inset' }],
      ['segmented', '.tabs,.period-switch', { borderTopLeftRadius: '--radius-control', backgroundColor: '--surface-muted' }],
      ['status', '.status', { borderTopLeftRadius: '--radius-pill', fontFamily: '--font-mono' }],
    ];
    for (const [family, selector, properties] of families) {
      const elements = [...document.querySelectorAll(selector)].filter(visible);
      counts[family] = elements.length;
      for (const el of elements) {
        const style = getComputedStyle(el);
        for (const [property, token] of Object.entries(properties)) {
          const target = expected(property, token);
          if (style[property] !== target) checks.push({ family, selector: el.tagName + '.' + el.className, property, actual: style[property], expected: target });
        }
      }
    }
    const nativeButtons = [...document.querySelectorAll('main button')].filter(visible).filter(el => ['outset', 'inset'].includes(getComputedStyle(el).borderTopStyle)).map(el => el.outerHTML.slice(0, 160));
    const fonts = [...document.querySelectorAll('main button,main input,main select')].filter(visible).filter(el => !/Plus Jakarta Sans|DM Mono/.test(getComputedStyle(el).fontFamily)).map(el => ({ selector: el.tagName + '.' + el.className, font: getComputedStyle(el).fontFamily }));
    const headings = [...document.querySelectorAll('main h1:not(.mono),main h2:not(.mono),main h3:not(.mono)')].filter(visible).filter(el => !getComputedStyle(el).fontFamily.includes('Plus Jakarta Sans')).map(el => el.textContent);
    const overflow = document.documentElement.scrollWidth - innerWidth;
    probe.remove();
    return { checks, counts, fonts, headings, nativeButtons, overflow };
  });
  for (const check of audit.checks) failures.push(`${name} ${width}px: ${JSON.stringify(check)}`);
  if (audit.fonts.length || audit.headings.length || audit.nativeButtons.length || audit.overflow > 1) failures.push(`${name} ${width}px: font or overflow ${JSON.stringify(audit)}`);
  const proof = `after-${name}-${width}.png`;
  if (width === 390 || width === 1440) await page.screenshot({ path: `${output}/${proof}`, fullPage: true });
  results.push({ name, width, ...audit, proof: width === 390 || width === 1440 ? proof : null });
}
try {
  for (const width of widths) {
    const page = await browser.newPage();
    await page.setViewport({ width, height: width < 500 ? 844 : 1000, isMobile: width < 500, hasTouch: width < 500 });
    for (const [name, route, tab] of routes) {
      await page.goto(base + route, { waitUntil: 'networkidle0', timeout: 30000 });
      if (tab) {
        const clicked = await page.$$eval('.tabs button', (buttons, text) => { const b = buttons.find(b => b.textContent.trim().toLowerCase() === text.toLowerCase()); if (!b) return false; b.click(); return true; }, tab);
        assert.ok(clicked, `${name}: missing tab ${tab}`);
        await page.waitForFunction(() => !document.querySelector('.address-activity .loading,.code-panel .loading'));
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      if (name === 'nft') await page.$eval('.raw-metadata', el => el.open = true);
      await inspect(page, name, width);
    }
    // Exercise real controls and clearly labelled simulated network states.
    await page.goto(base + `/token/${nftContract}/instance/${nftInstance}`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.copy-button');
    await page.click('.copy-button');
    await page.waitForSelector('.copy-button.copied');
    const copied = await page.$eval('.copy-button.copied', el => ({ radius: getComputedStyle(el).borderTopLeftRadius, label: el.getAttribute('aria-label'), border: getComputedStyle(el).borderTopWidth }));
    if (copied.radius !== '8px' || copied.label !== 'Copied' || copied.border !== '0px') failures.push(`copy state ${width}px: ${JSON.stringify(copied)}`);
    await page.goto(base + '/pools', { waitUntil: 'networkidle0' });
    await page.keyboard.press('Tab');
    await page.focus('.pool-filter-grid select');
    const focus = await page.$eval('.pool-filter-grid select', el => ({ width: getComputedStyle(el).outlineWidth, style: getComputedStyle(el).outlineStyle, visible: el.matches(':focus-visible') }));
    if (focus.width !== '3px' || focus.style !== 'solid' || !focus.visible) failures.push(`focus ${width}px: ${JSON.stringify(focus)}`);
    const disabled = '.pool-pagination button:disabled';
    const disabledBefore = await page.$eval(disabled, el => ({ background: getComputedStyle(el).backgroundColor, opacity: getComputedStyle(el).opacity }));
    await page.hover(disabled); await new Promise(resolve => setTimeout(resolve, 250));
    const disabledAfter = await page.$eval(disabled, el => ({ background: getComputedStyle(el).backgroundColor, opacity: getComputedStyle(el).opacity }));
    if (JSON.stringify(disabledBefore) !== JSON.stringify(disabledAfter) || disabledAfter.opacity !== '0.45') failures.push(`disabled hover changed at ${width}px`);
    await page.hover('.pool-row'); await new Promise(resolve => setTimeout(resolve, 250));
    const hover = await page.$eval('.pool-row', el => getComputedStyle(el).backgroundColor);
    if (hover !== 'rgb(247, 242, 255)') failures.push(`row hover ${width}px: ${hover}`);
    await page.goto(base + '/analytics', { waitUntil: 'networkidle0' });
    await page.click('.period-switch button:last-child');
    await page.waitForFunction(() => !document.querySelector('main > .loading'));
    await inspect(page, 'selected-period', width);
    let held;
    await page.setRequestInterception(true);
    page.on('request', request => {
      if (request.url().includes('/api/explorer/blocks')) held = request;
      else request.continue();
    });
    await page.goto(base + '/blocks', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.table-shell > .loading');
    await inspect(page, 'loading-simulated', width);
    for (let attempt = 0; !held && attempt < 1000; attempt++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.ok(held, 'Expected the intercepted blocks request');
    await held.respond({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Simulated network error for style review' }) });
    await page.waitForSelector('.error-state');
    await inspect(page, 'error-simulated', width);
    page.removeAllListeners('request');
    page.on('request', request => request.url().includes('/api/explorer/search') ? request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) }) : request.continue());
    await page.goto(base + '/search?q=style-review-empty', { waitUntil: 'networkidle0' });
    await page.waitForSelector('.empty');
    await inspect(page, 'empty-simulated', width);
    page.removeAllListeners('request');
    page.on('request', request => request.url().includes('/api/stats/lines/') ? request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ chart: [] }) }) : request.continue());
    await page.goto(base + '/analytics', { waitUntil: 'networkidle0' });
    await page.waitForSelector('.chart-empty');
    await inspect(page, 'empty-chart-simulated', width);
    await page.close();
    console.log(`Style families checked at ${width}px.`);
  }
} finally {
  await browser.close();
  await writeFile(`${output}/results.json`, JSON.stringify({ recordedAt: new Date().toISOString(), routes, results, failures }, null, 2));
}
assert.deepEqual(failures, [], failures.slice(0, 40).join('\n'));
console.log(`Style consistency test passed (${routes.length} route states + selected/loading/error/empty/empty-chart states × ${widths.length} formats; tokens, typography, hover, focus and visual proofs).`);
