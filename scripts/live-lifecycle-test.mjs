import assert from 'node:assert/strict';
import { chromium, firefox, webkit } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { WebSocketServer } from 'ws';

const base = process.env.BASE_URL || 'http://127.0.0.1:4298';
const output = process.env.LIFECYCLE_OUTPUT || `reports/quality-20261016/lifecycle/run-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const engines = (process.env.LIFECYCLE_BROWSERS || 'chromium,firefox,webkit').split(',');
const scenarios = ['configuration', 'socket', 'retry', 'poll', 'validation'];
const results = [], failures = [];
let complete = false;
await mkdir(output, { recursive: true });
const frame = (chainId, height) => ({ protocol: 'ink-observer.live.v1', type: 'block', sequence: height, sentAt: new Date().toISOString(), network: { chainId, expectedChainId: chainId, head: height, online: true, synced: true, stale: false, safeBlock: height - 2, finalizedBlock: height - 4, derivation: { online: true, synced: true } }, block: { height, hash: '0x' + height.toString(16).padStart(64, '0'), _live: true }, transactions: [] });
const readHead = page => page.locator('[data-live-head]').getAttribute('data-live-head').then(Number);
async function waitHead(page, height) { await page.waitForFunction(expected => Number(document.querySelector('[data-live-head]')?.getAttribute('data-live-head')) === expected, height); }
const transition = (page, name) => page.evaluate(type => dispatchEvent(new PageTransitionEvent(type, { persisted: true })), name);
async function save() { await writeFile(`${output}/results.json`, JSON.stringify({ base, recordedAt: new Date().toISOString(), engines, complete, physicalDeviceTest: false, controlledTransportIsNotBfcacheProof: true, results, failures, passed: complete && failures.length === 0 }, null, 2)); }

async function controlled(browser, engine, prefix, scenario) {
  const chainId = prefix ? 763373 : 57073, initialHead = 7000100, resumedHead = 7000200, obsoleteHead = 7999999;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  // Keep native WebSocket instances so a queued transport event can be delivered
  // after an old connection closes. No application internals are inspected.
  await context.addInitScript(() => {
    const NativeWebSocket = window.WebSocket;
    window.lifecycleSockets = [];
    window.WebSocket = class extends NativeWebSocket {
      constructor(...args) { super(...args); window.lifecycleSockets.push(this); }
    };
  });
  const page = await context.newPage(), errors = [], sockets = [], requests = { config: 0, snapshot: 0 };
  let phase = 'initial', configRelease, snapshotRelease;
  const configGate = new Promise(resolve => configRelease = resolve), snapshotGate = new Promise(resolve => snapshotRelease = resolve);
  const row = { engine, prefix, scenario, passed: false };
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  // Use native browser sockets against a local server. Playwright WebSocket
  // routing replaces the constructor and cannot establish native close state.
  const transport = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await new Promise(resolve => transport.once('listening', resolve));
  const wsUrl = `ws://127.0.0.1:${transport.address().port}${prefix}/api/live`;
  await context.route(`**${prefix}/api/live/config`, async route => {
    requests.config++;
    const oldRequest = requests.config === 1;
    if (oldRequest && ['configuration', 'poll'].includes(scenario)) await configGate;
    try { await route.fulfill({ json: { url: wsUrl } }); } catch { /* The page may abort its suspended request. */ }
  });
  await context.route(`**${prefix}/api/live/snapshot`, async route => {
    requests.snapshot++;
    const oldRequest = requests.snapshot === 1;
    if (oldRequest && ['poll', 'validation'].includes(scenario)) await snapshotGate;
    const height = oldRequest ? (scenario === 'poll' ? obsoleteHead : initialHead) : resumedHead;
    try { await route.fulfill({ json: frame(chainId, height) }); } catch { /* Aborted old snapshot is expected. */ }
  });
  transport.on('connection', socket => {
    const record = { socket, phase, clientClosed: false };
    sockets.push(record);
    socket.on('close', () => { record.clientClosed = true; });
    if (scenario !== 'validation' || phase !== 'initial') socket.send(JSON.stringify(frame(chainId, phase === 'initial' ? initialHead : resumedHead)));
  });
  try {
    await page.goto(`${base}${prefix}/developers`, { waitUntil: 'domcontentloaded' });
    await page.locator('h1').waitFor();
    await page.waitForFunction(() => document.querySelector('[data-live-head]'));
    const deadline = Date.now() + 10000;
    if (['socket', 'retry'].includes(scenario)) {
      await waitHead(page, initialHead);
      await page.waitForTimeout(1200);
      assert.ok(requests.config, 'Socket configuration started');
      assert.equal(requests.snapshot, 0, 'A verified socket welcome must avoid a duplicate HTTP snapshot');
    } else {
      while ((requests.config < 1 || requests.snapshot < 1) && Date.now() < deadline) await page.waitForTimeout(25);
      assert.ok(requests.config && requests.snapshot, 'HTTP fallback starts even when configuration or a valid socket frame is unavailable');
    }
    if (scenario === 'validation') {
      await page.waitForFunction(() => window.lifecycleSockets[0]?.readyState === WebSocket.OPEN);
      assert.equal(await page.locator('[data-live-transport]').getAttribute('data-live-transport'), 'offline', 'Open transport alone must not announce live data');
      assert.equal(await page.locator('[data-live-head]').getAttribute('data-live-head'), '', 'An open transport has no verified head');
      sockets[0].socket.send(JSON.stringify(frame(chainId === 57073 ? 763373 : 57073, obsoleteHead)));
      sockets[0].socket.send(JSON.stringify({...frame(chainId, obsoleteHead),network:{...frame(chainId, obsoleteHead).network,chainId:chainId===57073?763373:57073}}));
      sockets[0].socket.send('{invalid JSON');
      sockets[0].socket.send(JSON.stringify({ ...frame(chainId, obsoleteHead), protocol: 'untrusted-protocol' }));
      await page.waitForTimeout(150);
      assert.equal(await page.locator('[data-live-transport]').getAttribute('data-live-transport'), 'offline', 'Wrong-chain and malformed frames must not announce live data');
      assert.equal(await page.locator('[data-live-head]').getAttribute('data-live-head'), '', 'Rejected frames have no verified head');
      assert.notEqual(await readHead(page), obsoleteHead, 'Rejected frames must not update the visible chain head');
      sockets[0].socket.send(JSON.stringify(frame(chainId, initialHead)));
    }
    if (scenario !== 'poll') await waitHead(page, initialHead);
    if (['socket', 'retry'].includes(scenario)) {
      await page.waitForFunction(() => window.lifecycleSockets[0]?.readyState === WebSocket.OPEN);
      assert.equal(sockets.length, 1);
      if (scenario === 'retry') {
        sockets[0].socket.close(1000, 'controlled disconnect before suspension');
        await page.waitForFunction(() => window.lifecycleSockets[0]?.readyState === WebSocket.CLOSED);
      }
    }
    await transition(page, 'pagehide');
    phase = 'hidden';
    const hidden = { ...requests, sockets: sockets.length, head: await readHead(page) };
    // Longer than the normal HTTP poll and first retry delays: observe traffic,
    // not the application's timer variables.
    await page.waitForTimeout(4400);
    assert.deepEqual({ ...requests, sockets: sockets.length }, { config: hidden.config, snapshot: hidden.snapshot, sockets: hidden.sockets }, 'Suspended page must not poll or reconnect');
    assert.equal(await page.evaluate(() => window.lifecycleSockets.filter(socket => socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING).length), 0, 'Suspended native sockets must close');
    phase = 'resumed';
    await transition(page, 'pageshow');
    await transition(page, 'pageshow');
    await waitHead(page, resumedHead);
    // Resolve responses from the suspended generation only after the fresh data
    // arrived; stale responses and a queued old socket message must be ignored.
    configRelease(); snapshotRelease();
    if (hidden.sockets) await page.evaluate(data => window.lifecycleSockets[0].dispatchEvent(new MessageEvent('message', { data: JSON.stringify(data) })), frame(chainId, obsoleteHead));
    await page.waitForTimeout(1300);
    assert.equal(await readHead(page), resumedHead, 'Late old transport data must not overwrite resumed chain state');
    assert.equal(sockets.length, hidden.sockets + 1, 'Repeated pageshow must resume exactly one connection');
    assert.equal(requests.config, hidden.config + 1, 'Exactly one fresh configuration request on resume');
    assert.equal(await page.evaluate(() => window.lifecycleSockets.filter(socket => socket.readyState === WebSocket.OPEN).length), 1);
    assert.equal(await page.locator('[data-live-transport]').getAttribute('data-live-transport'), 'websocket');
    assert.deepEqual(errors, []);
    row.hidden = hidden;
    row.resumed = { ...requests, sockets: sockets.length, head: await readHead(page) };
    row.checks = ['pagehide closes transports', 'no hidden poll/retry/config traffic', 'double pageshow opens one connection', 'fresh chain frame displayed', 'old generation data rejected'];
    if (['socket','retry'].includes(scenario)) row.checks.push('verified socket welcome avoids a duplicate initial HTTP snapshot');
    if (scenario === 'validation') row.checks.push('open transport alone is not live', 'wrong-chain, malformed and wrong-protocol frames rejected');
    row.passed = true;
  } catch (error) { row.error = error.message; failures.push(row); }
  finally { configRelease(); snapshotRelease(); await context.close(); for (const socket of transport.clients) socket.terminate(); await new Promise(resolve => transport.close(resolve)); }
  results.push(row); await save(); console.log(`${row.passed ? 'PASS' : 'FAIL'} ${engine} ${prefix || 'mainnet'} ${scenario}${row.error ? ': ' + row.error : ''}`);
}

