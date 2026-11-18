import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, next) {
  try { return next(specifier, context); }
  catch (error) { if (specifier.startsWith('./') && context.parentURL?.includes('/src/') && !/\.[a-z]+$/.test(specifier)) return next(specifier + '.ts', context); throw error; }
} });
const { handleRequest } = await import('../cloudflare/worker.mjs');
const { homeGuideCopy } = await import('../src/home-guide-copy.ts');
const template = await readFile('dist/index.html', 'utf8');
const manifest = JSON.parse(await readFile('dist/snapshots/manifest.json', 'utf8'));
const env = { PUBLIC_URL: 'https://inkexplorer.xyz', ASSETS: { async fetch(request) {
  const pathname = new URL(request.url).pathname;
  try { return new Response(await readFile('dist' + pathname)); }
  catch { return new Response('Missing', { status: 404 }); }
} } };

test('both networks and ten languages serve the real home in the first HTML without captured chain values', async () => {
  assert.equal(manifest.length, 20);
  for (const row of manifest) {
    assert.equal(row.chainObservations, 0);
    const prefix = row.network === 'sepolia' ? '/testnet' : '';
    const response = await handleRequest(new Request(`https://inkexplorer.xyz${prefix}/?lang=${row.language}`), env);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /class="home-overview/);
    assert.match(html, /class="home-guide"/);
    assert.match(html, /id="ink-startup" class="startup-embedded"/);
    const snippetTags = [...html.matchAll(/<([a-z][\w:-]*)\b[^>]*\sdata-nosnippet\b[^>]*>/g)].map(match => match[1]);
    assert(snippetTags.length > 0);
    assert(snippetTags.every(tag => ['div', 'span', 'section'].includes(tag)), 'Google snippet controls require supported HTML elements');
    assert.match(html, /<div class="startup-copy" data-nosnippet>/);
    assert(html.includes(homeGuideCopy[row.language][0]));
    assert(html.includes(homeGuideCopy[row.language][1].replace('{network}', prefix ? 'Ink Sepolia' : 'Ink Mainnet')));
    assert(html.includes(`action="${prefix}/search"`));
    assert.match(html, /name="q"/);
    assert(!html.includes('class="tx-row'));
    assert(!html.includes('class="block-row"'));
    assert(!html.includes('localhost'));
    assert(!html.includes('127.0.0.1'));
    assert.equal((html.match(/<h1[ >]/g) || []).length, 1); // Recovery status is not a second page title.
    const bot = await handleRequest(new Request(`https://inkexplorer.xyz${prefix}/?lang=${row.language}`, { headers: { 'user-agent': 'Googlebot' } }), env);
    assert.equal(await bot.text(), html, 'People and crawlers receive identical content');
  }
});

test('home snapshot absence preserves recovery; other routes never receive the home snapshot', async () => {
  const fallback = { ...env, ASSETS: { async fetch(request) { return new URL(request.url).pathname === '/index.html' ? new Response(template) : new Response('Missing', { status: 404 }); } } };
  const html = await (await handleRequest(new Request('https://inkexplorer.xyz/'), fallback)).text();
  assert(!html.includes('class="startup-embedded"'));
  assert.match(html, /<main id="ink-startup"/);
  for (const route of ['/blocks', '/testnet/tokens', '/nonexistent-route']) {
    const other = await (await handleRequest(new Request('https://inkexplorer.xyz' + route), env)).text();
    assert(!other.includes('class="home-guide"'));
    assert.match(other, route === '/nonexistent-route' ? /<main id="ink-startup"/ : /id="ink-startup" class="startup-embedded"/);
  }
});
