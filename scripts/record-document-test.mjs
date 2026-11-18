import assert from 'node:assert/strict';
import {test} from 'node:test';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){try{return n(s,c)}catch(e){if(s.startsWith('./')&&c.parentURL?.includes('/src/')&&!/\.[a-z]+$/.test(s))return n(s+'.ts',c);throw e;}}});
const {handleRequest}=await import('../cloudflare/worker.mjs');
const {startupShell}=await import('../server/startup-shell.mjs');
const h='0x'+'a'.repeat(64),parent='0x'+'b'.repeat(64),address='0x'+'c'.repeat(40);
const template='<!doctype html><html lang="en"><head><title>Ink Explorer</title><meta name="description" content="Explorer" /></head><body><div id="root">'+startupShell()+'</div></body></html>';
const env={PUBLIC_URL:'https://inkexplorer.xyz',API_ORIGIN:'https://records.example/ink-production',ORIGIN_TOKEN:'origin-secret',ASSETS:{async fetch(r){const path=new URL(r.url).pathname;if(path==='/index.html')return new Response(template);const m=path.match(/^\/snapshots\/records\/(block|transaction)-(mainnet|sepolia)-(\w+)\.json$/);return m?Response.json({kind:m[1],network:m[2],language:m[3],styles:[],html:'<nav><a href="/">Ink Explorer</a></nav><main id="main-content" tabindex="-1" data-record-shell=""></main>'}):new Response('Missing',{status:404});}}};
const records={block:{height:100,hash:h,parent_hash:parent,miner:{hash:address},timestamp:'2026-01-01T00:00:00Z',gas_used:'21000',gas_limit:'30000000',transaction_fees:'0',transactions_count:1},transaction:{hash:h,block_number:100,from:{hash:address},to:{hash:address},timestamp:'2026-01-01T00:00:00Z',value:'1234567891234567891',fee:{value:'0'},status:'ok'}};
const withFetch=async(fn,run)=>{const saved=globalThis.fetch;globalThis.fetch=fn;try{await run();}finally{globalThis.fetch=saved;}};
for(const kind of ['block','transaction'])test(`${kind}: HTTP content, identity, language and canonical match in both networks and all ten locales`,async()=>{
 for(const[prefix,chainId]of[['',57073],['/testnet',763373]])for(const locale of ['en','fr','es','pt','ar','ru','hi','bn','zh','ja']){
  await withFetch(async(url,options)=>{assert.equal(url,env.API_ORIGIN+prefix+'/api/explorer/'+(kind==='block'?'blocks/100':'transactions/'+h));assert.equal(options.headers['x-ink-origin-token'],'origin-secret');return Response.json(records[kind],{headers:{'x-ink-data-status':'fresh','x-ink-data-fetched-at':new Date().toISOString()}});},async()=>{
   const path=prefix+(kind==='block'?'/block/100':'/tx/'+h),r=await handleRequest(new Request('https://inkexplorer.xyz'+path+'?lang='+locale+'&tracking=unused'),env),html=await r.text();
   assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.match(r.headers.get('x-robots-tag'),/^index/);assert(html.includes('data-initial-record="'+kind+'"'));assert(html.includes(h));assert(!html.includes('origin-secret'));assert(html.includes('lang="'+locale+'"'));assert(html.includes('class="startup-embedded"'));
   assert(html.includes('href="https://inkexplorer.xyz'+path+(locale==='en'?'':'?lang='+locale)+'"'));assert(!html.includes('tracking=unused'));
   const observation=JSON.parse(html.match(/id="ink-initial-record" type="application\/json">([^<]+)<\/script>/)[1]);assert.equal(observation.chainId,chainId);assert.deepEqual(observation.data,records[kind]);
  });
 }
});
test('recent proven inclusion is a useful page, while unknown upstream failures remain temporary',async()=>{
 for(const kind of ['block','transaction']){
  const data=kind==='block'?{code:'BLOCK_INDEXING',chainId:57073,block:{number:'100',hash:h},retryAfterMs:3000}:{code:'TRANSACTION_INDEXING',chainId:57073,transaction:{hash:h,blockNumber:'100',blockHash:parent},retryAfterMs:1000};
  const path=kind==='block'?'/block/100':'/tx/'+h;
  for(const status of [202,404,502])await withFetch(async()=>Response.json(data,{status}),async()=>{
   const r=await handleRequest(new Request('https://inkexplorer.xyz'+path),env),html=await r.text();assert.equal(r.status,status===202?200:503);assert(html.includes('data-record-phase="'+(status===202?'indexing':'unavailable')+'"'));assert(!html.includes('<dl'));if(status!==202)assert.equal(r.headers.get('retry-after'),'3');
  });
 }
});
test('HEAD preserves the document status; malformed paths never trigger upstream lookup',async()=>{
 let calls=0;
 await withFetch(async()=>{calls++;return Response.json(records.block,{headers:{'x-ink-data-status':'fresh','x-ink-data-fetched-at':new Date().toISOString()}});},async()=>{
  const r=await handleRequest(new Request('https://inkexplorer.xyz/block/100',{method:'HEAD'}),env);assert.equal(r.status,200);assert.equal(await r.text(),'');assert.equal(calls,1);
  for(const p of ['/tx/invalid','/block/not-a-hash'])assert.equal((await handleRequest(new Request('https://inkexplorer.xyz'+p),env)).status,404);assert.equal(calls,1);
 });
});