for (const engine of process.env.LIFECYCLE_RESTORE_ONLY==='1'?[]:engines) {
  const browser = await ({ chromium, firefox, webkit }[engine]).launch(engine === 'chromium' ? { executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] } : {});
  try { for (const prefix of ['', '/testnet']) for (const scenario of scenarios) await controlled(browser, engine, prefix, scenario); }
  finally { await browser.close(); }
}

// Actual document navigation, no request routes, WebSocket interception or
// replacement. The persisted pageshow flag and document identity are proof of
// BFCache restoration; merely reopening a socket is not.
if (engines.includes('chromium') && process.env.LIFECYCLE_BFCACHE !== '0') {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'], ignoreDefaultArgs: ['--disable-back-forward-cache'] });
  try { for (const prefix of ['', '/testnet']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }), page = await context.newPage();
    page.setDefaultTimeout(15000);
    const row = { engine: 'chromium', prefix, scenario: 'real-bfcache-navigation', mockedTransport: false, passed: false };
    const reasons = [], sockets = [];
    const session = await context.newCDPSession(page);
    await session.send('Page.enable');
    session.on('Page.backForwardCacheNotUsed', event => reasons.push(event));
    page.on('websocket', socket => sockets.push(socket));
    try {
      await page.goto(`${base}${prefix}/pools?sort=liquidity&min_liquidity=10000&q=USDC`, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => document.querySelector('[data-live-transport]')?.getAttribute('data-live-transport') === 'websocket');
      const draft = 'retained search draft';
      assert.equal(await page.locator('.pool-search input').inputValue(), 'USDC');
      const filterValues = await page.locator('.pool-workbench select').evaluateAll(elements => elements.map(element => element.value));
      row.assets = await page.locator('script[src]').evaluateAll(elements => elements.map(element => element.getAttribute('src')));
      const marker = await page.evaluate(() => {
        window.lifecycleDocument = crypto.randomUUID(); window.lifecycleRestorations = [];
        addEventListener('pageshow', event => window.lifecycleRestorations.push({ persisted: event.persisted, time: performance.now() }));
        return window.lifecycleDocument;
      });
      const before = { head: await readHead(page), sockets: sockets.length };
      await page.goto(`${base}${prefix}/robots.txt`, { waitUntil: 'load' });
      await page.goBack({ waitUntil: 'commit' });
      await page.waitForFunction(() => document.querySelector('[data-live-transport]')?.getAttribute('data-live-transport') === 'websocket');
      const restored = await page.evaluate(() => ({ marker: window.lifecycleDocument, events: window.lifecycleRestorations || [], navigationType: performance.getEntriesByType('navigation')[0]?.type }));
      row.before = before; row.restored = restored; row.notRestoredReasons = reasons;
      assert.equal(restored.marker, marker, 'A real BFCache return preserves the original document');
      assert.ok(restored.events.some(event => event.persisted), 'Browser must report persisted pageshow');
      assert.equal(sockets.length, before.sockets + 1, 'Restored document reconnects its live socket once');
      assert.ok(await readHead(page) >= before.head, 'Live chain data resumes after actual document return');
      assert.equal(await page.locator('.pool-search input').inputValue(), 'USDC', 'Pool text filter survives actual BFCache return');
      assert.deepEqual(await page.locator('.pool-workbench select').evaluateAll(elements => elements.map(element => element.value)), filterValues, 'Pool select filters survive actual BFCache return');
      await page.locator('.restored-page-notice').waitFor({ state: 'visible' });
      assert.equal(await page.locator('.restored-page-notice').getAttribute('role'), 'status');
      // Browser history can emit popstate at the same URL after pageshow.
      await page.evaluate(() => dispatchEvent(new PopStateEvent('popstate')));
      await page.waitForTimeout(150);
      assert.equal(await page.locator('.restored-page-notice').count(), 1, 'Notice remains after same-page popstate and fresh live data');
      await page.screenshot({ path: `${output}/${prefix ? 'testnet' : 'mainnet'}-restored-notice.png` });
      row.notice = await page.locator('.restored-page-notice').innerText();
      row.filters = filterValues;
      await page.locator('[data-group="tokens"]').click();
      await page.locator(`#nav-tokens a[href="${prefix}/tokens"]`).first().click();
      // Restored documents do not emit a second load event. Observe the URL
      // commit for same-document navigation rather than waiting for that event.
      await page.waitForURL(`${base}${prefix}/tokens`, { waitUntil: 'commit' });
      assert.equal(await page.locator('.restored-page-notice').count(), 0, 'Opening another explorer page clears the old-page notice');
      await page.locator('.global-search input').first().fill(draft);
      await page.goto(`${base}${prefix}/robots.txt`, { waitUntil: 'load' });
      await page.goBack({ waitUntil: 'commit' });
      await page.locator('.restored-page-notice').waitFor({ state: 'visible' });
      assert.equal(await page.evaluate(() => window.lifecycleDocument), marker, 'Second return also restores the retained document');
      assert.equal(await page.locator('.global-search input').first().inputValue(), draft, 'Unsubmitted form draft survives actual BFCache return');
      await Promise.all([page.waitForEvent('load'), page.locator('.restored-page-notice .notice-refresh').click()]);
      await page.waitForFunction(() => document.querySelector('[data-live-transport]')?.getAttribute('data-live-transport') === 'websocket');
      assert.notEqual(await page.evaluate(() => window.lifecycleDocument), marker, 'Refresh action actually reloads the document');
      assert.equal(await page.locator('.restored-page-notice').count(), 0, 'Fresh document has no restored-data warning');
      row.checks = ['real persisted pageshow', 'original document preserved', 'one live reconnect', 'form draft and pool filters retained', 'notice persists when live transport resumes', 'same URL popstate retains notice', 'other-page navigation dismisses notice', 'refresh action reloads document and clears notice'];
      row.passed = true;
    } catch (error) { row.error = error.message; row.url = page.url(); row.notRestoredReasons = reasons; failures.push(row); }
    finally { await context.close(); }
    results.push(row); await save(); console.log(`${row.passed ? 'PASS' : 'FAIL'} chromium ${prefix || 'mainnet'} real-bfcache-navigation${row.error ? ': ' + row.error : ''}`);
  } } finally { await browser.close(); }
}
complete = true;
await save();
console.log(`Lifecycle ${failures.length ? 'FAILED' : 'PASSED'}: ${results.filter(result => result.passed).length}/${results.length}. Report: ${output}/results.json`);
if (failures.length) process.exitCode = 1;
