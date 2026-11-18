import assert from 'node:assert/strict';
import { chromium, firefox, webkit } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const base=process.env.BASE_URL,out=process.env.NETWORK_LIVE_OUTPUT||'reports/network-arrival/live';
assert(base?.startsWith('https://'),'An explicit public HTTPS origin is required');
await mkdir(out,{recursive:true});const results=[];
for(const [engine,launcher]of Object.entries({chromium,firefox,webkit})){
 const browser=await launcher.launch(engine==='chromium'?{args:['--no-sandbox']}:{});
 try{for(const [prefix,chainId,width]of[['',57073,390],['/testnet',763373,1440]])for(const transport of ['websocket','http']){
  const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage(),frames=[],errors=[],requests=[],row={engine,prefix,chainId,width,transport};
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(new URL(r.url()).pathname.endsWith('/api/network'))requests.push(r.url());});
  page.on('websocket',s=>s.on('framereceived',({payload})=>{try{const f=JSON.parse(String(payload));if(f.protocol==='ink-observer.live.v1')frames.push(f);}catch{}}));
  page.on('response',async r=>{if(new URL(r.url()).pathname.endsWith('/api/live/snapshot')){try{frames.push(await r.json());}catch{}}});
  if(transport==='http')await context.routeWebSocket(/\/api\/live$/,s=>s.close());
  try{
   await page.goto(base+prefix+'/network?lang=en',{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>document.querySelector('.health-banner')?.dataset.networkObservation);
   const first=Number(await page.locator('[data-live-head]').getAttribute('data-live-head'));
   await page.waitForFunction(first=>Number(document.querySelector('[data-live-head]')?.getAttribute('data-live-head'))>=first+2,first,{timeout:20000});
   const state=await page.evaluate(()=>({sampledAt:document.querySelector('.health-banner').dataset.networkObservation,metrics:[...document.querySelectorAll('.health-grid .metric > strong')].map(e=>e.textContent),transport:document.querySelector('[data-live-transport]').getAttribute('data-live-transport'),head:Number(document.querySelector('[data-live-head]').getAttribute('data-live-head')),overflow:document.documentElement.scrollWidth>innerWidth+1}));
   const observed=frames.findLast(f=>f.network?.sampledAt===state.sampledAt&&f.network.head===state.head);assert(observed,'The displayed report must match an actual response');
   assert.equal(observed.network.chainId,chainId);assert(Date.now()-Date.parse(state.sampledAt)<15000);assert.equal(state.transport,transport);assert.equal(state.overflow,false);
   assert.deepEqual(state.metrics,[observed.network.head,observed.network.finalizedBlock,observed.network.rollupPeers,observed.network.knownPeers].map(v=>v==null?'N/A':Number(v).toLocaleString('en')));
   const response=await fetch(`http://127.0.0.1:${prefix?8645:8545}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_getBlockByNumber',params:['0x'+state.head.toString(16),false]})});const rpc=await response.json();assert.equal(rpc.result.hash,observed.block.hash);
   assert.deepEqual(requests,[],'No second network polling loop');
   await page.evaluate(()=>dispatchEvent(new Event('offline')));await page.waitForFunction(()=>[...document.querySelectorAll('.health-grid .metric > strong')].every(e=>e.textContent==='N/A'));
   await page.evaluate(()=>dispatchEvent(new Event('online')));await page.waitForFunction(()=>document.querySelector('.health-banner')?.dataset.networkObservation);
   assert.deepEqual(errors,[]);await page.screenshot({path:`${out}/${engine}-${chainId}-${transport}.png`});
   Object.assign(row,{firstHead:first,...state,blockHash:observed.block.hash,frames:frames.length,offlineAndRecovery:true,passed:true});
  }catch(e){Object.assign(row,{passed:false,error:e.stack,errors});}
  finally{await context.close();}
  results.push(row);console.log(JSON.stringify(row));await writeFile(out+'/results.json',JSON.stringify({base,apiMocked:false,httpModeDisablesWebSocket:true,physicalDevices:false,complete:false,results},null,2));
 }}finally{await browser.close();}
}
await writeFile(out+'/results.json',JSON.stringify({base,apiMocked:false,httpModeDisablesWebSocket:true,physicalDevices:false,complete:true,passed:results.every(r=>r.passed),results},null,2));if(results.some(r=>!r.passed))process.exitCode=1;
