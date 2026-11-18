import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import puppeteer from 'puppeteer-core';
import { nftContract, nftInstance, sampleNftHolder } from './public-nft-fixture.mjs';

const base = process.env.BASE_URL || 'http://127.0.0.1:4188';
const output = process.env.STYLE_REVIEW_DIR || 'screenshots/style-review';
const widths = (process.env.STYLE_WIDTHS || '320,390,768,1440,1920').split(',').map(Number);
const failures = [], results = [], negativeControls = [];
await mkdir(output, { recursive: true });
const api = path => fetch(base + path).then(response => response.json());
const [overview, tokens, pools] = await Promise.all([api('/api/overview'), api('/api/explorer/tokens'), api('/api/contract-info/pools')]);
const nftHolder = await sampleNftHolder(base);
const routes = [
  ['home', '/'], ['blocks', '/blocks'], ['transactions', '/txs'], ['filtered-activity','/txs?activity=filtered'], ['tokens', '/tokens'], ['pools', '/pools'],
  ['contracts', '/contracts'], ['analytics', '/analytics'], ['advanced', '/advanced'], ['developers', '/developers'], ['network', '/network'], ['search', '/search?q=WETH'],
  ['block', `/block/${overview.blocks[0].height}`], ['transaction', `/tx/${overview.transactions[0].hash}`],
  ['address', `/address/${overview.transactions[0].from.hash}`], ['token', `/token/${tokens.items[0].address_hash}`], ['pool', `/pools/${pools.items[0].pool_id}`],
  ['nft', `/token/${nftContract}/instance/${nftInstance}`], ['not-found', '/missing-page'],
  ['contract-source', '/address/0x4200000000000000000000000000000000000006', 'Contract source'],
  ['nft-collection', `/address/${nftHolder}`, 'NFTs'],
  ['transaction-input', `/tx/${overview.transactions[0].hash}`, 'Input data'],
];
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
function collectStyleAudit() {
    const checks = [], counts = {}, languagePickerFonts = [];
    const probe = document.createElement('div'); document.body.append(probe);
    const expected = (property, token, scope) => {
      probe.style.cssText = `${property.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}:${token.startsWith("--") ? `var(${token})` : token};`;
      // Only the language picker intentionally overrides the UI font token.
      // Keep every other family/property expectation rooted at body.
      if (scope) probe.style.setProperty(token, getComputedStyle(scope).getPropertyValue(token));
      return getComputedStyle(probe)[property];
    };
    probe.style.fontFamily = '"Ink Language Names Devanagari", "Ink Language Names Bengali", "Plus Jakarta Sans Variable", Arial, sans-serif';
    const languageFontContract = getComputedStyle(probe).fontFamily;
    const visible = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden'; };
    const families = [
      ['cards', '.metric,.analytic-card:not(.dark),.stat-chart:not(.statement),.contract-card,.nft-item,.counter-library article', { backgroundColor: '--surface-card', borderTopColor: '--line', borderTopLeftRadius: '--radius-card', boxShadow: '--shadow-card' }],
      ['panels', '.definitions,.entity-profile,.detail-feed,.table-shell,.live-columns > .panel,.raw-metadata,.nft-json,.code-panel,.nft-detail,.nft-attributes > div,.pool-detail-grid,.rpc-community,.developer-grid,.network-detail,.pool-workbench,.signal-main', { backgroundColor: '--surface-panel', borderTopColor: '--line', borderTopLeftRadius: '--radius-panel' }],
      ['heroes', '.page-intro,.detail-header,.token-hero,.pool-hero', { borderTopLeftRadius: '--radius-hero', borderTopColor: '--line' }],
      ['headers', '.panel-head,.table-toolbar,.ledger-columns,.token-table-head,.pool-table-head,.source-head,.source-file summary,.raw-metadata summary', { backgroundImage: '--surface-header' }],
      ['primary-actions', '.primary-action,.external-action:not(.entity-profile > .external-action),.not-found a[href],.pool-actions a:not(.explorer-link)', { backgroundColor: '--action-fill', backgroundImage: 'none', borderTopLeftRadius: '--radius-control', fontFamily: '--font-ui' }],
      ['secondary-actions', '.pagination button,.analytics-actions button,.pool-pagination button,.pool-filter-status button,.pool-actions :is(button, a.explorer-link),.ledger-filters button', { borderTopLeftRadius: '--radius-control', fontFamily: '--font-ui' }],
      ['search-fields', '.global-search,.pool-search', { backgroundColor: '--surface-field', borderTopColor: '--field-border', borderTopLeftRadius: '--radius-control', boxShadow: '--shadow-field' }],
      ['selectors', '.language-picker select,.pool-filter-grid select,.pool-pagination select,.chart-range select,.section-picker select', { fontFamily: '--font-ui' }],
      ['mobile-sections', '.section-picker select', { borderTopLeftRadius: '--radius-control', borderTopColor: '--line', backgroundColor: '--surface-muted' }],
      ['code', '.code-panel pre,.contract-source pre,.raw-metadata pre,.nft-json pre', { backgroundColor: '--surface-code', color: '--text-on-dark', fontFamily: '--font-mono' }],
      ['errors', '.error-state', { borderTopLeftRadius: '--radius-panel' }],
      ['cached-data', '.data-freshness', { backgroundColor: '--surface-warning', borderTopColor: '--border-warning', color: '--text-warning', borderTopLeftRadius: '--radius-card' }],
      ['empty-chart', '.chart-empty', { backgroundColor: '--surface-muted', borderTopLeftRadius: '--radius-inset' }],
      ['copy-buttons', '.copy-button', { borderTopLeftRadius: '--radius-inset' }],
      ['loading', '.loading', { borderTopLeftRadius: '--radius-panel', backgroundColor: '--surface-panel' }],
      ['selected-segment', '.period-switch button.active', { backgroundColor: '--action-fill', backgroundImage: 'none', borderTopLeftRadius: '--radius-inset' }],
      ['segmented', '.tabs,.period-switch', { borderTopLeftRadius: '--radius-control', backgroundColor: '--surface-muted' }],
      ['status', '.status', { borderTopLeftRadius: '--radius-pill', fontFamily: '--font-mono' }],
    ];
    for (const [family, selector, properties] of families) {
      const elements = [...document.querySelectorAll(selector)].filter(visible);
      counts[family] = elements.length;
      for (const el of elements) {
        const style = getComputedStyle(el);
        for (const [property, token] of Object.entries(properties)) {
          const languageSelect = property === 'fontFamily' && token === '--font-ui' && el.matches('.language-picker select');
          // Published redesign variants have explicit contracts; decorative
          // border colors on borderless elements have no rendered meaning.
          if (property === 'borderTopColor' && parseFloat(style.borderTopWidth) === 0) continue;
          let contract = token;
          if (property === 'borderTopLeftRadius' && el.matches('.header-search-field .global-search')) contract = innerWidth <= 760 ? '16px' : '14px';
          if (property === 'borderTopLeftRadius' && el.matches('.detail-header')) contract = innerWidth <= 760 ? '18px' : '20px';
          if (el.matches('.metric')) {
            if (property === 'borderTopColor' && innerWidth > 760 && el.matches('.home-overview .metric:first-child')) contract = 'transparent';
            if (property === 'borderTopColor' && innerWidth > 760 && el.matches('.address-page .address-summary .metric:first-child,.transaction-summary .metric:first-child')) contract = '--accent-border';
            if (property === 'boxShadow') contract = el.matches('.metric:first-child,.metric:last-child') ? 'none' : '--elevation';
            if (property === 'backgroundColor' && el.matches('.home-overview .metric:first-child')) contract = '--accent-solid';
            if (property === 'backgroundColor' && el.matches('.utilization-metric,.address-page .address-summary .metric:first-child,.transaction-summary .metric:first-child')) contract = '--surface-panel';
            if (property === 'borderTopLeftRadius' && el.matches('.home-overview .metric')) contract = '14px';
            if (property === 'borderTopLeftRadius' && innerWidth <= 760 && el.matches('.activity-ledger-page .transaction-summary .metric')) contract = '12px';
          }
          if (property === 'borderTopLeftRadius' && el.matches('.home-overview .signal-main')) contract = '16px';
          if (property === 'borderTopColor' && el.matches('.signal-main,.live-columns > .panel,.detail-header,.token-hero,.pool-hero')) contract = '--accent-border';
          if (property === 'borderTopLeftRadius' && el.matches('.activity-ledger-page .table-shell')) contract = '16px';
          if (property === 'borderTopLeftRadius' && el.matches('.page-intro')) contract = '0px';
          if (property === 'borderTopLeftRadius' && innerWidth <= 760 && el.matches('.detail-header')) contract = '18px';
          if (property === 'backgroundColor' && el.matches('.stats-chart-card .stat-chart')) contract = 'transparent';
          if (property === 'borderTopLeftRadius' && innerWidth <= 760 && el.matches('.header-search-field .global-search')) contract = '16px';
          if (property === 'borderTopLeftRadius' && el.matches('.ledger-top-pagination > button')) contract = '10px';
          if (el.matches('.nft-json') && property === 'borderTopLeftRadius') contract = '--radius-card';
          if (el.matches('.nft-json pre') && property === 'backgroundColor') contract = '--surface-muted';
          if (el.matches('.nft-json pre') && property === 'color') contract = '--ink';
          const target = expected(property, contract, languageSelect ? el.closest('.language-picker') : undefined);
          const elementSelector = languageSelect ? '.language-picker select' : el.tagName + '.' + el.className;
          if (languageSelect) {
            languagePickerFonts.push({ selector: elementSelector, actual: style[property], expected: target, contract: languageFontContract });
            // A local override is not an exemption: the dedicated control
            // must retain precisely the approved native-label font stack.
            if (target !== languageFontContract) checks.push({ family: 'language-font-contract', selector: elementSelector, property: token, actual: target, expected: languageFontContract });
          }
          if (style[property] !== target) checks.push({ family, selector: elementSelector, property, actual: style[property], expected: target });
        }
      }
    }
    const nativeButtons = [...document.querySelectorAll('main button,main a.explorer-link')].filter(visible).filter(el => ['outset', 'inset'].includes(getComputedStyle(el).borderTopStyle)).map(el => el.outerHTML.slice(0, 160));
    const fonts = [...document.querySelectorAll('main button,main a.explorer-link,main input,main select')].filter(visible).filter(el => !/Plus Jakarta Sans|DM Mono/.test(getComputedStyle(el).fontFamily)).map(el => ({ selector: el.tagName + '.' + el.className, font: getComputedStyle(el).fontFamily }));
    const headings = [...document.querySelectorAll('main h1:not(.mono),main h2:not(.mono),main h3:not(.mono)')].filter(visible).filter(el => !getComputedStyle(el).fontFamily.includes('Plus Jakarta Sans')).map(el => el.textContent);
    const overflow = document.documentElement.scrollWidth - innerWidth;
    probe.remove();
    return { checks, counts, fonts, headings, nativeButtons, overflow, languagePickerFonts };
}
async function chooseSection(page, label) {
  const pickerVisible = await page.$eval('.section-picker select', el => el.getClientRects().length > 0);
  if (pickerVisible) {
    const key = await page.$$eval('.section-picker option', (options, label) => options.find(option => option.textContent.trim().toLowerCase() === label.toLowerCase())?.value, label);
    assert.ok(key, `Missing section ${label}`); await page.select('.section-picker select', key);
  } else {
    const handle = await page.evaluateHandle(label => [...document.querySelectorAll('.tabs button')].find(button => button.textContent.trim().toLowerCase() === label.toLowerCase()), label);
    const button = handle.asElement(); assert.ok(button, `Missing section ${label}`); await button.click(); await handle.dispose();
  }
}
async function verifyLanguageFontGuards(page) {
  const utilityVisible = await page.$eval('.utility-bar .language-picker select', el => el.getClientRects().length > 0);
  if (!utilityVisible) await page.click('.drawer-trigger');
  const languageScope = utilityVisible ? '.utility-bar ' : '.drawer-preferences ';
  const cases = [
    { name: 'picker-actual-font', selector: languageScope + '.language-picker select', property: 'font-family', value: 'Arial', family: 'selectors', checkedProperty: 'fontFamily' },
    { name: 'picker-scoped-token', selector: languageScope + '.language-picker', property: '--font-ui', value: 'Arial', family: 'language-font-contract', checkedProperty: '--font-ui' },
    { name: 'ordinary-selector-font', selector: '.chart-range select', property: 'font-family', value: '"Ink Language Names Devanagari", "Ink Language Names Bengali", "Plus Jakarta Sans Variable", Arial, sans-serif', family: 'selectors', checkedProperty: 'fontFamily' },
  ];
  for (const control of cases) {
    const previous = await page.$eval(control.selector, (el, change) => {
      const saved = el.getAttribute('style');
      el.style.setProperty(change.property, change.value, 'important');
      return saved;
    }, control);
    let observed;
    try {
      observed = await page.evaluate(collectStyleAudit);
    } finally {
      await page.$eval(control.selector, (el, saved) => saved === null ? el.removeAttribute('style') : el.setAttribute('style', saved), previous);
    }
    const restored = await page.evaluate(collectStyleAudit);
    const detected = observed.checks.length === 1 && observed.checks[0].family === control.family && observed.checks[0].property === control.checkedProperty;
    const restoredCleanly = restored.checks.length === 0 && restored.fonts.length === 0 && restored.headings.length === 0 && restored.nativeButtons.length === 0 && restored.overflow <= 1;
    const passed = detected && restoredCleanly;
    negativeControls.push({ name: control.name, selector: control.selector, mutation: { property: control.property, value: control.value }, detected, restoredCleanly, observedChecks: observed.checks, passed });
    if (!passed) failures.push(`Style guard ${control.name} failed: ${JSON.stringify(negativeControls.at(-1))}`);
  }
  if (!utilityVisible) await page.keyboard.press('Escape');
}
async function inspect(page, name, width) {
  const audit = await page.evaluate(collectStyleAudit);
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
        await chooseSection(page, tab);
        await page.waitForFunction(() => !document.querySelector('.address-activity .loading,.code-panel .loading'));
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      if (name === 'nft') { await chooseSection(page, 'Metadata'); await page.waitForSelector('.nft-json pre'); }
      await inspect(page, name, width);
      if (name === 'home' && width === widths[0]) await verifyLanguageFontGuards(page);
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
    const focus = await page.$eval('.pool-filter-grid select', el => ({ width: getComputedStyle(el.closest('label')).outlineWidth, style: getComputedStyle(el.closest('label')).outlineStyle, visible: el.matches(':focus-visible') }));
    if (focus.width !== '2px' || focus.style !== 'solid' || !focus.visible) failures.push(`focus ${width}px: ${JSON.stringify(focus)}`);
    const disabled = '.pool-pagination button:disabled';
    const disabledBefore = await page.$eval(disabled, el => ({ background: getComputedStyle(el).backgroundColor, opacity: getComputedStyle(el).opacity }));
    await page.hover(disabled); await new Promise(resolve => setTimeout(resolve, 250));
    const disabledAfter = await page.$eval(disabled, el => ({ background: getComputedStyle(el).backgroundColor, opacity: getComputedStyle(el).opacity }));
    if (JSON.stringify(disabledBefore) !== JSON.stringify(disabledAfter) || disabledAfter.opacity !== '0.45') failures.push(`disabled hover changed at ${width}px`);
    await page.hover('.pool-row'); await new Promise(resolve => setTimeout(resolve, 250));
    const hover = await page.$eval('.pool-row', el => getComputedStyle(el).backgroundColor);
    if (hover !== 'rgb(244, 244, 244)') failures.push(`row hover ${width}px: ${hover}`);
    await page.goto(base + '/stats/newTxns', { waitUntil: 'networkidle0' });
    await page.waitForSelector('article.stat-chart .chart-range select');
    await page.select('article.stat-chart .chart-range select', '365');
    await page.waitForSelector('article.stat-chart[aria-busy="false"]');
    await page.waitForFunction(() => !document.querySelector('main > .loading'));
    await inspect(page, 'selected-period', width);
    await page.setUserAgent('InkExplorerStyleReviewBot/1.0');
    await page.setRequestInterception(true);
    for (const [name, route, endpoint] of [
      ['blocks', '/blocks', '/api/explorer/blocks'],
      ['transactions', '/txs', '/api/explorer/transactions'],
      ['advanced', '/advanced', '/api/explorer/optimism/deposits'],
    ]) {
      let held;
      page.removeAllListeners('request');
      page.on('request', request => {
        if (new URL(request.url()).pathname === endpoint) held = request;
        else if (/\/api\/live\/(config|snapshot)$/.test(new URL(request.url()).pathname)) request.respond({status:503,contentType:'application/json',body:'{}'});
        else request.continue();
      });
      await page.goto(base + route, { waitUntil: 'domcontentloaded' });
      console.log(`Inspecting ${name} controlled loading at ${width}px`);
      await page.waitForSelector('.table-shell > .loading,.table-shell > .ledger-skeleton');
      assert.equal(await page.$eval('.ledger-toolbar-count-full,.directory-controls > span', element => element.textContent.trim()), 'Loading records');
      await inspect(page, `${name}-loading-simulated`, width);
      for (let attempt = 0; !held && attempt < 1000; attempt++) await new Promise(resolve => setTimeout(resolve, 10));
      assert.ok(held, `Expected the intercepted ${name} request`);
      await held.respond({ status: 503, headers: { 'retry-after': '1' }, contentType: 'application/json', body: JSON.stringify({ error: 'Simulated network error for style review' }) });
      await page.waitForSelector('.error-state');
      assert.equal(await page.$eval('.ledger-toolbar-count-full,.directory-controls > span', element => element.textContent.trim()), 'Data temporarily unavailable');
      await inspect(page, `${name}-error-simulated`, width);
      page.removeAllListeners('request');
      page.on('request', request => new URL(request.url()).pathname === endpoint ? request.respond({ status: 200, headers: { date: new Date().toUTCString(), 'x-ink-data-status': 'fresh', 'x-ink-data-fetched-at': new Date().toISOString() }, contentType: 'application/json', body: JSON.stringify({ items: [] }) }) : request.continue());
      await new Promise(resolve => setTimeout(resolve, 1100));
      await page.click('.error-state button');
      await page.waitForFunction(() => [...document.querySelectorAll('.ledger-toolbar-count-full,.directory-controls > span')].some(el => el.textContent.trim() === '0 shown'));
      assert.equal(await page.$eval('.ledger-toolbar-count-full,.directory-controls > span', element => element.textContent.trim()), '0 shown');
      assert.equal(await page.$('.table-shell > .loading,.table-shell > .ledger-skeleton,.table-shell > .error-state'), null);
    }
    page.removeAllListeners('request');
    page.on('request', request => new URL(request.url()).pathname === '/api/search' ? request.respond({ status: 200, headers: { date: new Date().toUTCString(), 'x-ink-data-status': 'fresh', 'x-ink-data-fetched-at': new Date().toISOString() }, contentType: 'application/json', body: JSON.stringify({ items: [] }) }) : request.continue());
    await page.goto(base + '/search?q=style-review-empty', { waitUntil: 'networkidle0' });
    await page.waitForSelector('.empty');
    await inspect(page, 'empty-simulated', width);
    page.removeAllListeners('request');
    page.on('request', request => request.url().includes('/api/stats/lines/') ? request.respond({ status: 200, headers: { date: new Date().toUTCString(), 'x-ink-data-status': 'fresh', 'x-ink-data-fetched-at': new Date().toISOString() }, contentType: 'application/json', body: JSON.stringify({ chart: [] }) }) : request.continue());
    await page.goto(base + '/stats/newTxns', { waitUntil: 'networkidle0' });
    await page.waitForSelector('.chart-empty');
    await inspect(page, 'empty-chart-simulated', width);
    await page.close();
    console.log(`Style families checked at ${width}px.`);
  }
} finally {
  await browser.close();
  await writeFile(`${output}/results.json`, JSON.stringify({ recordedAt: new Date().toISOString(), routes, results, failures, negativeControls }, null, 2));
}
assert.deepEqual(failures, [], failures.slice(0, 40).join('\n'));
console.log(`Style consistency test passed (${routes.length} route states + selected/loading/error/empty/empty-chart states × ${widths.length} formats; tokens, typography, hover, focus and visual proofs).`);
