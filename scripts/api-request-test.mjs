import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import http from 'node:http';
import { requestJson, getDataFreshness, subscribeDataFreshness, resetDataFreshness, waitForRequestRetry } from '../src/api-request.ts';

let server, base;
const snapshots = new Map();
before(async () => {
  server = http.createServer((req, res) => {
    if (snapshots.has(req.url)) {
      const { status, at, delay = 0 } = snapshots.get(req.url);
      setTimeout(() => { res.writeHead(200, { 'x-ink-data-status': status, 'x-ink-data-fetched-at': at }); res.end('{"items":[]}'); }, delay);
      return;
    }
    if (req.url.startsWith('/count/')) { res.end(decodeURIComponent(req.url.slice(7))); return; }
    if (req.url === '/hang') return;
    if (req.url === '/body') { res.writeHead(200, {'content-type':'application/json'}); res.write('{'); return; }
    if (req.url === '/html') { res.end('<html>SPA fallback</html>'); return; }
    if (req.url === '/error') { res.writeHead(503); res.end(JSON.stringify({error:'Index offline'})); return; }
    if (req.url === '/cooldown') { res.writeHead(503, {'retry-after':'1'}); res.end('{"error":"Temporarily unavailable"}'); return; }
    if (req.url === '/primitive') { res.end('"unexpected"'); return; }
    if (req.url === '/null') { res.end('null'); return; }
    if (req.url === '/delayed') { setTimeout(() => res.end('{"items":[]}'), 60); return; }
    res.end(JSON.stringify({items:[],cursor:'900719925474099312345'}));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });

test('JSON preserves exact strings and valid empty records', async () => {
  assert.deepEqual(await requestJson(base), {items:[],cursor:'900719925474099312345'});
  assert.equal(await requestJson(base+'/null'), null, 'Pool checks may return null');
});
test('Both stalled headers and stalled bodies expire', async () => {
  for (const path of ['/hang','/body'])
    await assert.rejects(requestJson(base+path,{},40), /requestTimeout/);
});
test('Reject SPA HTML and primitive responses without inventing empty records', async () => {
  for (const path of ['/html','/primitive'])
    await assert.rejects(requestJson(base+path), /invalidApiResponse/);
});
test('Preserve upstream errors', async () => {
  await assert.rejects(requestJson(base+'/error'), /Index offline/);
});
test('Navigation cancellation stays cancellation, including already aborted signals', async () => {
  for (const alreadyAborted of [true,false]) {
    const controller=new AbortController();
    const reason=new DOMException('Navigation','AbortError');
    if (alreadyAborted) controller.abort(reason);
    const pending=requestJson(base+'/hang',{signal:controller.signal},100);
    if (!alreadyAborted) setTimeout(()=>controller.abort(reason),20);
    await assert.rejects(pending,error=>error===reason);
  }
});
test('Long queries have their own deadline and retry after an expired request works', async () => {
  await assert.rejects(requestJson(base+'/delayed',{},20),/requestTimeout/);
  assert.deepEqual(await requestJson(base+'/delayed',{},200),{items:[]});
  assert.deepEqual((await requestJson(base)).items,[]);
});

test('Only explicit count responses accept nonnegative safe integers', async () => {
  for (const value of [0, 50608]) assert.equal(await requestJson(base+'/count/'+value,{},100,'count'),value);
  for (const value of [-1, 1.5, 9007199254740992, 'null', '"50608"', 'true', '{}'])
    await assert.rejects(requestJson(base+'/count/'+encodeURIComponent(value),{},100,'count'), /invalidApiResponse/);
  await assert.rejects(requestJson(base+'/count/50608'), /invalidApiResponse/);
});

test('stale source warnings retain the oldest snapshot until every affected source recovers', async () => {
  resetDataFreshness();
  let notifications = 0;
  const unsubscribe = subscribeDataFreshness(() => notifications++);
  const first = '2026-10-08T12:00:00.000Z', oldest = '2026-10-07T12:00:00.000Z';
  snapshots.set('/first', { status: 'stale', at: first });
  snapshots.set('/second', { status: 'stale', at: oldest });
  await requestJson(base + '/first');
  assert.deepEqual(getDataFreshness(), { fetchedAt: first, resources: 1 });
  await requestJson(base + '/second');
  await requestJson(base);
  assert.deepEqual(getDataFreshness(), { fetchedAt: oldest, resources: 2 });
  snapshots.set('/second', { status: 'fresh', at: first });
  await requestJson(base + '/second');
  assert.deepEqual(getDataFreshness(), { fetchedAt: first, resources: 1 });
  snapshots.set('/first', { status: 'fresh', at: first });
  await requestJson(base + '/first');
  assert.equal(getDataFreshness(), null);
  assert.equal(notifications, 4);
  unsubscribe();
});

test('obsolete responses cannot contaminate another page or replace newer freshness', async () => {
  resetDataFreshness();
  snapshots.set('/old-page', { status: 'stale', at: '2026-10-08T12:00:00.000Z', delay: 50 });
  const previousPage = requestJson(base + '/old-page');
  resetDataFreshness();
  await previousPage;
  assert.equal(getDataFreshness(), null);
  snapshots.set('/race', { status: 'stale', at: '2026-10-08T12:00:00.000Z', delay: 100 });
  const previousRequest = requestJson(base + '/race');
  await new Promise(resolve => setTimeout(resolve, 30));
  snapshots.set('/race', { status: 'fresh', at: '2026-10-09T12:00:00.000Z' });
  await requestJson(base + '/race');
  await previousRequest;
  assert.equal(getDataFreshness(), null);
  snapshots.set('/invalid-date', { status: 'stale', at: 'invalid' });
  await requestJson(base + '/invalid-date');
  assert.equal(getDataFreshness(), null);
});


test('response inspectors can reject stale indexed snapshots before they become updates', async () => {
  snapshots.set('/indexed', {status:'stale',at:'2026-10-18T00:00:00.000Z'});
  await assert.rejects(requestJson(base+'/indexed',{},100,'object',(_,status,headers)=>{
    assert.equal(status,200);assert.equal(headers.get('x-ink-data-fetched-at'),'2026-10-18T00:00:00.000Z');
    if(headers.get('x-ink-data-status')==='stale')throw new Error('staleIndex');
  }),/staleIndex/);
});

test('queued retries honor the server deadline and remain cancellable', async () => {
  const url=base+'/cooldown';
  await assert.rejects(requestJson(url), /Temporarily unavailable/);
  const controller=new AbortController(), reason=new DOMException('Page hidden','AbortError');
  const cancelled=waitForRequestRetry(url,controller.signal);
  controller.abort(reason);
  await assert.rejects(cancelled,error=>error===reason);
  await assert.rejects(waitForRequestRetry(url,controller.signal),error=>error===reason);
  const started=Date.now();
  await waitForRequestRetry(base+'/other');
  assert(Date.now()-started<500,'A service error is scoped to its resource');
  await waitForRequestRetry(url);
  assert(Date.now()-started>=900,'The queue cannot bypass Retry-After');
  await assert.rejects(requestJson(url), /Temporarily unavailable/, 'The next request reaches the server');
});
