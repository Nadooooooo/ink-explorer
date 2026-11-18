import {waitRecordPaint} from './wait-record-paint.mjs';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {chromium,firefox,webkit} from 'playwright-core';
// Inspect the actual intermediate paint; FontFaceSet.ready in Firefox waits
// for the deliberately held module, unlike individual loaded font faces.
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY='1';
const base=process.env.BASE_URL||'http://127.0.0.1:4310',out=process.env.RECORD_LIVE_OUTPUT||'reports/detail-arrival/real';
await mkdir(out,{recursive:true});
const entry=(await readFile('dist/index.html','utf8')).match(/<script type="module"[^>]+src="([^"]+)"/)[1];
const headers=process.env.INK_RELEASE_VERSION?{'Cloudflare-Workers-Version-Overrides':`inkexplorer="${process.env.INK_RELEASE_VERSION}"`}:{},records=[],results=[];
async function rpc(port,method,params){const r=await fetch('http://127.0.0.1:'+port,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:1,jsonrpc:'2.0',method,params}),signal:AbortSignal.timeout(10000)});assert.equal(r.status,200);const data=await r.json();assert(!data.error);return data.result;}
for(const[prefix,chainId,port,width,language]of[['',57073,8545,320,'fr'],['/testnet',763373,8645,1440,'ar']]){
 const head=Number(BigInt(await rpc(port,'eth_blockNumber',[]))),block=await rpc(port,'eth_getBlockByNumber',['0x'+(head-600).toString(16),false]);
 assert(block?.hash&&block.transactions.length,'A historical included block and transaction are required');
 const tx=await rpc(port,'eth_getTransactionByHash',[block.transactions[0]]);assert(tx?.blockHash===block.hash);
 records.push({prefix,chainId,port,width,language,block,tx});
}
function compare(observation,kind,record){
 assert.equal(observation.chainId,record.chainId);assert.equal(observation.phase,'ready');assert(Date.now()-Date.parse(observation.sourceAt)<15000);const d=observation.data;
 if(kind==='block'){assert.equal(d.hash,record.block.hash);assert.equal(BigInt(d.height),BigInt(record.block.number));assert.equal(BigInt(d.gas_used),BigInt(record.block.gasUsed));assert.equal(BigInt(d.gas_limit),BigInt(record.block.gasLimit));assert.equal(d.transactions_count,record.block.transactions.length);assert.equal(Date.parse(d.timestamp),Number(BigInt(record.block.timestamp))*1000);}
 else{assert.equal(d.hash,record.tx.hash);assert.equal(BigInt(d.block_number),BigInt(record.tx.blockNumber));assert.equal(d.from.hash.toLowerCase(),record.tx.from.toLowerCase());assert.equal((d.to?.hash||null)?.toLowerCase(),record.tx.to?.toLowerCase()||null);assert.equal(BigInt(d.value),BigInt(record.tx.value));}
}
for(const[engine,launcher]of Object.entries({chromium,firefox,webkit})){
 const browser=await launcher.launch(engine==='chromium'?{args:['--no-sandbox']}:{});
 try{for(const record of records)for(const kind of ['block','transaction'])for(const javaScriptEnabled of engine==='chromium'?[true,false]:[true]){
  const {prefix,chainId,width,language}=record,id=kind==='block'?String(BigInt(record.block.number)):record.tx.hash,path=prefix+(kind==='block'?'/block/':'/tx/')+id+'?lang='+language;
  const context=await browser.newContext({javaScriptEnabled,viewport:{width,height:1000},extraHTTPHeaders:headers}),page=await context.newPage(),errors=[],assetFailures=[],transportFailures=[],row={engine,chainId,width,language,kind,javaScriptEnabled,path};
  let release,apiReads=0,documents=0,apiObservation;const held=new Promise(r=>release=r);
  if(javaScriptEnabled)await context.route('**'+entry,async r=>{await held;await r.fallback().catch(()=>{});});
  page.on('requestfailed',r=>{if(['stylesheet','font'].includes(r.resourceType()))transportFailures.push({url:r.url(),error:r.failure()});});page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.isNavigationRequest()&&r.frame()===page.mainFrame())documents++;if(new URL(r.url()).pathname===prefix+'/api/explorer/'+(kind==='block'?'blocks/':'transactions/')+id)apiReads++;});
  page.on('response',r=>{if(r.status()>=400&&['script','stylesheet','font'].includes(r.request().resourceType()))assetFailures.push({url:r.url(),status:r.status()});if(new URL(r.url()).pathname===prefix+'/api/explorer/'+(kind==='block'?'blocks/':'transactions/')+id)apiObservation=r.json().then(data=>({chainId,phase:'ready',sourceAt:r.headers()['x-ink-data-fetched-at'],data,status:r.status(),fresh:r.headers()['x-ink-data-status']})).catch(()=>undefined);});
  try{
   const start=Date.now(),response=await page.goto(base+path,{waitUntil:javaScriptEnabled?'commit':'load'});row.documentMs=Date.now()-start;row.status=response.status();row.version=response.headers()['x-ink-version'];
   assert(javaScriptEnabled?[200,503].includes(response.status()):response.status()===200);if(process.env.EXPECTED_VERSION)assert.equal(row.version,process.env.EXPECTED_VERSION);assert.equal(response.headers()['cache-control'],'no-store');
   await page.locator('[data-initial-record]').waitFor();await waitRecordPaint(page);
   const observation=JSON.parse(await page.locator('#ink-initial-record').textContent());row.hash=kind==='block'?record.block.hash:record.tx.hash;row.initialDataAvailable=response.status()===200;
   if(row.initialDataAvailable){compare(observation,kind,record);row.sourceAt=observation.sourceAt;assert((await page.locator('#main-content').innerText()).includes(row.hash));}
   else{assert.equal(observation.phase,'unavailable');assert.equal(observation.data,undefined);assert.equal(observation.chainId,chainId);assert.equal(observation.id,id);assert.equal(response.headers()['retry-after'],'3');assert.equal(await page.locator('#main-content dl').count(),0);}
   assert.equal(await page.locator('#main-content h1').count(),1);assert.equal(apiReads,0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'),base+path);
   await page.screenshot({path:`${out}/${engine}-${chainId}-${kind}-${javaScriptEnabled?'initial':'no-js'}.png`});
   if(javaScriptEnabled){const resumed=Date.now();release();await page.locator(kind==='block'?'.block-definitions':'.transaction-definitions').waitFor();assert((await page.locator('#main-content').innerText()).includes(row.hash));if(row.initialDataAvailable)assert.equal(apiReads,0,'Fresh initial record should not be discarded or fetched twice');else{assert(apiReads>=1);const recovered=await apiObservation;assert.equal(recovered?.status,200);assert.equal(recovered.fresh,'fresh');compare(recovered,kind,record);Object.assign(row,{automaticRecoveryMs:Date.now()-resumed,sourceAt:recovered.sourceAt});await page.screenshot({path:`${out}/${engine}-${chainId}-${kind}-recovered.png`});}assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);}
   assert.equal(documents,1);assert.deepEqual(errors,[]);assert.deepEqual(assetFailures,[]);Object.assign(row,{apiReads,documents,passed:true});
  }catch(e){const paint=await page.evaluate(()=>({styles:[...document.querySelectorAll('link[rel=\"stylesheet\"]')].map(l=>({href:l.href,ready:!!l.sheet})),fonts:[...document.fonts].map(f=>({family:f.family,status:f.status,weight:f.weight})),resources:performance.getEntriesByType('resource').map(r=>({name:r.name,duration:r.duration,bytes:r.transferSize}))})).catch(()=>null);Object.assign(row,{passed:false,error:e.stack,paint,errors,assetFailures,transportFailures,apiReads,documents});await page.screenshot({path:`${out}/${engine}-${chainId}-${kind}-${javaScriptEnabled}-failure.png`}).catch(()=>{});}
  finally{release();await context.close();}
  results.push(row);console.log(JSON.stringify(row));await writeFile(out+'/results.json',JSON.stringify({base,documentMocked:false,apiMocked:false,rpcCompared:true,physicalDevices:false,complete:false,results},null,2));
 }}finally{await browser.close();}
}
await writeFile(out+'/results.json',JSON.stringify({base,documentMocked:false,apiMocked:false,rpcCompared:true,physicalDevices:false,complete:true,passed:results.every(r=>r.passed),results},null,2));if(results.some(r=>!r.passed))process.exitCode=1;
