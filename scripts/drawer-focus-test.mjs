import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';

const base = process.env.BASE_URL || 'http://127.0.0.1:4188';
const browsers = [
  ['chromium', chromium, 12],
  ['webkit', webkit, 6],
];
const failures = [];

for (const [name, driver, rounds] of browsers) {
  const browser = await driver.launch(name === 'chromium'
    ? { executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }
    : {});
  try {
    for (let round = 0; round < rounds; round++) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
      const page = await context.newPage();
      try {
        await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
        const trigger = page.locator('.drawer-trigger');
        await trigger.waitFor({ state: 'visible' });

        // The brand link must close the drawer even when it points to the
        // current page; focus then belongs to the document it opened.
        await trigger.tap();
        const smallDrawerFields = await page.locator('.mobile-drawer select').evaluateAll(elements =>
          elements.filter(element => Number.parseFloat(getComputedStyle(element).fontSize) < 16 || element.getBoundingClientRect().height < 44)
            .map(element => element.getAttribute('aria-label')));
        assert.deepEqual(smallDrawerFields, [], 'Drawer controls must remain readable on touch screens');
        await page.locator('.mobile-drawer .brand').tap();
        await page.waitForFunction(() => !document.querySelector('.mobile-drawer') && document.activeElement?.id === 'main-content', null, { timeout: 5000 });

        // Explicit dismissal restores the menu trigger.
        await trigger.focus();
        await page.keyboard.press('Enter');
        await page.locator('.mobile-drawer').waitFor();
        const category = page.locator('.drawer-category').nth(round % 3);
        await category.focus();
        await page.keyboard.press('Enter');
        const back = page.locator('.drawer-back');
        await back.waitFor();
        assert(await back.evaluate(element => element === document.activeElement));
        await page.keyboard.press('Enter');
        await category.waitFor();
        assert(await category.evaluate(element => element === document.activeElement),
          'Returning to the category list must focus the category that opened the section');
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => document.activeElement?.matches('.drawer-trigger'), null, { timeout: 5000 });

        // Navigation must not let the drawer cleanup steal focus back.
        await trigger.tap();
        await page.locator('.drawer-category').first().tap();
        await page.locator('.mobile-drawer a[href="/blocks"]').tap();
        await page.waitForURL('**/blocks');
        await page.waitForFunction(() => !document.querySelector('.mobile-drawer') && document.activeElement?.id === 'main-content', null, { timeout: 5000 });
      } catch (error) {
        const state = await page.evaluate(() => ({
          path: location.pathname,
          drawerOpen: !!document.querySelector('.mobile-drawer'),
          focused: document.activeElement?.outerHTML.slice(0, 160),
        }));
        failures.push({ browser: name, round, message: error.message, state });
      } finally {
        await context.close();
      }
    }
    console.log(`${name}: ${rounds} drawer focus journeys completed`);
  } finally {
    await browser.close();
  }
}

assert.deepEqual(failures, [], JSON.stringify(failures, null, 2));
console.log('Drawer focus and same-route brand navigation passed.');
