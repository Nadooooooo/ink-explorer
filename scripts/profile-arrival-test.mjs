import assert from 'node:assert/strict';
import {test} from 'node:test';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){try{return n(s,c)}catch(e){if(s.startsWith('./')&&c.parentURL?.includes('/src/')&&!/\.[a-z]+$/.test(s))return n(s+'.ts',c);throw e;}}});
const {loadRecordArrival,renderRecordArrival}=await import('../server/record-arrival.mjs');
const {validRecordArrival,recordRoute,recordOverview}=await import('../src/record-arrival.ts');
const {handleRequest}=await import('../cloudflare/worker.mjs');
const {startupShell}=await import('../server/startup-shell.mjs');
const id='0x'+'a'.repeat(40),other='0x'+'b'.repeat(40),at=()=>new Date().toISOString();
const env={PUBLIC_URL:'https://inkexplorer.xyz',API_ORIGIN:'https://profiles.example',ORIGIN_TOKEN:'fixture-only'};
const make=(kind,chain_id=57073)=>kind==='address'?{hash:id,chain_id,name:'Named contract',coin_balance:'900719925474099312345',block_number_balance_updated_at:123,balance_check:{scope:'head',status:'matched',block_number:123,block_hash:'0x'+'c'.repeat(64),block_timestamp:Math.floor(Date.now()/1000),checked_at:at(),source:'local'},is_contract:true,is_verified:true}:{address_hash:id,chain_id,name:'Example token',symbol:'EX',type:'ERC-20',decimals:6,total_supply:'123456789123456789',holders_count:'9007199254740993',exchange_rate:'2',circulating_market_cap:'99999999999999999999'};
const response=(data,headers={},status=200)=>Response.json(data,{status,headers:{'x-ink-data-status':'fresh','x-ink-data-fetched-at':at(),...headers}});
for(const kind of ['address','token']){
 test(`${kind}: only fresh, correctly scoped profiles become initial observations`,async()=>{
  for(const[prefix,chainId]of[['',57073],['/testnet',763373]]){
   const data=make(kind,chainId),path='/'+kind+'/'+id;
   assert.deepEqual(recordRoute(path),{kind,id});
   const good=await loadRecordArrival({pathname:path,basePath:prefix},env,{fetcher:async(url,opts)=>{assert.equal(url,env.API_ORIGIN+prefix+'/api/explorer/'+(kind==='address'?'addresses':'tokens')+'/'+id);assert.equal(opts.headers['x-ink-origin-token'],env.ORIGIN_TOKEN);assert.equal(opts.redirect,'manual');return response(data);}});
   assert.equal(good.phase,'ready');assert(validRecordArrival(good,kind,id,chainId));assert(!validRecordArrival(good,kind,id,chainId,Date.now()+16000));assert(!validRecordArrival(good,kind,other,chainId));
   for(const bad of [response({...data,chain_id:chainId===57073?763373:57073}),response({...data,[kind==='address'?'hash':'address_hash']:other}),response({...data,code:'NOT_FOUND'}),response(data,{'x-ink-data-status':'stale'}),response(data,{'x-ink-data-fetched-at':'2020-01-01'}),response(data,{},202)]){
    const v=await loadRecordArrival({pathname:path,basePath:prefix},env,{fetcher:async()=>bad});assert.equal(v.phase,'unavailable');assert.equal(v.data,undefined);
   }
   const rows=recordOverview(good,'en',x=>x,prefix).rows;
   if(kind==='address')assert.equal(rows.find(x=>x.label==='ETH balance').value,'900.719925474099312345 ETH');
   else{assert.equal(rows.find(x=>x.label==='Holders').value,'9,007,199,254,740,993');assert(!JSON.stringify(rows).includes(data.circulating_market_cap));}
   const unsafe={...good,data:{...data,name:'</h1><script>bad()</script>'}};assert(!renderRecordArrival(unsafe,'fr',prefix).includes('<script>'));assert(renderRecordArrival(unsafe,'fr',prefix).includes('&lt;script&gt;'));
  }
 });
 test(`${kind}: localized initial HTML and canonical survive without JavaScript`,async()=>{
  const original=globalThis.fetch;
  try{for(const prefix of ['','/testnet'])for(const lang of ['en','fr','es','pt','ar','ru','hi','bn','zh','ja']){
   const data=make(kind,prefix?763373:57073);globalThis.fetch=async()=>response(data);
   const assets={...env,ASSETS:{async fetch(req){const path=new URL(req.url).pathname;if(path==='/index.html')return new Response('<!doctype html><html><head><title>Ink Explorer</title></head><body><div id="root">'+startupShell()+'</div></body></html>');return Response.json({kind,network:prefix?'sepolia':'mainnet',language:lang,styles:[],html:'<main id="main-content" tabindex="-1" data-record-shell=""></main>'});}}};
   const path=prefix+'/'+kind+'/'+id,r=await handleRequest(new Request(env.PUBLIC_URL+path+'?lang='+lang),assets),html=await r.text();
   assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.match(r.headers.get('x-robots-tag'),/^index/);assert(html.includes('data-initial-record="'+kind+'"'));assert(html.includes(data.name));assert(html.includes(id));assert(html.includes('href="'+env.PUBLIC_URL+path+(lang==='en'?'':'?lang='+lang)+'"'));assert(!html.includes('fixture-only'));
  }}finally{globalThis.fetch=original;}
 });
}
test('profile documents share the client source-age boundary without changing block freshness',async()=>{
 for(const kind of ['address','token']){
  const path='/'+kind+'/'+id,data=make(kind);
  for(const age of [20000,35000,89000]){const value=await loadRecordArrival({pathname:path},env,{fetcher:async()=>response(data,{'x-ink-data-fetched-at':new Date(Date.now()-age).toISOString()})});assert.equal(value.phase,'ready');assert(validRecordArrival(value,kind,id,57073));}
  for(const age of [90000,120000]){const value=await loadRecordArrival({pathname:path},env,{fetcher:async()=>response(data,{'x-ink-data-fetched-at':new Date(Date.now()-age).toISOString()})});assert.equal(value.phase,'unavailable');}
 }
});

test('profile routes do not accept NFT paths, bad identifiers, or traversal',()=>{
 for(const path of ['/address/123','/token/'+id+'/instance/1','/token/0x'+'a'.repeat(64),'/address/../'+id])assert.equal(recordRoute(path),null);
});
