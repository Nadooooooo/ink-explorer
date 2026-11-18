import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,firefox,webkit} from 'playwright';
const base=process.env.BASE_URL||'http://127.0.0.1:4315',out=process.env.ADDRESS_REAL_OUTPUT||'reports/address-live/real',id='0x4200000000000000000000000000000000000006';
await mkdir(out,{recursive:true});const results=[];
async function rpc(port,method,params){const r=await fetch(`http://127.0.0.1:${port}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(10000)}),d=await r.json();assert(r.ok&&!d.error);return d.result;}
for(const[engine,launcher]of Object.entries({chromium,firefox,webkit})){
 const browser=await launcher.launch(engine==='chromium'?{args:['--no-sandbox']}:{});
 try{for(const[prefix,chainId,port,width]of[['',57073,8545,390],['/testnet',763373,8645,1440]]){
  const context=await browser.newContext({viewport:{width,height:1000},...(process.env.INK_RELEASE_VERSION?{extraHTTPHeaders:{'Cloudflare-Workers-Version-Overrides':`inkexplorer="${process.env.INK_RELEASE_VERSION}"`}}:{})}),page=await context.newPage(),errors=[],assets=[],responses=[],frames=[],row={engine,chainId,width,samples:[]};let documents=0,requests=0;
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.isNavigationRequest()&&r.frame()===page.mainFrame())documents++;if(new URL(r.url()).pathname.includes('/api/address-balance/'))requests++;});
  page.on('response',async r=>{if(['script','stylesheet','font'].includes(r.request().resourceType())&&r.status()>=400)assets.push({url:r.url(),status:r.status()});if(new URL(r.url()).pathname.includes('/api/address-balance/'))responses.push({status:r.status(),url:r.url()});});
  page.on('websocket',socket=>socket.on('framereceived',({payload})=>{try{const frame=JSON.parse(String(payload));if(frame.protocol==='ink-observer.live.v1')frames.push(frame);}catch{}}));
  const sample=()=>page.locator('[data-address-balance]').evaluate(el=>({balance:el.getAttribute('data-address-balance'),height:Number(el.getAttribute('data-balance-block')),hash:el.getAttribute('data-balance-hash')}));
  try{
   const document=await page.goto(base+prefix+'/address/'+id+'?lang='+(prefix?'ar':'fr'),{waitUntil:'domcontentloaded'});row.documentStatus=document.status();row.version=document.headers()['x-ink-version'];if(process.env.EXPECTED_VERSION)assert.equal(row.version,process.env.EXPECTED_VERSION);
   await page.waitForFunction(()=>/^\d+$/.test(document.querySelector('[data-address-balance]')?.getAttribute('data-address-balance')||''));
   if(base.startsWith('https:'))await page.waitForFunction(()=>document.querySelector('[data-live-transport]')?.getAttribute('data-live-transport')==='websocket');
   row.transport=await page.locator('[data-live-transport]').getAttribute('data-live-transport');
   for(let i=0;i<3;i++){
    const visible=await sample();if(base.startsWith('https:'))assert(frames.some(f=>f.block?.hash===visible.hash||f.blocks?.some(b=>b.hash===visible.hash)),'Displayed balance hash must occur in an actual WebSocket frame');const block=await rpc(port,'eth_getBlockByNumber',['0x'+visible.height.toString(16),false]);assert.equal(block.hash.toLowerCase(),visible.hash.toLowerCase());const actual=await rpc(port,'eth_getBalance',[id,{blockHash:visible.hash,requireCanonical:true}]);assert.equal(BigInt(actual).toString(),visible.balance);assert(Date.now()-Number(block.timestamp)*1000<15000);row.samples.push({...visible,verifiedAt:new Date().toISOString(),rpcMatched:true});
    if(i<2)await page.waitForFunction(h=>Number(document.querySelector('[data-address-balance]')?.getAttribute('data-balance-block'))>h,visible.height,{timeout:20000});
   }
   await page.evaluate(()=>dispatchEvent(new Event('offline')));await page.waitForFunction(()=>document.querySelector('[data-address-balance]')?.getAttribute('data-address-balance')==='');
   await page.evaluate(()=>dispatchEvent(new Event('online')));await page.waitForFunction(()=>/^\d+$/.test(document.querySelector('[data-address-balance]')?.getAttribute('data-address-balance')||''));
   assert.equal(documents,1);assert.deepEqual(errors,[]);assert.deepEqual(assets,[]);assert(responses.length>0&&responses.every(r=>r.status===200));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   await page.screenshot({path:`${out}/${engine}-${chainId}.png`});Object.assign(row,{passed:true,requests,documents,offlineAndRecovery:true,responses});
  }catch(error){Object.assign(row,{passed:false,error:error.stack,errors,assets,requests,documents,responses});await page.screenshot({path:`${out}/${engine}-${chainId}-failure.png`}).catch(()=>{});}
  finally{await context.close();}
  results.push(row);console.log(JSON.stringify(row));await writeFile(out+'/results.json',JSON.stringify({base,apiMocked:false,complete:false,results},null,2));
 }}finally{await browser.close();}
}
const report={base,apiMocked:false,physicalDevices:false,complete:true,passed:results.every(r=>r.passed),results};await writeFile(out+'/results.json',JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;
