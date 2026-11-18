import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { recognizeBlockIndexing, validIndexedBlockResource, loadIndexedBlockResource, BLOCK_INDEXING_DEADLINE } from '../src/block-indexing.ts';
import { requestJson } from '../src/api-request.ts';

const hash = '0x' + 'a'.repeat(64), other = '0x' + 'b'.repeat(64);
const pending = (chainId = 57073) => ({ code: 'BLOCK_INDEXING', chainId, block: { number: '123', hash }, retryAfterMs: 3000 });
const ready = { height: 123, hash, transactions_count: 0 };
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const options = extra => ({ id: '123', chainId: 57073, kind: 'block', signal: new AbortController().signal, onIndexing() {}, ...extra });

test('indexing proof is strictly scoped to the requested number or hash and numeric chain ID', () => {
  for (const chainId of [57073, 763373]) {
    assert.deepEqual(recognizeBlockIndexing(pending(chainId), '123', chainId), pending(chainId));
    assert.deepEqual(recognizeBlockIndexing(pending(chainId), '000123', chainId), pending(chainId));
    assert.ok(recognizeBlockIndexing(pending(chainId), hash.toUpperCase().replace('0X', '0x'), chainId));
    assert.equal(recognizeBlockIndexing(pending(chainId), '124', chainId), undefined);
    assert.equal(recognizeBlockIndexing(pending(chainId), other, chainId), undefined);
    assert.equal(recognizeBlockIndexing(pending(chainId), '123', chainId === 57073 ? 763373 : 57073), undefined);
  }
  const large = { ...pending(), block: { number: '90071992547409931234', hash } };
  assert.ok(recognizeBlockIndexing(large, large.block.number, 57073));
  const invalid = [null, [], {}, { ...pending(), code: 'BLOCK_PENDING' }, { ...pending(), chainId: '57073' }, { ...pending(), retryAfterMs: 0 }, { ...pending(), retryAfterMs: '3000' },
    ...[null, {}, { number: 123, hash }, { number: '0123', hash }, { number: '-1', hash }, { number: '1e2', hash }, { number: '123', hash: '0x123' }].map(block => ({ ...pending(), block }))];
  for (const value of invalid) assert.equal(recognizeBlockIndexing(value, '123', 57073), undefined);
});

test('indexed data cannot be an indexing envelope or a wrong block; height requests tolerate canonical reorgs', () => {
  assert.equal(validIndexedBlockResource(ready, '123', 'block'), true);
  assert.equal(validIndexedBlockResource(ready, '000123', 'block'), true);
  assert.equal(validIndexedBlockResource({ ...ready, height: 0 }, '000', 'block'), true);
  assert.equal(validIndexedBlockResource({ ...ready, hash: other }, '123', 'block'), true);
  assert.equal(validIndexedBlockResource({ ...ready, hash: other }, hash, 'block'), false);
  assert.equal(validIndexedBlockResource({ ...ready, height: 124 }, '123', 'block'), false);
  assert.equal(validIndexedBlockResource(pending(), '123', 'block'), false);
  assert.equal(validIndexedBlockResource({ items: [], next_page_params: null }, '123', 'transactions'), true);
  assert.equal(validIndexedBlockResource(pending(), '123', 'transactions'), false);
  for (const value of [null, [], {}, { items: 'empty' }]) assert.equal(validIndexedBlockResource(value, '123', 'transactions'), false);
});

test('202 retries preserve real identity and finish only when indexed 200 data arrives', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  let calls = 0, notices = 0;
  const result = loadIndexedBlockResource(options({ onIndexing() { notices++; }, request: async () => ++calls === 1 ? { status: 202, value: pending() } : { status: 200, value: { ...ready, hash: other } } }));
  await flush(); assert.equal(calls, 1); assert.equal(notices, 1);
  t.mock.timers.tick(3000); await flush();
  assert.equal((await result).hash, other);
  assert.equal(calls, 2);
});

test('wrong status, wrong chain and malformed 202 fail honestly without automatic retries', async () => {
  for (const response of [{ status: 200, value: pending() }, { status: 201, value: ready }, { status: 202, value: pending(763373) }, { status: 202, value: { items: [] } }]) {
    let calls = 0, notices = 0;
    await assert.rejects(loadIndexedBlockResource(options({ onIndexing() { notices++; }, request: async () => { calls++; return response; } })), /invalidApiResponse/);
    assert.equal(calls, 1); assert.equal(notices, 0);
  }
  let calls = 0;
  await assert.rejects(loadIndexedBlockResource(options({ request: async () => { calls++; throw new Error('Index unavailable'); } })), /Index unavailable/);
  assert.equal(calls, 1);
});

test('the elapsed deadline expires a suspended retry and aborts an in-flight request', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  let calls = 0, requestSignal;
  const result = loadIndexedBlockResource(options({ request: async signal => {
    calls++; requestSignal = signal;
    if (calls === 1) return { status: 202, value: pending() };
    return new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  } }));
  const rejected = assert.rejects(result, /blockIndexingExpired/);
  await flush(); t.mock.timers.tick(3000); await flush();
  assert.equal(calls, 2);
  t.mock.timers.tick(BLOCK_INDEXING_DEADLINE + 5000); await rejected;
  assert.equal(requestSignal.aborted, true);
  t.mock.timers.tick(BLOCK_INDEXING_DEADLINE); await flush();
  assert.equal(calls, 2, 'No requests after deadline exhaustion');
});

test('navigation cancels a scheduled retry and rejects a late old response', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const controller = new AbortController(), reason = new DOMException('Navigation', 'AbortError');
  let calls = 0;
  const result = loadIndexedBlockResource(options({ signal: controller.signal, request: async () => { calls++; return { status: 202, value: pending() }; } }));
  const rejected = assert.rejects(result, error => error === reason);
  await flush(); controller.abort(reason); await rejected;
  t.mock.timers.tick(BLOCK_INDEXING_DEADLINE); await flush(); assert.equal(calls, 1);
  const next = new AbortController(); let release, signal;
  const late = loadIndexedBlockResource(options({ signal: next.signal, request: current => { signal = current; return new Promise(resolve => release = resolve); } }));
  const obsolete = assert.rejects(late, error => error === reason);
  next.abort(reason); assert.equal(signal.aborted, true);
  release({ status: 200, value: ready }); await obsolete;
});

test('requestJson exposes the actual 202 status without changing existing 200 calls', async () => {
  const accepts = [];
  const server = http.createServer((req, res) => {
    accepts.push(req.headers.accept);
    res.writeHead(req.url === '/pending' ? 202 : 200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(req.url === '/pending' ? pending() : ready));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}`;
    let inspected;
    assert.deepEqual(await requestJson(url + '/pending', { headers: { accept: 'application/vnd.ink.indexing+json, application/json' } }, 1000, 'object', (value, status) => { inspected = { value, status }; }), pending());
    assert.deepEqual(inspected, { value: pending(), status: 202 });
    assert.equal(accepts[0], 'application/vnd.ink.indexing+json, application/json');
    assert.deepEqual(await requestJson(url), ready);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
