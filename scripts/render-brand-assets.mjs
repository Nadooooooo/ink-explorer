import { writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const brand = new URL('../public/brand/block-lens/', import.meta.url);
const source = new URL('./brand/', import.meta.url);
const browser = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] });

// ICO directory entries point at independent PNGs so each tab size uses its own rasterization.
function faviconBundle(frames) {
  const directory = Buffer.alloc(6 + 16 * frames.length);
  directory.writeUInt16LE(1, 2);
  directory.writeUInt16LE(frames.length, 4);
  let offset = directory.length;
  for (const [index, { size, bytes }] of frames.entries()) {
    const entry = 6 + 16 * index;
    directory[entry] = directory[entry + 1] = size;
    directory.writeUInt16LE(1, entry + 4);
    directory.writeUInt16LE(32, entry + 6);
    directory.writeUInt32LE(bytes.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += bytes.length;
  }
  return Buffer.concat([directory, ...frames.map(frame => frame.bytes)]);
}

try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, colorScheme: 'light' });
  await page.goto(new URL('share.html', source).href);
  await page.evaluate(() => Promise.all([...document.images].map(image => image.decode())));
  await writeFile(new URL('share.png', brand), await page.screenshot());

  async function rasterize(file, size) {
    await page.setViewportSize({ width: size, height: size });
    await page.goto(file.href);
    await page.locator('svg').first().evaluate((svg, size) => {
      svg.setAttribute('width', String(size));
      svg.setAttribute('height', String(size));
    }, size);
    return page.screenshot({ omitBackground: true });
  }

  for (const [size, name] of [[180, 'apple-touch-icon.png'], [192, 'icon-192.png'], [512, 'icon-512.png']]) {
    await writeFile(new URL(name, brand), await rasterize(new URL('app-icon.svg', source), size));
  }
  const frames = [];
  for (const size of [16, 32, 48]) {
    frames.push({ size, bytes: await rasterize(new URL('symbol.svg', brand), size) });
  }
  await writeFile(new URL('../../favicon.ico', brand), faviconBundle(frames));
} finally {
  await browser.close();
}
