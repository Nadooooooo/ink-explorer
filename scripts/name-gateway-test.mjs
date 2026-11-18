import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import { publicApiPath, allowedPublicMethod, proxyPublicApi } from '../server/public-proxy.mjs';

registerHooks({ resolve(specifier, context, next) {
  try { return next(specifier, context); }
  catch (error) { if (specifier.startsWith('./') && context.parentURL?.includes('/src/') && !/\.[a-z]+$/.test(specifier)) return next(specifier + '.ts', context); throw error; }
} });
const { handleRequest } = await import('../cloudflare/worker.mjs');
const address = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
const queries = [
  ['domains:lookup', 'name=vitalik.eth&only_active=true&protocols=ens'],
  ['domains:lookup', 'name=alice%20bob.eth&only_active=true&protocols=ens&protocols=other'],
  ['addresses:lookup', `address=${address}&resolved_to=true&owned_by=true&protocols=ens`],
];
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)));
const close = server => new Promise(resolve => server.close(resolve));

test('both networks accept only the two known colon lookup routes', () => {
  for (const prefix of ['', '/testnet']) {
    for (const [route, query] of queries) {
      const path = `${prefix}/api/names/${route}?${query}`;
      assert.equal(publicApiPath(path), path);
      assert(allowedPublicMethod(path, 'GET'));
      assert(allowedPublicMethod(path, 'HEAD'));
      for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) assert.equal(allowedPublicMethod(path, method), false);
    }
    for (const suffix of ['domains:delete', 'addresses:lookup/extra', 'domains:lookup:extra', 'other:lookup', 'protocols:lookup', 'domains/vitalik.eth:lookup'])
      assert.throws(() => publicApiPath(`${prefix}/api/names/${suffix}`), suffix);
    assert.throws(() => publicApiPath(`${prefix}/api/other/domains:lookup`));
    for (const suffix of ['domains:lookup/../protocols', 'domains:lookup/%2e%2e/protocols', 'domains:lookup%2fextra', 'domains:lookup%5cextra', 'domains:lookup%00'])
      assert.throws(() => publicApiPath(`${prefix}/api/names/${suffix}`), suffix);
  }
  for (const path of ['https://evil.invalid/api/names/domains:lookup', '//evil.invalid/api/names/domains:lookup']) assert.throws(() => publicApiPath(path));
});

test('real HTTP gateway forwards lookup queries, empty results, errors and freshness', async () => {
  const calls = [];
  const fixture = createServer((req, res) => {
    calls.push(req.url);
    const url = new URL(req.url, 'http://fixture.invalid');
    const status = url.searchParams.get('name') === 'unavailable.eth' ? 503 : 200;
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-ink-data-status': 'fresh', 'x-ink-data-fetched-at': '2026-10-22T08:00:00.000Z' });
    res.end(JSON.stringify(status === 503 ? { error: 'unavailable' } : { items: [], next_page_params: null }));
  });
  const upstream = await listen(fixture);
  const gateway = createServer((req, res) => proxyPublicApi(req, res, { origin: upstream, path: req.url }));
  const origin = await listen(gateway);
  try {
    for (const prefix of ['', '/testnet']) for (const [route, query] of queries) {
      const path = `${prefix}/api/names/${route}?${query}`;
      const response = await fetch(origin + path);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { items: [], next_page_params: null });
      assert.equal(calls.at(-1), path);
      assert.equal(response.headers.get('x-ink-data-status'), 'fresh');
      assert.equal(response.headers.get('x-ink-data-fetched-at'), '2026-10-22T08:00:00.000Z');
      assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
      const head = await fetch(origin + path, { method: 'HEAD' });
      assert.equal(head.status, 200); assert.equal(await head.text(), '');
      const before = calls.length;
      assert.equal((await fetch(origin + path, { method: 'POST' })).status, 405);
      assert.equal(calls.length, before);
    }
    const response = await fetch(origin + '/api/names/domains:lookup?name=unavailable.eth');
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'unavailable' });
  } finally { await Promise.all([close(gateway), close(fixture)]); }
});

test('edge forwards exact lookup paths and filters browser credentials', async () => {
  const originalFetch = globalThis.fetch, calls = [];
  const env = { PUBLIC_URL: 'https://inkexplorer.xyz', API_ORIGIN: 'https://origin.example/ink-production', ORIGIN_TOKEN: 'fixture-only' };
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return Response.json({ items: [] }, { headers: { 'x-ink-data-status': 'fresh' } });
  };
  try {
    for (const prefix of ['', '/testnet']) for (const [route, query] of queries) {
      const path = `${prefix}/api/names/${route}?${query}`;
      const response = await handleRequest(new Request('https://inkexplorer.xyz' + path, { headers: { cookie: 'private=1', authorization: 'private', 'x-ink-origin-token': 'spoofed' } }), env);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { items: [] });
      assert.equal(calls.at(-1).url, env.API_ORIGIN + path);
      assert.equal(calls.at(-1).options.headers.get('x-ink-origin-token'), env.ORIGIN_TOKEN);
      assert.equal(calls.at(-1).options.headers.get('cookie'), null);
      assert.equal(calls.at(-1).options.headers.get('authorization'), null);
    }
    const before = calls.length;
    assert.equal((await handleRequest(new Request('https://inkexplorer.xyz/api/names/domains:delete'), env)).status, 400);
    assert.equal((await handleRequest(new Request('https://inkexplorer.xyz/api/names/domains:lookup?name=test.eth', { method: 'POST' }), env)).status, 405);
    assert.equal(calls.length, before);
  } finally { globalThis.fetch = originalFetch; }
});
