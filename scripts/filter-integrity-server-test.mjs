import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,cp,mkdir,symlink,rm,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
const output=process.env.FILTER_SERVER_OUTPUT||'reports/filter-integrity/server';
const hash=n=>'0x'+n.toString(16).padStart(64,'0');
const sender='0x'+'1'.repeat(40),recipient='0x'+'2'.repeat(40);
const statuses=['success','execution reverted','out of gas','invalid opcode','awaiting_internal_transactions',null,'pending'];
const items=statuses.map((status,index)=>({hash:hash(index+1),status,timestamp:'2026-10-22T00:00:00Z',from:{hash:sender},to:{hash:recipient},block_number:100,transaction_index:index,method:'transfer',type:'contract_interaction',fee:'123',internal_transaction_index:null,token_transfer_index:null,token_transfer_batch_index:null}));
let outage=false,tokenMode=false,active=0,peak=0,offset=100,mismatch=false,rateLimited=false,parentCalls=0;
const upstream=createServer(async(req,res)=>{
 if(req.url.startsWith('/transactions/')){
  parentCalls++;
  if(rateLimited){res.writeHead(429,{'content-type':'application/json','x-ratelimit-remaining':'0','x-ratelimit-reset':'60000'});return res.end(JSON.stringify({error:'Rate limit reached'}));}
  active++;peak=Math.max(peak,active);const wanted=req.url.split('/').at(-1);
  await new Promise(r=>setTimeout(r,Number(BigInt(wanted)%3n)===0?800:600));active--;
  res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify({...items[0],hash:mismatch?hash(999):wanted}));
 }
 const records=tokenMode?Array.from({length:8},(_,i)=>({...items[0],hash:hash(offset+i),token_transfer_index:i})):items;
 res.writeHead(outage?503:200,{'content-type':'application/json'});res.end(JSON.stringify(outage?{error:'Unavailable'}:{items:records,next_page_params:null}));
});
await new Promise(r=>upstream.listen(0,'127.0.0.1',r));const api='http://127.0.0.1:'+upstream.address().port,results=[];
try{for(const network of ['mainnet','sepolia']){
 const temp=await mkdtemp(join(tmpdir(),'ink-filter-integrity-'));let child,log='';
 try{
  await cp('server',join(temp,'server'),{recursive:true});await mkdir(join(temp,'src'));await mkdir(join(temp,'dist'));
  await cp('src',join(temp,'src'),{recursive:true});await cp('package.json',join(temp,'package.json'));await symlink(resolve('node_modules'),join(temp,'node_modules'));
  const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
  child=spawn(process.execPath,['--experimental-strip-types','server/server.mjs'],{cwd:temp,env:{...process.env,PORT:String(port),HOST:'127.0.0.1',INK_NETWORK:network,BLOCKSCOUT_API:api,BLOCKSCOUT_STATS_API:api,INK_RPC:api,INK_OP_NODE_RPC:api,INK_METRICS_URL:api},stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',d=>log+=d);child.stderr.on('data',d=>log+=d);
  const base='http://127.0.0.1:'+port;let ready=false;
  for(let i=0;i<100;i++){try{ready=(await fetch(base+'/api/health')).ok;if(ready)break;}catch{}await new Promise(r=>setTimeout(r,50));}assert(ready,log);
  for(const [status,expected] of [['failed',[2,3,4]],['success',[1]],['',[1,2,3,4,5,6,7]]]){
   const r=await fetch(base+'/api/v1/transactions?'+new URLSearchParams(status?{status}:{}));assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');const d=await r.json();
   assert.equal(d.meta.chainId,network==='mainnet'?57073:763373);assert.deepEqual(d.items.map(x=>x.hash),expected.map(hash));
   if(status==='failed')assert(d.items.every(x=>x.status==='error'));
   if(status==='success')assert(d.items.every(x=>x.status==='ok'));
   results.push({network,status:status||'all',passed:true,count:d.items.length});
  }
  const r=await fetch(base+'/api/v1/transactions?status=unsupported');assert.equal(r.status,400);
  assert.equal((await fetch(base+'/api/v1/transactions',{method:'POST'})).status,405);
  // Use a cold source query: previously fetched pages have a valid 15s cache.
  const cold='/api/v1/transactions?status=failed&age_from=2026-10-22T00:00:00Z';
  outage=true;assert.equal((await fetch(base+cold)).status,502);outage=false;
  assert.equal((await fetch(base+cold)).status,200);
  results.push({network,case:'validation, read-only, upstream failure and recovery',passed:true});
  tokenMode=true;peak=0;offset=100;
  const tokenResponse=await fetch(base+'/api/v1/transactions?transaction_types=ERC-20');assert.equal(tokenResponse.status,200);const tokens=await tokenResponse.json();assert.deepEqual(tokens.items.map(x=>x.hash),Array.from({length:8},(_,i)=>hash(100+i)));assert(peak===2);assert.equal(active,0);results.push({network,case:'parallel parent HTTP reads, order and bounded concurrency',peak,passed:true});
  const before=parentCalls;const cached=await fetch(base+'/api/v1/transactions?transaction_types=ERC-20');assert.equal(cached.status,200);assert.equal(parentCalls,before);results.push({network,case:'fresh cached parents bypass the request gate without new HTTP reads',passed:true});
  offset=200;mismatch=true;const invalid=await fetch(base+'/api/v1/transactions?transaction_types=ERC-721');assert.equal(invalid.status,502);assert.equal(active,0);results.push({network,case:'wrong parent identity rejects the page without partial rows',passed:true});
  offset=300;mismatch=false;rateLimited=true;const started=Date.now(),limited=await fetch(base+'/api/v1/transactions?transaction_types=ERC-1155');assert.equal(limited.status,429);assert(Number(limited.headers.get('retry-after'))>=50);assert(Date.now()-started<5000);results.push({network,case:'upstream quota exhaustion becomes 429 with Retry-After, not a partial page or gateway error',passed:true});
 }finally{outage=false;tokenMode=false;mismatch=false;rateLimited=false;if(child&&child.exitCode===null){child.kill('SIGTERM');await new Promise(r=>child.once('close',r));}await rm(temp,{recursive:true,force:true});}
}}finally{upstream.closeAllConnections();await new Promise(r=>upstream.close(r));}
await mkdir(output,{recursive:true});await writeFile(output+'/results.json',JSON.stringify({passed:true,results},null,2));console.log(JSON.stringify({passed:true,cases:results.length}));
