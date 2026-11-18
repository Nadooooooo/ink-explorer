import { headerSearch } from './navigation-actions.mjs';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium, firefox, webkit } from 'playwright';
import axe from 'axe-core';

const base = process.env.BASE_URL || 'http://127.0.0.1:4298';
const output = process.env.BLOCK_INDEXING_OUTPUT || 'reports/quality-20261016/head-indexing/browser';
const engines = (process.env.BLOCK_INDEXING_BROWSERS || 'chromium,firefox,webkit').split(',');
const profiles = [{ width: 320, locale: 'ar' }, { width: 390, locale: 'fr' }, { width: 1440, locale: 'en' }];
const translatedTitles = {
  ar: { block: 'جارٍ فهرسة تفاصيل الكتلة', transactions: 'جارٍ فهرسة معاملات الكتلة' },
  fr: { block: 'Détails du bloc en cours d’indexation', transactions: 'Transactions du bloc en cours d’indexation' },
};
const height = 8000100, otherHeight = 8000101;
const hash = '0x' + '1'.repeat(64), otherHash = '0x' + '2'.repeat(64), txHash = '0x' + '3'.repeat(64);
const address = '0x' + '4'.repeat(40), timestamp = '2026-10-16T21:30:00.000Z';
const block = (number = height) => ({ height: number, hash: number === height ? hash : otherHash, parent_hash: '0x' + '5'.repeat(64), timestamp, transactions_count: 1, gas_used: '21000', gas_limit: '1000000', gas_used_percentage: 2.1, base_fee_per_gas: '1000000', transaction_fees: '42000000000000', size: 1024 });
const transactions = { items: [{ hash: txHash, block_number: height, timestamp, status: 'ok', from: { hash: address }, to: { hash: address }, value: '1000000000000000', fee: { value: '42000000000000' }, method: 'transfer' }], next_page_params: null };
const results = [], failures = [];
let complete = false;
// A local copy of the historical report can link the live incident to this replay.
const originalPublicFailure = process.env.BLOCK_INDEXING_FAILURE_EVIDENCE;
const publicFailureSha256 = originalPublicFailure
  ? createHash('sha256').update(await readFile(originalPublicFailure)).digest('hex')
  : undefined;
await mkdir(output, { recursive: true });
async function save() {
  await writeFile(output + '/results.json', JSON.stringify({ base, recordedAt: new Date().toISOString(), complete, passed: complete && failures.length === 0, controlledApiFixtures: true, physicalDevices: false, clock: 'Playwright clock advances real browser timers; no React internals or source constants are read.', originalPublicFailure, publicFailureSha256, results, failures }, null, 2));
}
const pending = (chainId, overrides = {}) => ({ code: 'BLOCK_INDEXING', chainId, block: { number: String(height), hash }, retryAfterMs: 3000, ...overrides });
const notice = (page, kind, state = 'indexing') => page.locator(`.block-indexing[data-kind="${kind}"][data-state="${state}"]`);
const resourceError = (page, kind) => page.locator(`.block-resource-error[data-kind="${kind}"] .error-state`);
const digits = value => value.replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x06f0)).replace(/[\s,.\u066c\u202f\u00a0]/g, '');

