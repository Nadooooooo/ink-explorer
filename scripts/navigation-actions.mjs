// Drive the visible navigation controls; never force actions on closed fields.
export async function headerSearch(page) {
  const input = page.locator('header .global-search input');
  if (!await input.isVisible()) await page.locator('.mobile-search-trigger').click();
  await input.waitFor({ state: 'visible' });
  return input;
}
export async function chooseLanguage(page, locale) {
  const utility = page.locator('.utility-bar .language-picker select');
  if (await utility.isVisible()) await utility.selectOption(locale);
  else {
    await page.locator('.drawer-trigger').click();
    await page.locator('.drawer-preferences .language-picker select').selectOption(locale);
    await page.keyboard.press('Escape');
    await page.locator('.mobile-drawer').waitFor({ state: 'detached' });
  }
  // Locale chunks load asynchronously. Observe the completed selection before
  // another action, particularly a browser history traversal, can cancel it.
  await page.waitForFunction(locale => document.documentElement.lang === locale && (new URL(location.href).searchParams.get('lang') || 'en') === locale, locale);
}
export async function navigateBlocks(page) {
  if (await page.locator('.drawer-trigger').isVisible()) {
    await page.locator('.drawer-trigger').click();
    await page.locator('.drawer-category').first().click();
    await page.locator('.drawer-links a[href$="/blocks"]').click();
  } else {
    await page.locator('.desktop-navigation [data-group="chain"]').click();
    await page.locator('#nav-chain a[href$="/blocks"]').click();
  }
}
