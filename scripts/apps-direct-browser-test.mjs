import assert from 'node:assert/strict';
import {mkdir, realpath, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium, firefox, webkit} from 'playwright-core';
import {createServer} from 'vite';
import catalogue from '../src/ink-ecosystem.json' with {type: 'json'};

const root = fileURLToPath(new URL('../', import.meta.url));
const out = path.resolve(process.env.APPS_DIRECT_OUTPUT || 'reports/apps-direct');
await mkdir(out, {recursive: true});
const server = process.env.BASE_URL ? null : await createServer({
  root,
  configFile: path.join(root, 'vite.config.ts'),
  cacheDir: path.join(out, '.vite'),
  server: {
    host: '127.0.0.1',
    port: 0,
    fs: {allow: [root, out, await realpath(path.join(root, 'node_modules'))]},
  },
});
if (server) await server.listen();
const base = process.env.BASE_URL || `http://127.0.0.1:${server.httpServer.address().port}`;
const results = [];
const widths = [320, 390, 768, 1280, 1440];
const cachedAt = '2026-11-01T00:00:00.000Z';
const cookbook = {
  id: 'cookbook', title: 'Cookbook', description: 'Complete Cookbook documentation.',
  categories: ['Tools'], url: 'https://cookbook.example.invalid/',
  author: 'Cookbook author', rating: 4.5, ratingsTotalCount: 1234,
};
const mockLogo = '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" fill="#7939e9"/></svg>';
const logoRequest = /^https:\/\/(?:inkonchain\.com\/featured-apps\/icons\/|cdn\.sanity\.io\/images\/)/;
const waitForCards = (page, count) => page.waitForFunction(
  count => document.querySelectorAll('.ecosystem-card').length === count,
  count,
);

async function reloadDuringInput(page, search, committed, key) {
  await search.evaluate((input, previous) => {
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    document.addEventListener('input', event => {
      if (event.target !== input || document.activeElement !== input
        || new URL(location.href).searchParams.get('q') !== previous) {
        throw Error('Immediate reload must start while the focused edit is still pending');
      }
      location.reload();
    }, {once: true});
  }, committed);
  await Promise.all([page.waitForNavigation({waitUntil: 'domcontentloaded'}), search.press(key)]);
}

