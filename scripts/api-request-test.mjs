import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import http from 'node:http';
import { requestJson } from '../src/api-request.ts';

let server, base;
before(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/hang') return;
    if (req.url === '/body') { res.writeHead(200, {'content-type':'application/json'}); res.write('{'); return; }
    if (req.url === '/html') { res.end('<html>SPA fallback</html>'); return; }
    if (req.url === '/error') { res.writeHead(503); res.end(JSON.stringify({error:'Index offline'})); return; }
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
