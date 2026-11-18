import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import WebSocket from 'ws';
const base='https://inkexplorer.xyz',results=[];
async function check(path,inspect){
 const response=await fetch(base+path,{signal:AbortSignal.timeout(25000),redirect:'manual',headers:{'user-agent':'InkExplorer-Release-Check/1.0'}});
 const body=await response.text();await inspect(response,body);results.push({path,status:response.status,passed:true,cache:response.headers.get('cache-control'),freshness:response.headers.get('x-ink-data-status')});
}
const source=await readFile('dist/index.html','utf8');const expectedScript=source.match(/src="(\/assets\/[^\"]+\.js)"/)[1];
for(const prefix of ['','/testnet']){
 await check(prefix+'/',(r,body)=>{assert.equal(r.status,200);assert(body.includes(expectedScript),'Production must serve the newly built bundle');assert(body.includes(`rel="canonical" href="${base}${prefix}/"`));assert(r.headers.has('content-security-policy'));});
 await check(prefix+'/robots.txt',(r,body)=>{assert.equal(r.status,200);assert(body.includes('Disallow: '+prefix+'/api/live'));});
 await check(prefix+'/api/network',(r,body)=>{assert.equal(r.status,200);const d=JSON.parse(body);assert.equal(d.chainId,prefix?763373:57073);assert(d.online&&d.synced&&!d.stale);});
 await check(prefix+'/api/live/snapshot',(r,body)=>{assert.equal(r.status,200);const d=JSON.parse(body);assert.equal(d.network.chainId,prefix?763373:57073);assert(Number.isSafeInteger(d.block.height));assert(Math.abs(Date.now()-Date.parse(d.sentAt))<120000);});
 await check(prefix+'/api/explorer/blocks',(r,body)=>{assert.equal(r.status,200);const d=JSON.parse(body);assert(d.items.length);assert(Math.abs(Date.now()-Date.parse(d.items[0].timestamp))<15*60000);});
 await check(prefix+'/api/stats/counters',(r,body)=>{assert.equal(r.status,200);assert(Array.isArray(JSON.parse(body).counters));});
 const socketResult=await new Promise((resolve,reject)=>{
  const ws=new WebSocket(base.replace('https:','wss:')+prefix+'/api/live','ink-explorer.delta.v1',{origin:base});
  const timer=setTimeout(()=>{ws.terminate();reject(new Error('Public WebSocket timeout'));},20000);
  ws.on('message',raw=>{try{const d=JSON.parse(String(raw));assert.equal(d.protocol,'ink-observer.live.v1');assert.equal(d.network.chainId,prefix?763373:57073);clearTimeout(timer);ws.close();resolve({path:prefix+'/api/live',transport:'websocket',chainId:d.network.chainId,passed:true});}catch(e){clearTimeout(timer);ws.terminate();reject(e);}});
  ws.on('error',e=>{clearTimeout(timer);reject(e);});
 });results.push(socketResult);
}
for(const path of [expectedScript,'/brand/ink-symbol.svg','/assets/openapi.json','/theme.js','/manifest.webmanifest'])await check(path,(r,body)=>{assert.equal(r.status,200);assert(!body.startsWith('<!doctype'));assert.equal(r.headers.get('x-content-type-options'),'nosniff');if(path===expectedScript)assert.match(r.headers.get('cache-control'),/31536000.*immutable/);});
await check('/wp-admin/install.php',(r)=>assert.equal(r.status,404));
const www=await fetch('https://www.inkexplorer.xyz/blocks',{redirect:'manual',signal:AbortSignal.timeout(20000)});assert.equal(www.status,308);assert.equal(www.headers.get('location'),base+'/blocks');results.push({path:'https://www.inkexplorer.xyz/blocks',status:308,passed:true});
const report={checkedAt:new Date().toISOString(),passed:true,expectedScript,results};
await mkdir('reports/spam-guard',{recursive:true});
await writeFile('reports/spam-guard/production-check.json',JSON.stringify(report,null,2));
console.log('PASS production checks:',results.length,'new bundle:',expectedScript);
