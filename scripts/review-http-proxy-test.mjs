import assert from 'node:assert/strict';
import {test} from 'node:test';
import http from 'node:http';
import {once} from 'node:events';
import {gunzipSync} from 'node:zlib';
import WebSocket, {WebSocketServer} from 'ws';
import {createReviewProxy} from './review-http-proxy.mjs';

test('review HTTP proxy preserves JSON, freshness, negotiation, HEAD, errors and native WebSockets', async () => {
  const body = Buffer.from(JSON.stringify({data: 'source-exact-value'.repeat(6000)}));
  const upstream = http.createServer((request, response) => {
    const status = request.url === '/missing' ? 404 : request.url === '/conditional' ? 304 : 200;
    response.writeHead(status, {'content-type':'application/json', 'cache-control':'no-store', 'content-length': body.length, 'x-ink-data-status':'fresh', 'x-ink-data-fetched-at':'2026-11-09T00:00:00.000Z', vary:'Origin', etag:'"source"'});
    response.end(status === 304 ? undefined : body);
  });
  const sockets = new WebSocketServer({server: upstream});
  sockets.on('connection', socket => socket.on('message', bytes => socket.send(bytes)));
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
  const proxy = createReviewProxy(`http://127.0.0.1:${upstream.address().port}`);
  proxy.listen(0, '127.0.0.1'); await once(proxy, 'listening');
  const port = proxy.address().port;
  const get = (path, encoding, method = 'GET') => new Promise((resolve, reject) => {
    const request = http.request({hostname:'127.0.0.1',port,path,method,headers:{'accept-encoding':encoding}}, response => {
      const chunks=[]; response.on('data', bytes => chunks.push(bytes)); response.on('error', reject);
      response.on('end', () => resolve({status:response.statusCode,headers:response.headers,body:Buffer.concat(chunks)}));
    }); request.on('error', reject); request.end();
  });
  try {
    const compressed = await get('/api/overview', 'gzip, br');
    assert.equal(compressed.status, 200); assert.equal(compressed.headers['content-encoding'], 'gzip');
    assert.deepEqual(gunzipSync(compressed.body), body); assert(compressed.body.length < body.length / 10);
    assert.equal(compressed.headers['x-ink-data-status'], 'fresh');
    assert.equal(compressed.headers['x-ink-data-fetched-at'], '2026-11-09T00:00:00.000Z');
    assert.equal(compressed.headers.vary, 'Origin, Accept-Encoding'); assert.equal(compressed.headers.etag, 'W/"source"');
    const identity = await get('/api/overview', 'gzip;q=0, *;q=1');
    assert.equal(identity.headers['content-encoding'], undefined); assert.deepEqual(identity.body, body);
    const head = await get('/api/overview', 'gzip', 'HEAD');
    assert.equal(head.headers['content-encoding'], 'gzip'); assert.equal(head.body.length, 0);
    const conditional = await get('/conditional', 'gzip');
    assert.equal(conditional.status, 304); assert.equal(conditional.headers['content-encoding'], undefined); assert.equal(conditional.body.length, 0);
    const missing = await get('/missing', 'gzip');
    assert.equal(missing.status, 404); assert.deepEqual(gunzipSync(missing.body), body);
    const ws = new WebSocket(`ws://127.0.0.1:${port}/testnet/api/live`);
    await once(ws, 'open'); ws.send('native-frame');
    const [frame] = await once(ws, 'message'); assert.equal(frame.toString(), 'native-frame'); ws.close(); await once(ws, 'close');
  } finally {
    for (const socket of sockets.clients) socket.terminate();
    const closed = [new Promise(resolve => proxy.close(resolve)),new Promise(resolve => upstream.close(resolve))];
    proxy.closeAllConnections(); upstream.closeAllConnections(); await Promise.all(closed); sockets.close();
  }
});

test('review proxy accepts only an explicit credential-free loopback origin', () => {
  for (const origin of ['https://127.0.0.1','http://example.com','http://user:secret@127.0.0.1','http://127.0.0.1/path']) assert.throws(() => createReviewProxy(origin), /loopback/);
});