async function runNetwork(browser, engine, prefix) {
  const context = await browser.newContext({viewport: {width: 390, height: 900}, locale: 'en'});
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [], requests = [];
  const row = {engine, prefix, passed: false};
  const listPath = prefix + '/apps';
  const legacyPath = listPath + '/cookbook';
  const expected = catalogue
    .filter(app => !prefix || app.network === 'Both')
    .sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER));
  const count = prefix ? 12 : 67;
  const cards = page.locator('.ecosystem-card');
  const heading = page.locator('.explorer-page h1');
  const search = page.locator('.explorer-search input');
  const category = page.locator('.explorer-search select');
  const officialLink = page.getByRole('link', {name: 'Official Ink directory', exact: true});
  let mode = 'fresh', blocked = 0, sequence = 0, brokenLogo;
  const held = Promise.withResolvers();
  const heldResponse = Promise.withResolvers();

  page.on('pageerror', error => errors.push(error.message));
  // Apps has its own deferred module and should never request ExplorerPages.
  await context.route(/(?:\/src\/ExplorerPages\.tsx|\/assets\/module-ExplorerPages-[^/]+\.js)(?:\?|$)/, route => {
    blocked++;
    return route.fulfill({status: 404, contentType: 'text/plain', body: 'Unexpected ExplorerPages request'});
  });
  await context.route(logoRequest, route => route.request().url() === brokenLogo
    ? route.abort()
    : route.fulfill({contentType: 'image/svg+xml', body: mockLogo}));

  const frame = () => ({
    type: 'snapshot',
    protocol: 'ink-observer.live.v1',
    sequence: ++sequence,
    network: {
      chainId: prefix ? 763373 : 57073,
      expectedChainId: prefix ? 763373 : 57073,
      head: 90000000,
      online: true, synced: true, stale: false,
      sampledAt: new Date().toISOString(),
    },
    blocks: [],
    transactions: [],
  });
  await context.routeWebSocket(/\/api\/live$/, socket => socket.send(JSON.stringify(frame())));
  await context.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const resource = url.pathname.replace(/^\/testnet/, '');
    const current = mode;
    const reply = (value, status = 200) => route.fulfill({
      status,
      headers: {
        date: new Date().toUTCString(),
        'x-ink-data-status': current === 'stale' ? 'stale' : 'fresh',
        'x-ink-data-fetched-at': current === 'stale' ? cachedAt : new Date().toISOString(),
      },
      json: value,
    });
    if (resource === '/api/live/config') return reply({url: base.replace(/^http/, 'ws') + prefix + '/api/live'});
    if (resource === '/api/live/snapshot') return reply(frame());
    if (resource !== '/api/dapps') return reply({items: [], counters: []});
    requests.push(url.pathname + url.search);
    if (current === 'error') return reply({error: 'Controlled Dapps outage'}, 500);
    if (current === 'held') {
      await held.promise;
      try {
        await reply([cookbook]);
      } catch {
        // Leaving the detail page can abort its already-started request.
      } finally {
        heldResponse.resolve();
      }
      return;
    }
    return reply([cookbook]);
  });

  const goto = pathname => page.goto(base + pathname + '?lang=en', {waitUntil: 'domcontentloaded'});
  const card = name => cards.filter({has: page.getByRole('heading', {name, exact: true})});
  const back = async () => {
    await page.getByRole('link', {name: 'All applications', exact: true}).click();
    await waitForCards(page, count);
    assert.equal(new URL(page.url()).pathname, listPath);
  };

  try {
    await goto(listPath);
    await search.waitFor();
    await waitForCards(page, count);
    assert.equal(await heading.innerText(), 'Ink ecosystem');
    assert.equal(await officialLink.getAttribute('href'), 'https://inkonchain.com/apps');
    assert.equal(expected.length, count);
    assert.deepEqual(await cards.evaluateAll(elements => elements.map(element => ({
      name: element.querySelector('h2').textContent.trim(),
      categories: element.querySelector('.ecosystem-categories').textContent,
      description: element.querySelector('p[lang="en"]').textContent,
      logo: element.querySelector('.ecosystem-logo img').src,
      website: element.querySelector('.ecosystem-card-actions a').href,
    }))), expected.map(app => ({
      name: app.name,
      categories: app.category.join(' · '),
      description: app.description,
      logo: app.imageUrl,
      website: new URL(prefix ? app.links.testnetWebsite : app.links.mainnetWebsite).href,
    })));
    assert.equal(await cards.locator('.ecosystem-points').count(), prefix ? 0 : 2);
    const detailPaths = await cards.locator('h2 a').evaluateAll(links => links.map(link => link.pathname));
    assert.equal(new Set(detailPaths).size, count);
    assert(detailPaths.every(pathname => pathname.startsWith(listPath + '/ecosystem-')));
    for (const width of widths) {
      await page.setViewportSize({width, height: 900});
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `Horizontal overflow at ${width}px`);
      assert(await search.isVisible(), `Search must remain usable at ${width}px`);
      const columns = await page.locator('.ecosystem-grid').evaluate(grid => getComputedStyle(grid).gridTemplateColumns.split(' ').length);
      if (width <= 390) assert.equal(columns, 1);
      if (width >= 1280) assert(columns >= 3);
    }
    await page.setViewportSize({width: 390, height: 900});

    const explorerApps = expected.filter(app => app.category.includes('Explorers'));
    await category.selectOption('Explorers');
    await waitForCards(page, explorerApps.length);
    assert.deepEqual(await cards.locator('h2').allTextContents().then(values => values.map(value => value.trim())),
      explorerApps.map(app => app.name));
    await search.fill('  bLOcKsCoUt  ');
    await waitForCards(page, 1);
    const blockscout = card('Blockscout');
    const openBlockscout = blockscout.getByRole('link', {name: 'Blockscout', exact: true});
    const blockscoutPath = listPath + '/ecosystem-blockscout';
    assert.equal(await openBlockscout.getAttribute('href'), blockscoutPath);
    assert.equal(await blockscout.getByRole('link', {name: 'Open app · Blockscout', exact: true}).getAttribute('href'),
      prefix ? 'https://explorer-sepolia.inkonchain.com/' : 'https://explorer.inkonchain.com/');
    const logo = blockscout.locator('img');
    await logo.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelector('.ecosystem-card img')?.naturalWidth === 48);
    assert.equal(await logo.getAttribute('referrerpolicy'), 'no-referrer');
    await search.fill('No catalogue result fixture');
    await page.waitForFunction(() => document.querySelector('.explorer-page [role="status"].sr-only')?.textContent === 'No records found');
    assert.equal(await cards.count(), 0);
    await search.fill('');
    await search.pressSequentially('a'.repeat(125));
    await search.fill('Blockscout');
    await waitForCards(page, 1);
    await page.waitForFunction(() => new URL(location.href).searchParams.get('q') === 'Blockscout');
    await openBlockscout.click();
    await heading.getByText('Blockscout', {exact: true}).waitFor();
    assert.equal(new URL(page.url()).pathname, blockscoutPath);
    await page.waitForFunction(() => document.title.startsWith('Blockscout · Ink ecosystem'));
    const appLinks = page.locator('.ecosystem-link-list');
    for (const [label, href] of [
      ['Open app', prefix ? 'https://explorer-sepolia.inkonchain.com/' : 'https://explorer.inkonchain.com/'],
      ['X', 'https://x.com/blockscout'],
      ['Discord', 'https://discord.gg/ApbA39BKyJ'],
      ['Telegram', 'https://t.me/blockscoutcommunity'],
    ]) {
      const link = appLinks.getByRole('link', {name: label, exact: true});
      assert.equal(await link.getAttribute('href'), href);
      assert.equal(await link.getAttribute('target'), '_blank');
      assert.match(await link.getAttribute('rel'), /\bnoreferrer\b/);
    }
    assert.equal(new URL(page.url()).searchParams.has('category'), false);
    assert.equal(new URL(page.url()).searchParams.has('q'), false);
    await page.goBack();
    await waitForCards(page, 1);
    assert.equal(await search.inputValue(), 'Blockscout');
    assert.equal(await category.inputValue(), 'Explorers');
    assert.equal(new URL(page.url()).searchParams.get('lang'), 'en');
    await page.reload({waitUntil: 'domcontentloaded'});
    await waitForCards(page, 1);
    assert.equal(await search.inputValue(), 'Blockscout');
    assert.equal(await category.inputValue(), 'Explorers');
    await page.goForward();
    await heading.getByText('Blockscout', {exact: true}).waitFor();
    await back();
    assert.equal(await search.inputValue(), '');
    assert.equal(await category.inputValue(), '');

    // Reload in the same input event as the final real keystroke. There is no
    // blur or timer opportunity to publish the new value before navigation.
    await search.fill('Concer');
    await page.waitForFunction(() => new URL(location.href).searchParams.get('q') === 'Concer');
    await reloadDuringInput(page, search, 'Concer', 'o');
    await page.locator('#ink-startup').waitFor({state: 'detached'});
    await waitForCards(page, 1);
    assert.equal(await search.inputValue(), 'Concero', 'Reload must keep the final pending keystroke');
    assert.equal(new URL(page.url()).searchParams.get('q'), 'Concero');
    assert.equal(await cards.locator('h2').innerText(), 'Concero');
    assert.equal(await page.evaluate(() => sessionStorage.getItem('ink-explorer-catalogue-reload')), null);

    // A saved edit belongs to its history entry. A separate visit to the same
    // URL may reload before its first copy of the catalogue JavaScript runs.
    const entryUrl = base + listPath + '?lang=en&q=Concer';
    const awayUrl = base + '/catalogue-entry-test-away';
    const inertOnce = url => page.route(address => address.href === url,
      route => route.fulfill({ contentType: 'text/html', body: '<p id="scripts-pending">Waiting for scripts</p>' }), {times: 1});
    await page.goto(entryUrl, { waitUntil: 'domcontentloaded' });
    await page.locator('#ink-startup').waitFor({state: 'detached'});
    await search.waitFor();
    await page.evaluate(() => history.replaceState({callerData: 'keep this'}, ''));
    await inertOnce(entryUrl);
    await reloadDuringInput(page, search, 'Concer', 'o');
    await page.locator('#scripts-pending').waitFor();
    const draftKey = 'ink-explorer-catalogue-reload';
    const originalDraft = await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)), draftKey);
    assert.equal(originalDraft?.q, 'Concero');
    assert.equal(await page.evaluate(() => history.state?.callerData), 'keep this');
    await inertOnce(awayUrl);
    await page.goto(awayUrl, { waitUntil: 'domcontentloaded' });
    await page.locator('#scripts-pending').waitFor();
    // The inert document creates a fresh browser history entry for the exact
    // URL, without an intervening app mount that could consume the tab draft.
    await page.evaluate(url => history.pushState({}, '', url), entryUrl);
    assert.equal(page.url(), entryUrl);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('#ink-startup').waitFor({state: 'detached'});
    await search.waitFor();
    assert.equal(await search.inputValue(), 'Concer', 'A new history entry cannot consume another entry’s draft');
    assert.equal(new URL(page.url()).searchParams.get('q'), 'Concer');
    assert.equal(await page.evaluate(key => sessionStorage.getItem(key), draftKey), null);

    await search.fill('Conc');
    await page.waitForFunction(() => new URL(location.href).searchParams.get('q') === 'Conc');
    await page.evaluate(([key, saved]) => {
      sessionStorage.setItem(key, JSON.stringify({...saved, href: location.href,
        entry: history.state.inkExplorerCatalogueEntry, savedAt: Date.now() - 24 * 60 * 60_000}));
    }, [draftKey, originalDraft]);
    await page.reload({waitUntil: 'domcontentloaded'});
    await page.locator('#ink-startup').waitFor({state: 'detached'});
    await search.waitFor();
    assert.equal(new URL(page.url()).searchParams.get('q'), 'Conc', 'An expired draft cannot overwrite the URL');
    assert.equal(await search.inputValue(), 'Conc');
    assert.equal(await page.evaluate(key => sessionStorage.getItem(key), draftKey), null);

    brokenLogo = 'https://inkonchain.com/featured-apps/icons/concero.webp';
    await goto(listPath + '/ecosystem-concero');
    await heading.getByText('Concero', {exact: true}).waitFor();
    const fallback = page.locator('.ecosystem-detail .ecosystem-logo');
    await fallback.getByText('C', {exact: true}).waitFor();
    assert.equal(await fallback.getAttribute('aria-hidden'), 'true');
    assert.equal(await appLinks.getByRole('link', {name: 'Open app', exact: true}).getAttribute('href'),
      prefix ? 'https://testnet.concero.io/' : 'https://concero.io/');
    await back();
    if (prefix) {
      await goto(listPath + '/ecosystem-nado');
      await page.getByRole('heading', {name: 'Page not found', exact: true}).waitFor();
    } else {
      const relay = card('Relay').getByRole('link', {name: 'Relay', exact: true});
      assert.equal(await relay.getAttribute('href'), listPath + '/ecosystem-reservoir-relay');
      await relay.click();
      await heading.getByText('Relay', {exact: true}).waitFor();
      assert.equal(await appLinks.getByRole('link', {name: 'Open app', exact: true}).getAttribute('href'),
        'https://relay.link/bridge/ink?includeChainIds=57073');
      await back();
    }
    assert.deepEqual(requests, [], 'Official routes render without the Blockscout marketplace API');

    mode = 'error';
    await goto(legacyPath);
    const error = page.locator('.explorer-page .error-state[role="alert"]');
    await error.getByText('Controlled Dapps outage', {exact: true}).waitFor();
    assert.deepEqual(requests, [prefix + '/api/dapps'], 'The direct legacy detail uses one full request');
    mode = 'stale';
    await error.getByRole('button', {name: 'Retry', exact: true}).click();
    const legacy = page.locator('.explorer-page article');
    await legacy.getByText(cookbook.description, {exact: true}).waitFor();
    assert.equal(await legacy.locator('dl').innerText(), 'Author\nCookbook author\nRating\n4.5/5 (1,234)');
    assert.equal(await legacy.getByRole('link', {name: 'Open app', exact: false}).getAttribute('href'), cookbook.url);
    const notice = page.locator('.page-data-notice[data-notice-kind="cached"]');
    await notice.waitFor();
    assert.equal(await notice.locator('time').first().getAttribute('datetime'), cachedAt);
    await back();
    await notice.waitFor({state: 'detached'});

    mode = 'held';
    await Promise.all([page.waitForRequest(base + prefix + '/api/dapps'), goto(legacyPath)]);
    await page.locator('.explorer-page .loading').waitFor();
    await page.locator('.drawer-trigger').click();
    await page.locator('#mobile-navigation').getByRole('link', {name: 'Dapps', exact: true}).click();
    await waitForCards(page, count);
    held.resolve();
    await heldResponse.promise;
    assert.equal(new URL(page.url()).pathname, listPath);
    assert.equal(await legacy.getByText(cookbook.description, {exact: true}).count(), 0);
    await page.goto(base + listPath + '?lang=bn', {waitUntil: 'domcontentloaded'});
    await page.locator('#ink-startup').waitFor({state: 'detached'});
    await search.fill('বর');
    await waitForCards(page, 0);
    await search.fill('ব্রিজ');
    await waitForCards(page, expected.filter(app => app.category.includes('Bridge')).length);
    assert.equal(blocked, 0);
    assert.deepEqual(errors, []);
    assert.deepEqual(requests, Array(3).fill(prefix + '/api/dapps'));
    Object.assign(row, {
      passed: true, count, widths, blocked, requests,
      checks: ['catalogue fields and network-specific links', 'interactive search and categories', 'pending edit survives immediate reload', 'draft entry identity and expiration',
        'successful and unavailable logos', 'official app detail, social links and return',
        'legacy full request, failure, retry, stale cache and cancellation', 'responsive widths'],
    });
  } catch (error) {
    Object.assign(row, {error: error.stack, errors, blocked, requests});
    await page.screenshot({path: path.join(out, `${engine}-${prefix ? 'sepolia' : 'mainnet'}-failure.png`)}).catch(() => {});
  } finally {
    held.resolve();
    await context.close();
  }
  return row;
}

try {
  for (const [engine, launcher] of Object.entries({chromium, firefox, webkit})) {
    const browser = await launcher.launch(engine === 'chromium' ? {args: ['--no-sandbox']} : {});
    try {
      for (const prefix of ['', '/testnet']) {
        const row = await runNetwork(browser, engine, prefix);
        results.push(row);
        console.log(JSON.stringify(row));
        await writeFile(path.join(out, 'results.json'), JSON.stringify({base, apiMocked: true, complete: false, results}, null, 2));
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  if (server) await server.close();
}
const passed = results.every(row => row.passed);
await writeFile(path.join(out, 'results.json'), JSON.stringify({base, apiMocked: true, complete: true, passed, results}, null, 2));
if (!passed) process.exitCode = 1;
