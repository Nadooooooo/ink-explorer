import assert from 'node:assert/strict';
import http from 'node:http';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const requireTools = createRequire(resolve(process.env.RECORD_WORKERD_TOOLS || '.', 'package.json'));
const {Miniflare,convertV4MiniflareOptions} = requireTools('miniflare');
const {build} = requireTools('esbuild');

const out=process.env.RECORD_WORKERD_OUTPUT||'reports/detail-arrival/workerd';
await mkdir(out,{recursive:true});const hash='0x'+'a'.repeat(64),wallet='0x'+'b'.repeat(40),results=[];
let mode='ready',redirectRequests=0,authenticatedRequests=0;
const server=http.createServer((req,res)=>{
 if(req.url==='/redirect-target'){redirectRequests++;res.writeHead(200);res.end('{}');return;}
 if(req.headers['x-ink-origin-token']!=='fixture-only'){res.writeHead(403);res.end('{}');return;}authenticatedRequests++;
 if(mode==='redirect'){res.writeHead(302,{location:'/redirect-target'});res.end();return;}
 const respond=()=>{
 res.writeHead(200,{'content-type':'application/json','x-ink-data-status':mode==='stale'?'stale':'fresh','x-ink-data-fetched-at':new Date(Date.now()-(mode==='aged-profile'?20000:0)).toISOString()});
 if(mode==='body-stall'){res.write('{');return;}
 if(mode==='malformed'){res.end('not-json');return;}
 if(req.url.includes('/addresses/')||req.url.includes('/tokens/')){const id=mode==='mismatch'?'0x'+'c'.repeat(40):wallet;res.end(JSON.stringify(req.url.includes('/addresses/')?{hash:id,coin_balance:'1234567891234567891',is_contract:false}:{address_hash:id,name:'Wrapped Ether',decimals:18,total_supply:'1234567891234567891',holders_count:'7'}));return;}
 const id=mode==='mismatch'?'0x'+'c'.repeat(64):hash;
 res.end(JSON.stringify(req.url.includes('/blocks/')?{height:mode==='mismatch'?101:100,hash:id,parent_hash:hash,timestamp:new Date().toISOString(),gas_used:'21000',gas_limit:'30000000',transactions_count:1,size:1000,transaction_fees:'900719925474099312345'}:{hash:id,block_number:100,from:{hash:wallet},to:{hash:wallet},value:'1234567891234567891',fee:{value:'0'},status:'ok'}));
 };if(mode==='slow-profile')setTimeout(respond,3200);else if(mode==='slow-source')setTimeout(respond,1700);else respond();
});
const bundled=await build({stdin:{resolveDir:process.cwd(),contents:`import {loadRecordArrival} from './server/record-arrival.mjs';export default {async fetch(request,env){const u=new URL(request.url),basePath=u.pathname.startsWith('/testnet/')?'/testnet':'';return Response.json(await loadRecordArrival({pathname:u.pathname.slice(basePath.length),basePath},env,u.searchParams.has('deadline')?{timeout:Number(u.searchParams.get('deadline'))}:{}));}}`},bundle:true,write:false,format:'esm',platform:'neutral',target:'es2022'});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let mf;
try{
 mf=new Miniflare(convertV4MiniflareOptions({modules:true,compatibilityDate:'2026-10-13',bindings:{API_ORIGIN:'http://127.0.0.1:'+server.address().port,ORIGIN_TOKEN:'fixture-only'},script:bundled.outputFiles[0].text}));
 for(const prefix of ['','/testnet'])for(const kind of ['block','transaction']){
  mode='ready';const r=await mf.dispatchFetch('http://test.local'+prefix+(kind==='block'?'/block/100':'/tx/'+hash)),d=await r.json();assert.equal(d.phase,'ready');assert.equal(d.kind,kind);assert.equal(d.chainId,prefix?763373:57073);assert.equal(d.data.hash,hash);assert.equal(kind==='block'?d.data.transaction_fees:d.data.value,kind==='block'?'900719925474099312345':'1234567891234567891');results.push({kind,prefix,mode,passed:true});
 }
 for(const prefix of ['','/testnet'])for(const kind of ['address','token']){mode='ready';const r=await mf.dispatchFetch('http://test.local'+prefix+'/'+kind+'/'+wallet),d=await r.json();assert.equal(d.phase,'ready');assert.equal(d.kind,kind);assert.equal(d.chainId,prefix?763373:57073);assert.equal(kind==='address'?d.data.hash:d.data.address_hash,wallet);results.push({kind,prefix,mode,passed:true});}
 for(mode of ['redirect','stale','mismatch','malformed','body-stall']){
  const start=Date.now(),r=await mf.dispatchFetch('http://test.local/block/100'+(mode==='body-stall'?'?deadline=40':'')),d=await r.json();assert.equal(d.phase,'unavailable');assert.equal(d.data,undefined);assert(Date.now()-start<1500);results.push({mode,durationMs:Date.now()-start,passed:true});
 }
 mode='slow-source';const start=Date.now(),slow=await(await mf.dispatchFetch('http://test.local/block/100')).json();assert.equal(slow.phase,'ready');assert(Date.now()-start>=1700&&Date.now()-start<2500);results.push({mode,durationMs:Date.now()-start,passed:true});
 mode='slow-profile';const profileStart=Date.now(),profile=await(await mf.dispatchFetch('http://test.local/address/'+wallet)).json();assert.equal(profile.phase,'ready');assert(Date.now()-profileStart>=3200&&Date.now()-profileStart<4000);results.push({mode,durationMs:Date.now()-profileStart,passed:true});
 mode='aged-profile';const aged=await(await mf.dispatchFetch('http://test.local/address/'+wallet)).json();assert.equal(aged.phase,'ready');assert(Date.now()-Date.parse(aged.sourceAt)>=20000);results.push({mode,passed:true});
 assert.equal(redirectRequests,0,'An authenticated origin redirect must never be followed');assert.equal(authenticatedRequests,16);
}finally{
 try{await mf?.dispose();}
 finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
}
await writeFile(out+'/results.json',JSON.stringify({engine:'workerd (local Miniflare)',upstreamMocked:true,compatibilityDate:'2026-10-13',redirectRequests,authenticatedRequests,passed:true,results},null,2));console.log('Workerd:',results.length,'cases passed; no authenticated redirect followed');