async function eventually(fn, label, timeout = 8000) {
  const deadline = Date.now() + timeout;
  let error;
  do {
    try { return await fn(); } catch (caught) { error = caught; }
    await new Promise(resolve => setTimeout(resolve, 25));
  } while (Date.now() < deadline);
  throw new Error(`${label}: ${error?.message || 'condition not met'}`);
}
async function accessible(page, selector, withButton = false) {
  const target = page.locator(selector);
  await target.waitFor();
  assert.equal(await target.getAttribute('role'), 'status');
  const text = await target.innerText();
  assert(text.trim().length > 30, 'The indexing status explains what is happening');
  assert.doesNotMatch(text, /BLOCK_INDEXING|block(?:Transactions)?Indexing[A-Z]|undefined|NaN/);
  const locale = await page.locator('html').getAttribute('lang');
  const kind = await target.getAttribute('data-kind');
  if (translatedTitles[locale]) assert.equal(await target.locator('strong').innerText(), translatedTitles[locale][kind], 'Status title is explicitly translated');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'No horizontal overflow');
  const geometry = await target.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const clippedText = [...element.querySelectorAll('p,strong,span,button')].filter(node => {
      const style = getComputedStyle(node), range = document.createRange();
      range.selectNodeContents(node);
      // Inline text has clientWidth=0 in Firefox; scrollWidth alone does not
      // indicate clipping. Check actual text fragments and clipping overflow.
      const outsideNotice = [...range.getClientRects()].some(fragment => fragment.width > 0 && (fragment.left < rect.left - 1 || fragment.right > rect.right + 1 || fragment.top < rect.top - 1 || fragment.bottom > rect.bottom + 1));
      const clippedX = node.clientWidth > 0 && /hidden|clip/.test(style.overflowX) && node.scrollWidth > node.clientWidth + 1;
      const clippedY = node.clientHeight > 0 && /hidden|clip/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1;
      return outsideNotice || clippedX || clippedY;
    }).map(node => node.textContent);
    return { left: rect.left, right: rect.right, width: rect.width, viewport: innerWidth, clippedText };
  });
  assert(geometry.left >= -1 && geometry.right <= geometry.viewport + 1, 'Status stays inside viewport');
  assert.deepEqual(geometry.clippedText, [], 'Status text is not clipped');
  if (withButton) {
    const button = target.getByRole('button');
    await button.scrollIntoViewIfNeeded();
    const box = await button.boundingBox();
    assert(box && box.width >= 44 && box.height >= 44, 'Retry is at least 44 × 44 CSS pixels');
    assert.equal(await button.evaluate(element => { const r = element.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return hit === element || element.contains(hit); }), true, 'Retry is reachable');
  }
  await page.evaluate(axe.source);
  const violations = await page.evaluate(async selector => (await window.axe.run(selector, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })).violations.filter(item => ['serious', 'critical'].includes(item.impact)).map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) })), selector);
  assert.deepEqual(violations, []);
  return { text, geometry, violations };
}

