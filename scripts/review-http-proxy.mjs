import http from 'node:http';
import {createGzip} from 'node:zlib';
import {pathToFileURL} from 'node:url';

// Local integration workers do not compress JSON; the published Cloudflare
// path does. Apply ordinary HTTP compression without changing response data,
// latency, browser throttling or Lighthouse thresholds. This is not a TLS,
// Cloudflare policy or external-reachability simulation.
function acceptsGzip(value = '') {
  const entries = new Map(value.toLowerCase().split(',').map(part => {
    const [name, ...parameters] = part.trim().split(';');
    const quality = parameters.find(parameter => parameter.trim().startsWith('q='));
    return [name, quality ? Number(quality.trim().slice(2)) : 1];
  }));
  return (entries.get('gzip') ?? entries.get('*') ?? 0) > 0;
}

export function createReviewProxy(upstreamOrigin) {
  const upstream = new URL(upstreamOrigin);
  if (upstream.protocol !== 'http:' || upstream.hostname !== '127.0.0.1' || upstream.pathname !== '/' || upstream.search || upstream.hash || upstream.username || upstream.password)
    throw Error('Review upstream must be a loopback HTTP origin');
  const server = http.createServer((request, response) => {
    const incoming = http.request({hostname: upstream.hostname, port: upstream.port, method: request.method, path: request.url, headers: request.headers}, source => {
      const headers = {...source.headers};
      const compressed = acceptsGzip(request.headers['accept-encoding']) && !headers['content-encoding'] && source.statusCode !== 204 && source.statusCode !== 206 && source.statusCode !== 304 && /^(?:application\/(?:json|javascript)|text\/|image\/svg\+xml)/i.test(headers['content-type'] || '') && !/\bno-transform\b/i.test(headers['cache-control'] || '');
      if (compressed) {
        headers['content-encoding'] = 'gzip';
        delete headers['content-length'];
        delete headers['content-md5'];
        const vary = String(headers.vary || '').split(',').map(value => value.trim()).filter(Boolean);
        if (!vary.some(value => /^(?:accept-encoding|\*)$/i.test(value))) vary.push('Accept-Encoding');
        headers.vary = vary.join(', ');
        if (headers.etag && !headers.etag.startsWith('W/')) headers.etag = 'W/' + headers.etag;
      }
      response.writeHead(source.statusCode, headers);
      source.on('error', () => response.destroy());
      if (compressed && request.method !== 'HEAD') {
        const gzip = createGzip({level: 6});
        gzip.on('error', () => response.destroy());
        source.pipe(gzip).pipe(response);
      } else source.pipe(response);
    });
    incoming.on('error', () => {
      if (response.headersSent) return response.destroy();
      response.writeHead(502, {'cache-control': 'no-store'});
      response.end('Review upstream unavailable');
    });
    request.on('aborted', () => incoming.destroy());
    response.on('close', () => incoming.destroy());
    request.pipe(incoming);
  });
  server.on('upgrade', (request, socket, head) => {
    if (request.method !== 'GET' || !/^\/(?:testnet\/)?api\/live$/.test(request.url)) return socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
    const incoming = http.request({hostname: upstream.hostname, port: upstream.port, method: 'GET', path: request.url, headers: request.headers});
    incoming.setTimeout(10000, () => incoming.destroy());
    incoming.on('upgrade', (response, peer, peerHead) => {
      incoming.setTimeout(0);
      peer.setTimeout(0);
      socket.setTimeout(0);
      socket.write(`HTTP/1.1 ${response.statusCode} Switching Protocols\r\n${Object.entries(response.headers).map(([key, value]) => `${key}: ${value}`).join('\r\n')}\r\n\r\n`);
      if (head.length) peer.write(head);
      if (peerHead.length) socket.write(peerHead);
      socket.pipe(peer).pipe(socket);
      socket.on('error', () => peer.destroy());
      socket.on('close', () => peer.destroy());
      peer.on('error', () => socket.destroy());
      peer.on('close', () => socket.destroy());
    });
    incoming.on('response', response => {response.resume(); socket.destroy();});
    incoming.on('error', () => socket.destroy());
    socket.on('close', () => incoming.destroy());
    incoming.end();
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createReviewProxy(process.env.REVIEW_UPSTREAM || 'http://127.0.0.1:4458');
  server.listen(Number(process.env.REVIEW_PORT || 4488), '127.0.0.1', () => console.log(`Review HTTP compression proxy on loopback ${server.address().port}`));
}
