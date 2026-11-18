import assert from 'node:assert/strict';
import {test} from 'node:test';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){try{return n(s,c)}catch(e){if(s.startsWith('./')&&c.parentURL?.includes('/src/')&&!/\.[a-z]+$/.test(s))return n(s+'.ts',c);throw e;}}});
const {loadRecordArrival,renderRecordArrival,serializeRecord,fillRecordShell}=await import('../server/record-arrival.mjs');
const {validRecordArrival,recordOverview,recordRoute}=await import('../src/record-arrival.ts');
const env={API_ORIGIN:'https://source.example/ink',ORIGIN_TOKEN:'test-secret'},h='0x'+'a'.repeat(64),other='0x'+'b'.repeat(64),wallet='0x'+'c'.repeat(40),at=()=>new Date().toISOString();
const block=()=>({height:100,hash:h,timestamp:at(),parent_hash:other,gas_used:'0',gas_limit:'30000000',transactions_count:0,size:100,miner:{hash:wallet},transaction_fees:'900719925474099312345',base_fee_per_gas:'0'});
const tx=()=>({hash:h,block_number:100,timestamp:at(),from:{hash:wallet},to:{hash:wallet},value:'0',gas_used:'21000',gas_limit:'21000',fee:{value:'0'},status:'ok',method:'transfer'});
const response=(value,status=200,headers={})=>Response.json(value,{status,headers:{'x-ink-data-status':'fresh','x-ink-data-fetched-at':at(),...headers}});
for(const[kind,path,make,media]of[['block','/block/100',block,'application/vnd.ink.indexing+json'],['transaction','/tx/'+h,tx,'application/vnd.ink.transaction-indexing+json']]){
 for(const[basePath,chainId]of[['',57073],['/testnet',763373]])test(`${kind} ${chainId}: fresh matching records keep exact values and authenticated fixed origin`,async()=>{
  const data=make();const observation=await loadRecordArrival({pathname:path,basePath},env,{fetcher:async(url,options)=>{assert.equal(url,env.API_ORIGIN+basePath+'/api/explorer/'+(kind==='block'?'blocks/100':'transactions/'+h));assert.equal(options.headers['x-ink-origin-token'],'test-secret');assert(options.headers.accept.includes(media));assert.equal(options.redirect,'manual');return response(data);}});
  assert.equal(observation.phase,'ready');assert.equal(observation.chainId,chainId);assert.deepEqual(observation.data,data);assert(validRecordArrival(observation,kind,observation.id,chainId));
  assert(!validRecordArrival(observation,kind,observation.id,chainId===57073?763373:57073));assert(!validRecordArrival(observation,kind,other,chainId));assert(!validRecordArrival(observation,kind,observation.id,chainId,Date.now()+16000));
  const rows=recordOverview(observation,'en',x=>x,basePath).rows;if(kind==='block'){assert.equal(rows.find(r=>r.label==='l2Fees').value,'900.719925474099312345 ETH');assert.equal(new URL(rows.find(r=>r.label==='transactions').href,'https://example.com').searchParams.get('tab'),'transactions');}else assert.equal(rows.find(r=>r.label==='value').value,'0 ETH');
 });
 test(`${kind}: an unproven index failure is unavailable, never an invented record`,async()=>{
  for(const r of [response(make(),503),response(kind==='block'?{...make(),height:101}:{...make(),hash:other}),response(make(),200,{'x-ink-data-status':'stale'}),response(make(),200,{'x-ink-data-fetched-at':'2020-01-01T00:00:00Z'}),response(make(),200,{'x-ink-data-fetched-at':new Date(Date.now()-20000).toISOString()}),response(make(),200,{'x-ink-data-fetched-at':'not-a-date'}),new Response('not-json')]){
   const value=await loadRecordArrival({pathname:path},env,{fetcher:async()=>r});assert.equal(value.phase,'unavailable');assert.equal(value.data,undefined);
  }
 });
 test(`${kind}: only matching chain inclusion proofs establish indexing`,async()=>{
  const data=kind==='block'?{code:'BLOCK_INDEXING',chainId:57073,block:{number:'100',hash:h},retryAfterMs:3000}:{code:'TRANSACTION_INDEXING',chainId:57073,transaction:{hash:h,blockNumber:'100',blockHash:other},retryAfterMs:1000};
  const result=await loadRecordArrival({pathname:path},env,{fetcher:async()=>response(data,202)});assert.equal(result.phase,'indexing');assert(validRecordArrival(result,kind,result.id,57073));
  const bad=await loadRecordArrival({pathname:path},env,{fetcher:async()=>response({...data,chainId:763373},202)});assert.equal(bad.phase,'unavailable');
 });
}
test('deadline includes body stalls, oversized payloads and redirect failures',async()=>{
 const stalled=new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{'));}}),{headers:{'x-ink-data-status':'fresh','x-ink-data-fetched-at':at()}});
 const start=Date.now(),v=await loadRecordArrival({pathname:'/block/100'},env,{timeout:40,fetcher:async()=>stalled});assert.equal(v.phase,'unavailable');assert(Date.now()-start<1000);
 for(const fetcher of [async()=>new Response('x',{headers:{'content-length':'999999'}}),async()=>{throw new Error('Unexpected redirect')}])assert.equal((await loadRecordArrival({pathname:'/block/100'},env,{fetcher})).phase,'unavailable');
});
test('identifiers and external source text cannot inject markup or executable scripts',async()=>{
 const data={...tx(),method:'</script><script>alert(1)</script>'};const v=await loadRecordArrival({pathname:'/tx/'+h},env,{fetcher:async()=>response(data)}),html=renderRecordArrival(v,'en');
 assert(!html.includes('<script>'));assert(html.includes('&lt;/script&gt;'));assert(!serializeRecord(v).includes('<'));assert.deepEqual(JSON.parse(serializeRecord(v)),v);
 const shell={kind:'transaction',network:'mainnet',language:'en',styles:[],html:'<main id="main-content" tabindex="-1" data-record-shell=""></main>'};assert(fillRecordShell(shell,v,'en').html.includes('data-initial-record="transaction"'));assert.equal(fillRecordShell({...shell,kind:'block'},v,'en'),null);
});
test('malformed initial observations fail closed instead of throwing',()=>{
 for(const v of [null,{},[],{schema:1,kind:'block'},{schema:1,kind:'block',id:{}}])assert.equal(validRecordArrival(v,'block','100',57073),false);
 for(const path of ['/block/../x','/tx/1','/TX/1','/block/99999999999999999999','/address/'+h])assert.equal(recordRoute(path),null);
 assert.deepEqual(recordRoute('/BLOCK/100'),{kind:'block',id:'100'});assert.deepEqual(recordRoute('/TX/'+h),{kind:'transaction',id:h});
});