async function run(browser, engine, prefix, scenario, profile = profiles[1]) {
  const chainId = prefix ? 763373 : 57073;
  const context = await browser.newContext({ viewport: { width: profile.width, height: 900 }, hasTouch: profile.width < 500, reducedMotion: 'reduce' });
  const page = await context.newPage(), errors = [], requests = [], failedRequests = [];
  const row = { engine, chainId, scenario, ...profile, passed: false };
  let blockMode = 'pending', txMode = 'pending', malformed, release;
  const delayed = new Promise(resolve => release = resolve);
  const modes = () => ({ block: blockMode, transactions: txMode });
  const count = kind => requests.filter(item => item.kind === kind && item.normalizedId === String(height)).length;
  const reply = async (route, body) => { try { await route.fulfill(body); } catch { /* An intentionally aborted old navigation must not fail the fixture server. */ } };
  page.setDefaultTimeout(8000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => { if (/\/api\/explorer\/blocks\//.test(request.url())) failedRequests.push({ url: request.url(), error: request.failure()?.errorText }); });
  await page.clock.install({ time: new Date(timestamp) });
  await context.routeWebSocket(/\/api\/live$/, socket => socket.close());
  await context.route('**/api/**', async route => {
    const url = new URL(route.request().url()), local = url.pathname.replace(/^\/testnet/, '');
    if (local === '/api/live/config') return reply(route, { json: { url: base.replace(/^http/, 'ws') + prefix + '/api/live' } });
    if (local === '/api/live/snapshot') return reply(route, { json: { protocol: 'ink-observer.live.v1', type: 'snapshot', sequence: height + 100, sentAt: new Date().toISOString(), network: { chainId, expectedChainId: chainId, head: height + 100, online: true, synced: true, stale: false, safeBlock: height + 90, finalizedBlock: height + 80, derivation: { online: true, synced: true } }, transactions: [] } });
    const match = local.match(/^\/api\/explorer\/blocks\/([^/]+)(\/transactions)?$/);
    if (!match) return reply(route, { json: { items: [], next_page_params: null } });
    const [, id, suffix] = match, kind = suffix ? 'transactions' : 'block', mode = modes()[kind];
    const normalizedId = id === hash ? String(height) : id === otherHash ? String(otherHeight) : /^\d+$/.test(id) ? String(BigInt(id)) : id;
    requests.push({ path: url.pathname, id, normalizedId, kind, mode, accept: route.request().headers().accept || '' });
    if (normalizedId === String(otherHeight)) return reply(route, { json: kind === 'block' ? block(otherHeight) : { ...transactions, items: transactions.items.map(tx => ({ ...tx, block_number: otherHeight })) } });
    if (mode === 'delayed') { await delayed; return reply(route, { json: kind === 'block' ? block() : transactions }); }
    if (mode === 'error') return reply(route, { status: 502, json: { error: 'Controlled upstream 502' } });
    if (mode === 'malformed') return reply(route, { status: 202, json: malformed });
    if (mode === 'pending') return reply(route, { status: 202, headers: { 'retry-after': '3', 'cache-control': 'no-store' }, json: pending(chainId) });
    return reply(route, { json: kind === 'block' ? block() : transactions });
  });
  const open = async (id = height) => {
    await page.goto(`${base}${prefix}/block/${id}?lang=${profile.locale}`, { waitUntil: 'domcontentloaded' });
    await page.locator('main').waitFor();
  };
  const selectTransactions = async () => { await page.locator('.inline-section-navigation .tabs button').nth(1).click(); };
  const healthy = async (number = height) => {
    await page.locator('.inline-section-navigation .tabs button').first().click();
    await page.locator('.detail-layout .definitions').waitFor();
    const heading = await page.locator('.detail-header h1').innerText();
    assert(digits(heading).includes(String(number)), `Correct block title: ${heading}`);
    await selectTransactions();
    await page.locator(`.detail-feed .tx-row a[href*="/tx/${txHash}"]`).first().waitFor();
    assert.equal(await page.locator('.block-indexing,.block-resource-error').count(), 0);
  };
  const marker = async () => page.evaluate(() => window.blockIndexingDocument ||= crypto.randomUUID());
  const beforeIndexed = async () => {
    await notice(page, 'block').waitFor();
    assert.equal(await page.locator('.detail-layout,.detail-header .status-pill,.detail-feed .empty').count(), 0, 'Pending proof cannot become indexed metrics, finality, fees or an empty block');
    assert.equal(await page.locator('main .error-state').count(), 0, 'Proven indexing is not an upstream error');
  };
  const advance = async (ms = 3100) => { await page.clock.fastForward(ms); await page.waitForTimeout(100); };
  try {
    if (scenario === 'recovery' || scenario === 'leading-zero-route') {
      await open(scenario === 'leading-zero-route' ? '000' + height : height); await beforeIndexed();
      assert.equal(await page.locator('html').getAttribute('dir'), profile.locale === 'ar' ? 'rtl' : 'ltr');
      row.pending = await accessible(page, '.block-indexing[data-kind="block"]');
      await page.screenshot({ path: `${output}/${engine}-${chainId}-${scenario}-${profile.width}-pending.png` });
      const initialRequests = count('block');
      blockMode = 'ready';
      await advance();
      await page.locator('.detail-layout .definitions').waitFor();
      assert.equal(await page.locator('.detail-layout .definition').count() > 4, true, 'Real block metrics are available before selecting transactions');
      await selectTransactions();
      await notice(page, 'transactions').waitFor();
      assert(count('block') > initialRequests, 'A bounded automatic retry actually reaches the block API again');
      assert.equal(await page.locator('.detail-feed .empty,.detail-feed .tx-row').count(), 0, 'Pending transactions are not zero transactions');
      assert.equal(await page.locator('.detail-header h1').count(), 1, 'Block identity survives transaction indexing');
      row.transactionPending = await accessible(page, '.block-indexing[data-kind="transactions"]');
      const blockRequests = count('block');
      txMode = 'ready'; await advance(); await healthy();
      assert.equal(count('block'), blockRequests, 'Transaction retry does not discard/refetch indexed block');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      row.checks = ['proven 202 indexing', 'no invented metrics/finality/fees or empty block', 'automatic recovery', 'indexed block retained while transactions pending', 'transaction recovery', 'RTL/mobile layout', 'serious/critical Axe'];
      if (scenario === 'leading-zero-route') row.checks.push('numeric route with leading zeros accepts canonical block number');
    } else if (scenario === 'block-error' || scenario === 'transaction-error') {
      const kind = scenario === 'block-error' ? 'block' : 'transactions';
      blockMode = kind === 'block' ? 'error' : 'ready'; txMode = kind === 'transactions' ? 'error' : 'ready';
      await open(); if(kind === 'transactions')await selectTransactions(); const identity = await marker();
      await resourceError(page, kind).waitFor();
      assert.match(await resourceError(page, kind).innerText(), /Controlled upstream 502/);
      assert.equal(await page.locator('.block-indexing').count(), 0, '502 must not be relabelled as indexing');
      if (kind === 'transactions') assert.equal(await page.locator('.detail-header h1').count(), 1, 'A transaction outage retains the real block');
      const originalUrl = page.url();
      const initialRequests = count(kind); await advance(6500);
      assert.equal(count(kind), initialRequests, 'Real errors do not silently enter the indexing retry loop');
      blockMode = txMode = 'ready'; await resourceError(page, kind).getByRole('button').click(); await healthy();
      assert.equal(await marker(), identity, 'Retry stays in the same document');
      assert.equal(new URL(page.url()).pathname, new URL(originalUrl).pathname, 'Retry retains the current block route');
      row.checks = ['real 502 remains an error', 'no automatic indexing loop', 'local retry recovers', 'document and URL retained'];
    } else if (scenario === 'invalid-proofs') {
      row.rejected = [];
      for (const test of [
        { name: 'wrong-chain', kind: 'block', payload: pending(chainId === 57073 ? 763373 : 57073) },
        { name: 'wrong-number', kind: 'block', payload: pending(chainId, { block: { number: String(otherHeight), hash } }) },
        { name: 'invalid-hash', kind: 'block', payload: pending(chainId, { block: { number: String(height), hash: '0x12' } }) },
        { name: 'wrong-requested-hash', kind: 'block', id: hash, payload: pending(chainId, { block: { number: String(height), hash: otherHash } }) },
        { name: 'wrong-transaction-chain', kind: 'transactions', payload: pending(chainId === 57073 ? 763373 : 57073) },
        { name: 'wrong-transaction-block', kind: 'transactions', payload: pending(chainId, { block: { number: String(otherHeight), hash: otherHash } }) },
        { name: 'untyped-202', kind: 'block', payload: { block: { number: String(height), hash }, chainId } },
      ]) {
        malformed = test.payload; blockMode = test.kind === 'block' ? 'malformed' : 'ready'; txMode = test.kind === 'transactions' ? 'malformed' : 'ready';
        await open(test.id || height); if(test.kind === 'transactions')await selectTransactions(); await resourceError(page, test.kind).waitFor();
        assert.equal(await page.locator('.block-indexing').count(), 0, `${test.name}: malformed proof is never trusted`);
        const previous = requests.length; await advance(3500);
        assert.equal(requests.length, previous, `${test.name}: no retry loop for invalid proof`);
        if (test.kind === 'block') assert.equal(await page.locator('.detail-layout').count(), 0, 'Malformed proof supplies no block metrics');
        row.rejected.push(test.name);
      }
    } else if (scenario === 'navigation-cancellation') {
      const navigateOther = async () => { const input=await headerSearch(page); await input.fill(String(otherHeight)); await input.press('Enter'); await healthy(otherHeight); };
      await open(); await beforeIndexed();
      await navigateOther();
      const afterNavigation = requests.filter(item => item.id === String(height)).length;
      await advance(10000);
      assert.equal(requests.filter(item => item.id === String(height)).length, afterNavigation, 'Leaving a pending block cancels its retry timer');
      blockMode = txMode = 'delayed'; await open();
      await eventually(async () => assert(count('block') > 1), 'Old requests started');
      await navigateOther(); release(); await advance(6500); await healthy(otherHeight);
      assert.equal(await page.locator('.block-indexing,.block-resource-error').count(), 0, 'Late previous responses cannot overwrite current route');
      assert(failedRequests.length > 0, 'In-flight old block requests are aborted on navigation');
      row.checks = ['pending timer cancelled', 'in-flight fetch aborted', 'late responses cannot replace new block'];
    } else if (scenario === 'bounded-retry') {
      row.bounds = [];
      for (const kind of ['block', 'transactions']) {
        blockMode = kind === 'block' ? 'pending' : 'ready'; txMode = kind === 'transactions' ? 'pending' : 'ready';
        await open(); if(kind === 'transactions')await selectTransactions(); await notice(page, kind).waitFor(); const identity = await marker();
        const firstCount = count(kind); await advance(3100);
        await eventually(async () => assert(count(kind) > firstCount), 'Automatic retry before deadline');
        await advance(90000);
        await notice(page, kind, 'paused').waitFor();
        const stoppedCount = count(kind);
        assert(stoppedCount - firstCount <= 31, 'Retry attempts remain bounded');
        await advance(31000);
        assert.equal(count(kind), stoppedCount, 'No polling continues after the 90-second budget');
        row.bounds.push({ kind, requestCount: stoppedCount - firstCount, paused: await accessible(page, `.block-indexing[data-kind="${kind}"][data-state="paused"]`, true) });
        if (kind === 'transactions') assert.equal(await page.locator('.detail-header h1').count(), 1, 'Expiration retains indexed block identity');
        await page.screenshot({ path: `${output}/${engine}-${chainId}-${kind}-paused.png` });
        blockMode = txMode = 'ready'; await notice(page, kind, 'paused').getByRole('button').click(); await healthy();
        assert.equal(await marker(), identity, 'Manual retry after deadline remains local');
      }
      row.checks = ['automatic retry actually occurs', 'wall-clock duration bounded', 'no requests after deadline', 'manual retry resets budget and recovers', 'indexed block retained', '44px accessible retry'];
    }
    assert.deepEqual(errors, [], 'No browser runtime errors');
    assert(requests.every(item => item.path.startsWith(prefix + '/api/')), 'API requests stay on the selected chain');
    assert(requests.length > 0 && requests.every(item => item.accept.split(',').some(value => value.trim().split(';')[0] === 'application/vnd.ink.indexing+json')), 'Every block and transaction request explicitly opts into the indexing response contract');
    row.passed = true;
  } catch (error) {
    row.error = error.stack || error.message; row.url = page.url();
    row.visibleMain = await page.locator('main').innerText().catch(() => 'unavailable');
    await page.screenshot({ path: `${output}/${engine}-${chainId}-${scenario}-${profile.width}-failure.png`, fullPage: true }).catch(() => {});
    failures.push(row);
  } finally {
    row.requests = requests; row.browserErrors = errors; row.abortedRequests = failedRequests;
    release(); await context.close(); results.push(row); await save();
    console.log(`${row.passed ? 'PASS' : 'FAIL'} ${engine} ${chainId} ${scenario} ${profile.width}px ${profile.locale}${row.error ? ': ' + row.error.split('\n')[0] : ''}`);
  }
}

for (const engine of engines) {
  assert(['chromium', 'firefox', 'webkit'].includes(engine), 'Known browser engine');
  const browser = await ({ chromium, firefox, webkit }[engine]).launch({ ...(engine === 'chromium' ? { executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] } : {}), env: { ...process.env, ...(process.env.INK_BROWSER_LIBS ? { LD_LIBRARY_PATH: process.env.INK_BROWSER_LIBS } : {}) } });
  try {
    for (const prefix of ['', '/testnet']) {
      for (const profile of profiles) await run(browser, engine, prefix, 'recovery', profile);
      for (const scenario of ['leading-zero-route', 'block-error', 'transaction-error', 'invalid-proofs', 'navigation-cancellation', 'bounded-retry']) await run(browser, engine, prefix, scenario);
    }
  } finally { await browser.close(); }
}
complete = true; await save();
console.log(`Block indexing browser ${failures.length ? 'FAILED' : 'PASSED'}: ${results.filter(result => result.passed).length}/${results.length}. ${output}/results.json`);
if (failures.length) process.exitCode = 1;
