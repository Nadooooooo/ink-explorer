import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4310',out=process.env.SUMMARY_OUTPUT||'reports/ledger-polish/browser';
await mkdir(out,{recursive:true});const results=[];
for(const [engine,launcher]of Object.entries({chromium,firefox,webkit}).filter(([name])=>!process.env.SUMMARY_ENGINES || process.env.SUMMARY_ENGINES.split(',').includes(name))){
 const browser=await launcher.launch(engine==='chromium'?{args:['--no-sandbox']}:{});
 try{for(const prefix of ['','/testnet'])for(const [width,locale]of [[320,'fr'],[1440,'ar']]){
  const context=await browser.newContext({viewport:{width,height:950},colorScheme:width===320?'light':'dark'}),page=await context.newPage(),row={engine,prefix,width,locale,passed:false},errors=[];
  page.on('pageerror',e=>errors.push(e.message));let mode='ok',hits=0,socket,offline=false,gasWei='1000903',sequence=0;
  const chainId=prefix?763373:57073;
  const frame=()=>({type:'snapshot',protocol:'ink-observer.live.v1',sequence:++sequence,sentAt:new Date().toISOString(),network:{chainId,expectedChainId:chainId,head:123,online:!offline,synced:!offline,stale:offline,gasPriceWei:gasWei},blocks:[],transactions:[],block:null});
  await context.route('**/api/live/config',r=>r.fulfill({json:{url:base.replace(/^http/,'ws')+prefix+'/api/live'}}));
  await context.route('**/api/live/snapshot',r=>r.fulfill({json:frame()}));
  await context.routeWebSocket(/\/api\/live$/,ws=>{socket=ws;ws.send(JSON.stringify(frame()));});
  await context.route('**/api/explorer/transactions*',r=>r.fulfill({json:{items:[],next_page_params:null}}));
  await context.route('**/api/stats/counters',r=>{
   hits++;if(mode==='error')return r.fulfill({status:503,json:{error:'Data source unavailable'}});
   if(mode==='invalid')return r.fulfill({json:{counters:{}}});
   return r.fulfill({json:{counters:mode==='missing'?[null,{id:'newTxns24h',value:'bad'}]:[{id:'newTxns24h',value:mode==='zero'?'0':'123456'},{id:'txnsFee24h',units:'ETH',value:mode==='zero'?'0':'0.1417'},{id:'averageTxnFee24h',units:'ETH',value:mode==='zero'?'0':'0.000000307'}]}});
  });
  const values=()=>page.locator('.transaction-summary .metric > strong').allTextContents();
  const missing=()=>page.waitForFunction(()=>[...document.querySelectorAll('.transaction-summary .metric > strong')].length===3&&[...document.querySelectorAll('.transaction-summary .metric > strong')].every(e=>e.textContent==='N/A'));
  try{
   await page.clock.install();await page.goto(base+prefix+'/txs?lang='+locale,{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>document.querySelector('.transaction-summary')?.getAttribute('aria-busy')==='false'&&document.querySelector('.transaction-summary strong')?.textContent!=='N/A');
   assert.equal((await values()).length,3);assert((await values()).every(x=>x!=='N/A'));
   const gas=page.locator('.utility-market a[href*="gas-tracker"] span');await gas.waitFor();
   // Locale-specific punctuation is expected; the exact title keeps all digits.
   const gasText=await gas.innerText();assert(gasText.includes('Gwei'));assert.notEqual(gasText,await gas.getAttribute('title'));assert((await gas.getAttribute('title')).length>gasText.length);
   mode='error';await page.clock.fastForward(31000);await page.locator('.summary-retry').waitFor();await missing();
   const retry=page.locator('.summary-retry'),box=await retry.boundingBox();assert(box.width>=44&&box.height>=44);
   assert.equal(await page.locator('.transaction-summary strong[title]').count(),0);
   await page.screenshot({path:`${out}/${engine}-${prefix?'sepolia':'mainnet'}-${width}-unavailable.png`});
   mode='zero';await retry.click();await page.waitForFunction(()=>!document.querySelector('.summary-retry')&&document.querySelector('.transaction-summary')?.getAttribute('aria-busy')==='false');
   assert((await values()).every(x=>!x.includes('N/A')));assert((await values()).every(x=>/[0٠]/.test(x)));
   mode='invalid';await page.clock.fastForward(31000);await page.locator('.summary-retry').waitFor();await missing();
   mode='missing';await page.locator('.summary-retry').click();await page.waitForFunction(()=>!document.querySelector('.summary-retry')&&document.querySelector('.transaction-summary')?.getAttribute('aria-busy')==='false');await missing();assert.equal(await page.locator('.summary-retry').count(),0);
   mode='ok';await page.clock.fastForward(31000);await page.waitForFunction(()=>document.querySelector('.transaction-summary')?.getAttribute('aria-busy')==='false'&&document.querySelector('.transaction-summary strong')?.textContent!=='N/A');
   offline=true;socket.send(JSON.stringify(frame()));await page.waitForFunction(()=>document.querySelector('.utility-market a[href*="gas-tracker"] span')?.textContent==='N/A');assert.equal(await gas.getAttribute('title'),null);
   offline=false;gasWei='-1';socket.send(JSON.stringify(frame()));await page.waitForTimeout(100);assert.equal(await gas.innerText(),'N/A');assert.equal(await gas.getAttribute('title'),null);
   gasWei='1';socket.send(JSON.stringify(frame()));await page.waitForFunction(()=>document.querySelector('.utility-market a[href*="gas-tracker"] span')?.textContent!=='N/A');assert((await gas.innerText()).includes('Gwei'));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);
   await page.screenshot({path:`${out}/${engine}-${prefix?'sepolia':'mainnet'}-${width}.png`});Object.assign(row,{passed:true,hits,checks:['failed refresh clears values and exact titles','one-touch retry','zero stays zero','invalid response and missing counters','automatic recovery','concise gas and offline N/A','mobile and RTL overflow']});
  }catch(e){row.error=e.stack;}finally{await context.close();}
  results.push(row);console.log(JSON.stringify(row));await writeFile(out+'/results.json',JSON.stringify({base,complete:false,results},null,2));
 }}finally{await browser.close();}
}
await writeFile(out+'/results.json',JSON.stringify({base,complete:true,passed:results.every(x=>x.passed),physicalDeviceTest:false,results},null,2));if(results.some(x=>!x.passed))process.exitCode=1;
