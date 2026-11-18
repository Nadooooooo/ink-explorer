import assert from 'node:assert/strict';
import { chromium, firefox, webkit } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.BASE_URL || 'http://127.0.0.1:4298';
const output = process.env.NAVIGATION_OUTPUT || 'reports/navigation-links';
const engines = (process.env.NAVIGATION_BROWSERS || 'chromium,firefox,webkit').split(',');
const results = [];
await mkdir(output, { recursive: true });
for (const engine of engines) {
  const browser = await ({ chromium, firefox, webkit }[engine]).launch(engine === 'chromium' ? { executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] } : {});
  try {
    for (const prefix of ['', '/testnet']) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      const page = await context.newPage();
      await page.goto(`${base}${prefix}/?lang=fr`, { waitUntil: 'networkidle' });
      await page.locator('.block-height a[href]').first().waitFor();
      const links = await page.locator('a.explorer-link[href]').evaluateAll(elements => elements.map(element => ({ href: element.getAttribute('href'), text: element.textContent.trim() })));
      assert.ok(links.length > 20, 'Home exposes real navigation and entity links');
      for (const link of links) {
        const url = new URL(link.href, base);
        assert.equal(url.origin, new URL(base).origin);
        assert.equal(url.searchParams.get('lang'), 'fr', link.href);
        assert.equal(url.pathname.startsWith('/testnet/'), Boolean(prefix), link.href);
        assert.ok(!url.pathname.includes('/undefined'), link.href);
      }
      const chainMenu = page.locator('.desktop-navigation [data-group="chain"]');
      const openBlocksMenu = async () => {
        if (await chainMenu.getAttribute('aria-expanded') !== 'true') await chainMenu.click();
        const link = page.locator(`.desktop-navigation .nav-popover a[href="${prefix}/blocks?lang=fr"]`);
        await link.waitFor();
        return link;
      };
      // Tabbing out of an open group dismisses it. Escape then belongs to the
      // newly focused control, even when both controls are in the header.
      await openBlocksMenu();
      await page.locator('#nav-chain a').last().focus();
      await page.keyboard.press('Tab');
      const tokensMenu = page.locator('.desktop-navigation [data-group="tokens"]');
      await page.locator('#nav-chain').waitFor({ state: 'detached' });
      assert(await tokensMenu.evaluate(element => element === document.activeElement));
      await page.keyboard.press('Escape');
      assert(await tokensMenu.evaluate(element => element === document.activeElement));
      await page.keyboard.press('Enter');
      await page.locator('#nav-tokens a').first().focus();
      await page.keyboard.press('Escape');
      assert(await tokensMenu.evaluate(element => element === document.activeElement));
      const nav = await openBlocksMenu();
      assert.equal(await nav.getAttribute('href'), `${prefix}/blocks?lang=fr`);
      await page.evaluate(() => window.navigationMarker = 'same document');
      await nav.click();
      await page.waitForURL(`**${prefix}/blocks?lang=fr`);
      assert.equal(await page.evaluate(() => window.navigationMarker), 'same document');
      await page.waitForFunction(() => document.activeElement?.id === 'main-content');
      await page.goBack();
      await page.waitForURL(`**${prefix}/?lang=fr`);
      assert.equal(await page.evaluate(() => window.navigationMarker), 'same document');
      for (const input of [{ button: 'middle' }, { modifiers: ['Control'] }]) {
        const link = await openBlocksMenu();
        const [popup] = await Promise.all([context.waitForEvent('page', { timeout: 15000 }), link.click(input)]);
        await popup.waitForURL(`**${prefix}/blocks?lang=fr`);
        assert.equal(new URL(page.url()).pathname, `${prefix}/`);
        assert.equal(await page.evaluate(() => window.navigationMarker), 'same document');
        await popup.close();
      }
      const appsLink = page.locator(`.desktop-navigation a[href="${prefix}/apps?lang=fr"]`);
      await appsLink.click();
      await page.locator('.ecosystem-card h2 a').first().waitFor();
      assert.equal(await appsLink.getAttribute('aria-current'), 'page');
      await page.locator('.ecosystem-card h2 a').first().click();
      await page.locator('.ecosystem-detail').waitFor();
      assert.equal(await appsLink.getAttribute('aria-current'), 'location');
      const apiLink = page.locator(`.desktop-navigation a[href="${prefix}/developers?lang=fr"]`);
      await apiLink.click();
      await page.waitForURL(`**${prefix}/developers?lang=fr`);
      await page.locator('.desktop-navigation a[aria-current="page"]').waitFor();
      assert.equal(await apiLink.getAttribute('aria-current'), 'page');
      assert.equal(await appsLink.getAttribute('aria-current'), null);
      await page.setViewportSize({ width: 390, height: 844 });
      const mobileMenu = page.locator('.drawer-trigger');
      await mobileMenu.focus();
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.activeElement?.closest('.mobile-drawer') !== null);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.activeElement?.matches('.drawer-trigger'));
      await page.keyboard.press('Enter');
      await page.locator('.mobile-drawer .drawer-category').first().focus();
      await page.keyboard.press('Enter');
      const mobileBlocks = page.locator(`.mobile-drawer a[href="${prefix}/blocks?lang=fr"]`);
      await mobileBlocks.waitFor();
      await mobileBlocks.focus();
      // A later transition frame must not override the user's chosen link.
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      assert(await mobileBlocks.evaluate(element=>element===document.activeElement),'Drawer transition must preserve the user-selected link focus');
      await page.keyboard.press('Enter');
      await page.waitForURL(`**${prefix}/blocks?lang=fr`);
      assert.equal(await mobileMenu.getAttribute('aria-expanded'), 'false');
      await page.waitForFunction(() => document.activeElement?.id === 'main-content');
      const clickedBlock = await page.locator('.block-height a[href]').first().getAttribute('href');
      const blockResponses = [];
      page.on('response', response => {
        if (/\/api\/explorer\/blocks\/[^/]+(?:\/transactions)?(?:\?|$)/.test(response.url()))
          blockResponses.push({url: response.url(),status: response.status(),at: new Date().toISOString()});
      });
      await page.locator('.block-height a[href]').first().click();
      await page.waitForURL(`**${prefix}/block/*?lang=fr`);
      assert.equal(await page.evaluate(() => window.navigationMarker), 'same document');
      // A live block may precede the public index by tens of seconds. The page
      // must recover automatically within its bounded 90-second indexing wait;
      // keep clicking the newest block rather than bypassing the real journey.
      try { await page.locator('.definitions').waitFor({timeout:100_000}); }
      catch (error) {
        await page.screenshot({path:`${output}/${engine}-${prefix ? 'sepolia' : 'mainnet'}-failure.png`});
        await writeFile(`${output}/failure.json`,JSON.stringify({engine,prefix,clickedBlock,url:page.url(),blockResponses,error:String(error)},null,2));
        throw error;
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      await page.screenshot({ path: `${output}/${engine}-${prefix ? 'sepolia' : 'mainnet'}-detail.png` });
      results.push({ engine, network: prefix ? 'sepolia' : 'mainnet', links: links.length, clickedBlock, blockResponses, checks: ['real destinations', 'locale and network', 'desktop disclosure focus', 'current page and section', 'SPA click and history', 'middle-click tab', 'Ctrl-click tab', 'mobile keyboard focus', 'detail navigation'] });
      await context.close();
    }
  } finally { await browser.close(); }
}
await writeFile(`${output}/results.json`, JSON.stringify({ recordedAt: new Date().toISOString(), base, results, passed: true }, null, 2));
console.log(`Native navigation passed (${results.length} browser/network combinations).`);
