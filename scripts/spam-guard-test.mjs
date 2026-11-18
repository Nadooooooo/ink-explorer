import assert from 'node:assert/strict';
import { test } from 'node:test';
import { requestJson } from '../src/api-request.ts';

test('HTML quota errors suppress reads across endpoints until Retry-After expires', async () => {
  const originalFetch = globalThis.fetch, originalNow = Date.now;
  let now = originalNow(), calls = 0;
  Date.now = () => now;
  globalThis.fetch = async (_url, init) => {
    calls++;
    if (init.method === 'POST' || calls > 2) return Response.json({ ok: true });
    return new Response('quota exceeded', { status: 429, headers: { 'retry-after': '120' } });
  };
  try {
    await assert.rejects(requestJson('https://quota.example/api/live/snapshot'));
    await assert.rejects(requestJson('https://quota.example/api/explorer/stats'));
    assert.equal(calls, 1);
    const controller = new AbortController(); controller.abort(new DOMException('Navigation', 'AbortError'));
    await assert.rejects(requestJson('https://quota.example/api/live/snapshot', { signal: controller.signal }), e => e === controller.signal.reason);
    assert.deepEqual(await requestJson('https://quota.example/api/forms', { method: 'POST' }), { ok: true });
    now += 119000;
    await assert.rejects(requestJson('https://quota.example/api/live/snapshot'));
    assert.equal(calls, 2);
    now += 1001;
    assert.deepEqual(await requestJson('https://quota.example/api/live/snapshot'), { ok: true });
    assert.equal(calls, 3);
  } finally { globalThis.fetch = originalFetch; Date.now = originalNow; }
});

test('503 backoff is confined to the failed resource and accepts an HTTP-date', async () => {
  const originalFetch = globalThis.fetch, originalNow = Date.now;
  let now = Math.floor(originalNow() / 1000) * 1000, calls = 0;
  Date.now = () => now;
  globalThis.fetch = async url => {
    calls++;
    return String(url).endsWith('/failed') && calls === 1
      ? Response.json({ error: 'Index offline' }, { status: 503, headers: { 'retry-after': new Date(now + 60000).toUTCString() } })
      : Response.json({ ok: true });
  };
  try {
    await assert.rejects(requestJson('https://service.example/api/failed'), /Index offline/);
    await assert.rejects(requestJson('https://service.example/api/failed'));
    assert.deepEqual(await requestJson('https://service.example/api/healthy'), { ok: true });
    assert.equal(calls, 2);
    now += 60001;
    assert.deepEqual(await requestJson('https://service.example/api/failed'), { ok: true });
  } finally { globalThis.fetch = originalFetch; Date.now = originalNow; }
});
