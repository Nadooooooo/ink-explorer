import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve, extname} from 'node:path';
import {registerHooks} from 'node:module';
import {createHash} from 'node:crypto';
import {publicApiPath, allowedPublicMethod} from './public-proxy.mjs';
import {matchesIfNoneMatch} from './conditional-request.mjs';
import {createPublicRpc,apiDiscovery} from './public-rpc.mjs';

// Use the published renderer itself, including its locale and record loaders.
registerHooks({resolve(specifier, context, next) {
  try {return next(specifier, context);} catch (error) {
    if(specifier.startsWith('./') && context.parentURL?.includes('/src/') && !/\.[a-z]+$/.test(specifier)) return next(specifier+'.ts', context);
    throw error;
  }
}});
const {handleRequest}=await import('../cloudflare/worker.mjs');
const root=resolve(import.meta.dirname,'..');
const port=Number(process.env.INK_SITE_PORT||4197);
const origin=process.env.INK_SITE_PUBLIC_URL||'https://inkexplorer.xyz';
const gateway=new URL(process.env.INK_SITE_GATEWAY||'http://127.0.0.1:4195');
if(gateway.origin!=='http://127.0.0.1:4195' || gateway.pathname!=='/') throw Error('Unexpected local gateway');
const token=(await readFile(process.env.INK_SITE_ORIGIN_TOKEN_FILE||resolve(root,'runtime/origin-token'),'utf8')).trim();
if(!token) throw Error('Missing origin credential');
const manifestText=await readFile(resolve(root,'dist/release-artifacts.json'),'utf8');
const manifest=JSON.parse(manifestText);
// Reuse the release identifier across restarts, including self-hosted builds.
const version=process.env.INK_SITE_VERSION||createHash('sha256').update(manifestText).digest('hex');
const files=new Set([...Object.keys(manifest.active),...Object.keys(manifest.retained)]);
const mime={'.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.html':'text/html; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.avif':'image/avif','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2','.webmanifest':'application/manifest+json','.txt':'text/plain; charset=utf-8','.wasm':'application/wasm'};
const assets=new Map();let assetBytes=0;
const pages=new Map();const maxPages=600;
const stableRoutes=new Set(['/',...JSON.parse(await readFile(resolve(root,'dist/snapshots/pages-manifest.json'),'utf8')).map(x=>x.route)]);
const started=Date.now();let requests=0,failures=0;
const publicRpc=[createPublicRpc({localUrl:'http://127.0.0.1:8545',chainId:57073,origin,trustProxy:true}),createPublicRpc({localUrl:'http://127.0.0.1:8645',chainId:763373,origin,basePath:'/testnet',trustProxy:true})];
const env={PUBLIC_URL:origin,API_ORIGIN:gateway.origin,ORIGIN_TOKEN:token,DEPLOYMENT:{id:version},ASSETS:{async fetch(request) {
  let name;try {name=decodeURIComponent(new URL(request.url).pathname).slice(1);} catch {return new Response('Invalid',{status:400});}
  if(!files.has(name)) return new Response('Missing',{status:404});
  let body=assets.get(name);
  if(!body) {
    body=await readFile(resolve(root,'dist',name));
    while(assetBytes+body.length>32*1024*1024 && assets.size) {const [key,value]=assets.entries().next().value;assets.delete(key);assetBytes-=value.length;}
    if(body.length<=32*1024*1024) {assets.set(name,body);assetBytes+=body.length;}
  }
  return new Response(body,{headers:{'content-type':mime[extname(name)]||'application/octet-stream'}});
}}};
const previewHosts=[...(process.env.INK_SITE_PREVIEW_HOSTS||'').split(','),process.env.INK_MIGRATION_PREVIEW_HOST||''];
const allowedHosts=new Set([new URL(origin).host,'www.inkexplorer.xyz',`127.0.0.1:${port}`,`localhost:${port}`,...previewHosts.map(host=>host.trim().toLowerCase()).filter(Boolean)]);
function stableKey(url) {
  const base=url.pathname.replace(/^\/testnet(?=\/|$)/,'')||'/';
  if(!stableRoutes.has(base) || [...url.searchParams.keys()].some(k=>k!=='lang') || url.searchParams.getAll('lang').length>1) return null;
  const language=url.searchParams.get('lang')||'en';
  if(!['en','fr','ar','es','pt','ru','zh','ja','hi','bn'].includes(language)) return null;
  // A configured preview can have a different in-document robots policy.
  // Keep its representation and ETag separate from the public host.
  return url.host+url.pathname+'?lang='+language;
}
async function bodyOf(req) {
  if(req.method==='GET'||req.method==='HEAD') return undefined;
  const chunks=[];let size=0;
  for await(const chunk of req) {size+=chunk.length;if(size>4*1024*1024) throw Object.assign(Error('Request exceeds the hosting limit'),{status:413});chunks.push(chunk);}
  return Buffer.concat(chunks);
}
async function respond(req,res) {
  requests++;
  const host=req.headers.host||'';
  if(!allowedHosts.has(host)) {res.writeHead(421,{'cache-control':'no-store'});return res.end('Unknown host');}
  const protocol=req.headers['x-forwarded-proto']==='https'?'https:':'http:';
  // Resolve only targets belonging to the validated authority. WHATWG URL
  // treats //host and /\\host as new authorities, unlike an HTTP origin path.
  // Reject them before the shared document cache can inherit another host's
  // canonical/preview policy; ordinary same-origin absolute targets still work.
  let url;
  try {
    const target=req.url||'',requestOrigin=protocol+'//'+host;
    if((!target.startsWith('/')&&!/^https?:\/\//i.test(target))||target.startsWith('//')||target.split('?')[0].includes('\\'))throw Error('Invalid target');
    url=new URL(target,requestOrigin);
    if(url.origin!==requestOrigin||url.username||url.password)throw Error('Unexpected authority');
  } catch {
    res.writeHead(400,{'cache-control':'no-store','x-robots-tag':'noindex, nofollow','x-ink-hosting':'server'});return res.end('Invalid request target');
  }
  const isPreview=host!==new URL(origin).host && host!=='www.inkexplorer.xyz';
  if(url.pathname==='/__site/health') {res.writeHead(200,{'content-type':'application/json','cache-control':'no-store','x-robots-tag':'noindex','x-ink-hosting':'server'});return res.end(JSON.stringify({ok:true,version,uptime:Math.floor((Date.now()-started)/1000),requests,failures,cachedPages:pages.size}));}
  const servicePath=url.pathname.match(/^\/(testnet\/)?api(?:\/(rpc))?\/?$/);
  const canonicalRedirect=host==='www.inkexplorer.xyz'||host===new URL(origin).host&&protocol!=='https:';
  if(servicePath&&!canonicalRedirect){
    res.setHeader('x-ink-hosting','server');res.setHeader('x-ink-version',version);
    if(servicePath[2]){res.once('finish',()=>{if(res.statusCode>=500)failures++;});return publicRpc[servicePath[1]?1:0](req,res);}
    const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-robots-tag':'noindex, nofollow','access-control-allow-origin':'*','x-content-type-options':'nosniff'};
    if(req.method==='OPTIONS'){res.writeHead(204,{...headers,'access-control-allow-methods':'GET, HEAD, OPTIONS'});return res.end();}
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{...headers,allow:'GET, HEAD, OPTIONS'});return res.end();}
    const body=JSON.stringify(apiDiscovery(origin,servicePath[1]?'/testnet':''));res.writeHead(200,{...headers,'content-length':Buffer.byteLength(body)});return res.end(req.method==='HEAD'?undefined:body);
  }
  if(req.method==='OPTIONS'&&/^\/(?:testnet\/)?api\//.test(url.pathname)&&!canonicalRedirect){
    const method=String(req.headers['access-control-request-method']||'').toUpperCase();
    const requested=String(req.headers['access-control-request-headers']||'').toLowerCase().split(',').map(x=>x.trim()).filter(Boolean);
    if(['GET','HEAD'].includes(method)&&requested.every(x=>['accept','content-type'].includes(x))){res.writeHead(204,{'access-control-allow-origin':'*','access-control-allow-methods':'GET, HEAD','access-control-allow-headers':'Accept, Content-Type','access-control-max-age':'600','cache-control':'no-store','x-robots-tag':'noindex, nofollow'});return res.end();}
  }
  if(!['GET','HEAD','POST'].includes(req.method)) {res.writeHead(405,{allow:'GET, HEAD','cache-control':'no-store'});return res.end();}
  const isApi=/^\/(?:testnet\/)?api\//.test(url.pathname);
  if(req.method==='POST'&&!isApi) {res.writeHead(405,{allow:'GET, HEAD','cache-control':'no-store'});return res.end();}
  const headers=new Headers();for(const[key,value]of Object.entries(req.headers))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(', '):value);
  const redirects=host==='www.inkexplorer.xyz'||host===new URL(origin).host&&protocol!=='https:';
  const key=!isApi && !redirects && ['GET','HEAD'].includes(req.method)?stableKey(url):null;
  let cached=key&&pages.get(key),response,body;
  if(cached && cached.expires>Date.now()) {response={status:cached.status,headers:new Headers(cached.headers)};body=cached.body;}
  else {
    response=await handleRequest(new Request(url,{method:req.method==='HEAD'&&!isApi?'GET':req.method,headers,body:await bodyOf(req)}),env);
    body=Buffer.from(await response.arrayBuffer());
    if(key&&response.status===200&&response.headers.get('content-type')?.includes('text/html')) {
      response.headers.set('cache-control','public, max-age=0, s-maxage=60, must-revalidate');
      response.headers.set('etag','"'+createHash('sha256').update(body).digest('hex')+'"');
      while(pages.size>=maxPages)pages.delete(pages.keys().next().value);
      pages.set(key,{status:response.status,headers:Object.fromEntries(response.headers),body,expires:Date.now()+60000});
    }
  }
  const outgoing=Object.fromEntries(response.headers);outgoing['x-ink-hosting']='server';outgoing['x-ink-site-cache']=cached&&cached.expires>Date.now()?'HIT':key?'MISS':'BYPASS';
  if(isPreview)outgoing['x-robots-tag']='noindex, nofollow';
  if(isApi&&!url.pathname.endsWith('/api/media'))outgoing['cache-control']='no-store';
  if(isApi&&['GET','HEAD'].includes(req.method)){outgoing['access-control-allow-origin']='*';outgoing['access-control-expose-headers']='Retry-After, ETag, X-Ink-Data-Status, X-Ink-Data-Fetched-At';}
  if(response.status>=500)failures++;
  if(['GET','HEAD'].includes(req.method)&&response.status===200&&matchesIfNoneMatch(req.headers['if-none-match'],outgoing.etag)) {res.writeHead(304,outgoing);return res.end();}
  outgoing['content-length']=String(body.length);res.writeHead(response.status,outgoing);res.end(req.method==='HEAD'?undefined:body);
}
const server=http.createServer((req,res)=>respond(req,res).catch(error=>{
  failures++;if(res.headersSent)return res.destroy();
  res.writeHead(error.status||502,{'content-type':'text/plain','cache-control':'no-store','x-robots-tag':'noindex','x-ink-hosting':'server'});res.end(error.status===413?error.message:'Site temporarily unavailable');
}));
server.on('upgrade',(req,socket,head)=>{
  let path;try {if(!allowedHosts.has(req.headers.host))throw Error();path=publicApiPath(req.url);if(!/^\/(?:testnet\/)?api\/live$/.test(path)||!allowedPublicMethod(path,req.method))throw Error();} catch {socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');return;}
  const headers={...req.headers,host:gateway.host,'x-ink-origin-token':token};
  delete headers.cookie;delete headers.authorization;
  for(const key of Object.keys(headers))if(key.startsWith('x-forwarded-')||key==='forwarded')delete headers[key];
  const upstream=http.request({hostname:gateway.hostname,port:gateway.port,path,method:'GET',headers});
  upstream.setTimeout(10000,()=>upstream.destroy());
  upstream.on('upgrade',(response,peer,peerHead)=>{
    upstream.setTimeout(0);peer.setTimeout(0);socket.setTimeout(0);
    socket.write(`HTTP/1.1 ${response.statusCode} Switching Protocols\r\n${Object.entries(response.headers).map(([k,v])=>`${k}: ${v}`).join('\r\n')}\r\n\r\n`);
    if(head.length)peer.write(head);if(peerHead.length)socket.write(peerHead);socket.pipe(peer).pipe(socket);
    socket.on('error',()=>peer.destroy());socket.on('close',()=>peer.destroy());peer.on('error',()=>socket.destroy());peer.on('close',()=>socket.destroy());
  });
  upstream.on('response',response=>{response.resume();socket.destroy();});upstream.on('error',()=>socket.destroy());socket.on('close',()=>upstream.destroy());upstream.end();
});
server.requestTimeout=60000;server.headersTimeout=15000;
server.listen(port,'127.0.0.1',()=>console.log(`Public Ink Explorer ${version} on loopback ${port}`));
