import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve, extname} from 'node:path';
import {registerHooks} from 'node:module';
import {createReviewProxy} from './review-http-proxy.mjs';

// Exercise the published document renderer and its real build snapshots while
// keeping read-only APIs on isolated loopback workers. The outer review proxy
// supplies normal HTTP compression. Public hosting policy is verified separately
// against server/public-site.mjs and the actual HTTPS deployment.
registerHooks({resolve(specifier, context, next) {
  try {return next(specifier, context);} catch (error) {
    if (specifier.startsWith('./') && context.parentURL?.includes('/src/') && !/\.[a-z]+$/.test(specifier)) return next(specifier + '.ts', context);
    throw error;
  }
}});
const {handleRequest} = await import('../cloudflare/worker.mjs');
const dist = resolve(import.meta.dirname, '../dist');
const origin = process.env.REVIEW_RENDERER_ORIGIN || 'http://127.0.0.1:4490';
const api = process.env.REVIEW_UPSTREAM || 'http://127.0.0.1:4480';
const socketProxy = createReviewProxy(api); // Also validates the API origin.
const publicUrl = new URL(origin);
if (publicUrl.protocol !== 'http:' || publicUrl.hostname !== '127.0.0.1' || publicUrl.pathname !== '/' || publicUrl.search || publicUrl.hash || publicUrl.username || publicUrl.password) throw Error('Review renderer origin must be loopback HTTP');
const mime = {'.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.html':'text/html; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.avif':'image/avif','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2','.webmanifest':'application/manifest+json','.txt':'text/plain; charset=utf-8','.wasm':'application/wasm'};
const env = {PUBLIC_URL: origin, API_ORIGIN: api, ORIGIN_TOKEN:'local-review-only', DEPLOYMENT:{id:'local-source-bound-review'}, ASSETS:{async fetch(request) {
  const name = decodeURIComponent(new URL(request.url).pathname);
  const file = resolve(dist, '.' + name);
  if (!file.startsWith(dist + '/')) return new Response('Invalid asset', {status:400});
  try {return new Response(await readFile(file), {headers:{'content-type':mime[extname(file)] || 'application/octet-stream'}});}
  catch {return new Response('Missing asset', {status:404});}
}}};
const server = http.createServer(async (request, response) => {
  try {
    if (!['GET','HEAD'].includes(request.method)) {
      response.writeHead(405, {allow:'GET, HEAD','cache-control':'no-store'});
      return response.end();
    }
    const url = new URL(request.url, origin);
    if (url.origin !== publicUrl.origin) throw Error('Unexpected request authority');
    const result = await handleRequest(new Request(url, {method:request.method,headers:request.headers}), env);
    response.writeHead(result.status, Object.fromEntries(result.headers));
    response.end(Buffer.from(await result.arrayBuffer()));
  } catch {
    if (response.headersSent) return response.destroy();
    response.writeHead(502, {'cache-control':'no-store'});
    response.end('Review renderer unavailable');
  }
});
server.on('upgrade', socketProxy.listeners('upgrade')[0]);
server.listen(Number(process.env.REVIEW_RENDERER_PORT || 4491), '127.0.0.1', () => console.log(`Source-bound review renderer on loopback ${server.address().port}`));
