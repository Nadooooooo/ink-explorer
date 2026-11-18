import {ledgerColumnPaint} from './ledger-column-paint.mjs';
import assert from 'node:assert/strict';import {chromium,firefox,webkit} from 'playwright-core';import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4317',out=process.env.ADDRESS_ACTIVITY_REAL_OUTPUT||'reports/address-activity/real';await mkdir(out,{recursive:true});const results=[];
const system='0x4200000000000000000000000000000000000015',addressOf=v=>typeof v==='string'?v:v?.hash;
async function rpc(port,method,params){const r=await fetch(`http://127.0.0.1:${port}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(10000)}),j=await r.json();assert(r.ok&&!j.error);return j.result;}
for(const[engine,launcher]of Object.entries({chromium,firefox,webkit})){
 const browser=await launcher.launch(engine==='chromium'?{args:['--no-sandbox']}:{});
 try{for(const[prefix,chainId,port,width,locale]of[['',57073,8545,390,'fr'],['/testnet',763373,8645,1440,'ar']]){
  const context=await browser.newContext({viewport:{width,height:1000},...(process.env.INK_RELEASE_VERSION?{extraHTTPHeaders:{'Cloudflare-Workers-Version-Overrides':`inkexplorer="${process.env.INK_RELEASE_VERSION}"`}}:{})}),page=await context.newPage(),frames=[],errors=[],assets=[];let documents=0,activityReads=0;const row={engine,chainId,width,address:system,samples:[]};
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.isNavigationRequest()&&r.frame()===page.mainFrame())documents++;if(new URL(r.url()).pathname.includes(`/addresses/${system}/transactions`))activityReads++;});
  page.on('websocket',ws=>ws.on('framereceived',({payload})=>{try{const f=JSON.parse(String(payload));if(f.protocol==='ink-observer.live.v1')frames.push({source:'websocket',receivedAt:Date.now(),frame:f});}catch{}}));
  page.on('response',async r=>{if(r.status()>=400&&['script','font','stylesheet'].includes(r.request().resourceType()))assets.push({url:r.url(),status:r.status()});if(new URL(r.url()).pathname.endsWith('/api/live/snapshot'))try{const f=await r.json();if(f.protocol==='ink-observer.live.v1')frames.push({source:'http',receivedAt:Date.now(),frame:f});}catch{}});
  const hashes=()=>page.locator('.address-transactions .tx-primary a[href*="/tx/"]').evaluateAll(nodes=>nodes.map(n=>new URL(n.href).pathname.split('/').pop()));
  try{
   const doc=await page.goto(base+prefix+'/address/'+system+'?tab=transactions&lang='+locale,{waitUntil:'domcontentloaded'});row.documentStatus=doc.status();row.version=doc.headers()['x-ink-version'];if(process.env.EXPECTED_VERSION)assert.equal(row.version,process.env.EXPECTED_VERSION);
   await page.waitForSelector('.address-transactions .tx-primary a');if(base.startsWith('https:'))await page.waitForFunction(()=>document.querySelector('[data-live-transport]')?.getAttribute('data-live-transport')==='websocket');
   row.transport=await page.locator('[data-live-transport]').getAttribute('data-live-transport');let known=new Set(await hashes()),since=Date.now();
   for(let i=0;i<3;i++){
    let observation;const deadline=Date.now()+25000;
    while(Date.now()<deadline&&!observation){const visible=new Set(await hashes());for(const f of frames.filter(f=>f.receivedAt>=since&&(row.transport!=='websocket'||f.source==='websocket'))){const tx=(f.frame.transactions||[]).find(tx=>!known.has(tx.hash)&&visible.has(tx.hash)&&[tx.from,tx.to,tx.created_contract].some(v=>addressOf(v)?.toLowerCase()===system));if(tx){observation={tx,transport:f.source};break;}}if(!observation)await new Promise(r=>setTimeout(r,200));}
    assert(observation,'A newly observed relevant transaction must appear in the open address list');const tx=observation.tx;const [receipt,block]=await Promise.all([rpc(port,'eth_getTransactionReceipt',[tx.hash]),rpc(port,'eth_getBlockByNumber',['0x'+Number(tx.block_number).toString(16),false])]);assert(receipt);assert.equal(receipt.blockHash.toLowerCase(),block.hash.toLowerCase());assert.equal(receipt.blockHash.toLowerCase(),tx.block_hash.toLowerCase());assert(block.transactions.includes(tx.hash));assert([receipt.from,receipt.to].some(a=>a?.toLowerCase()===system));
    row.samples.push({hash:tx.hash,block:Number(tx.block_number),blockHash:tx.block_hash,transport:observation.transport,rpcMatched:true,observedAt:new Date().toISOString()});known=new Set(await hashes());since=Date.now();
   }
   assert.equal(documents,1);assert.deepEqual(errors,[]);assert.deepEqual(assets,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.evaluate(()=>document.fonts.ready);const capture=await page.screenshot({path:`${out}/${engine}-${chainId}.png`});if(width>1000){row.columnPaint=await ledgerColumnPaint(page,capture);assert.equal(row.columnPaint.length,8);assert(row.columnPaint.every(c=>c.darkPixels>4),"Every desktop column must actually paint its label in the viewport screenshot");await page.locator('.ledger-columns').screenshot({path:`${out}/${engine}-${chainId}-columns.png`});}Object.assign(row,{passed:true,documents,activityReads});
  }catch(error){Object.assign(row,{passed:false,error:error.stack,documents,activityReads,errors,assets,frames:frames.length});await page.screenshot({path:`${out}/${engine}-${chainId}-failure.png`}).catch(()=>{});}
  finally{await context.close();}
  results.push(row);console.log(JSON.stringify(row));await writeFile(out+'/results.json',JSON.stringify({base,apiMocked:false,complete:false,results},null,2));
 }}finally{await browser.close();}
}
const report={base,apiMocked:false,physicalDevices:false,complete:true,passed:results.every(r=>r.passed),results};await writeFile(out+'/results.json',JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;
