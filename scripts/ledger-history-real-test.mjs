import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4323',out=process.env.HISTORY_REAL_OUTPUT||'reports/ledger-history/real';
await mkdir(out,{recursive:true});const results=[];
for(const [engine,launcher,widths]of[['chromium',chromium,[390,1440]],['webkit',webkit,[390]]]){
 const browser=await launcher.launch(engine==='chromium'?{args:['--no-sandbox']}:{});
 try{for(const prefix of['','/testnet'])for(const width of widths)for(const route of['blocks','txs','txs?status=failed']){
  const page=await browser.newPage({viewport:{width,height:900},colorScheme:'dark'}),row={engine,prefix,width,route,passed:false},errors=[];
  page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(45000);
  const endpoint=prefix+'/api/'+(route.includes('status')?'v1/transactions':route==='blocks'?'explorer/blocks':'explorer/transactions');
  const load=async action=>{
   const responsePromise=page.waitForResponse(response=>new URL(response.url()).pathname===endpoint);
   await action();const response=await responsePromise;assert.equal(response.status(),200);const body=await response.json();assert(Array.isArray(body.items));
   if(route.includes('status'))await page.locator('.filtered-activity .table-shell[aria-busy="false"]').waitFor();else await page.locator('.ledger-viewport').waitFor();
   return {url:response.url(),ids:body.items.map(item=>item.hash||item.transaction_hash),count:body.items.length};
  };
  try{
   const first=await load(()=>page.goto(base+prefix+'/'+route+(route.includes('?')?'&':'?')+'lang=fr',{waitUntil:'domcontentloaded'}));const top=page.locator('.table-toolbar .ledger-top-pagination');
   assert(await top.locator('button').nth(1).isDisabled());
   const second=await load(()=>top.locator('button').nth(2).click());assert.notEqual(second.url,first.url);
   const third=await load(()=>top.locator('button').nth(2).click());assert.notEqual(third.url,second.url);
   const restored=await load(()=>top.locator('button').nth(1).click());assert.equal(restored.url,second.url);assert.deepEqual(restored.ids,second.ids);
   row.restoredRows=restored.count;row.emptyPagesSupported=second.count===0||third.count===0;
   assert.equal(await page.locator('main [role="alert"]').count(),0);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`${out}/${engine}-${prefix?'sepolia':'mainnet'}-${width}-${route.replace('?','-')}.png`});
   const reset=await load(()=>top.locator('button').nth(0).click());assert.equal(reset.url,first.url);assert(await top.locator('button').nth(1).isDisabled());
   assert.deepEqual(errors,[]);row.passed=true;
  }catch(error){row.error=error.stack;await page.screenshot({path:`${out}/failure-${engine}-${prefix?'sepolia':'mainnet'}-${width}-${route.replace('?','-')}.png`}).catch(()=>{});}
  results.push(row);console.log(JSON.stringify(row));await page.close();
 }}finally{await browser.close();}
}
await writeFile(out+'/results.json',JSON.stringify({base,complete:true,passed:results.every(row=>row.passed),realApi:true,physicalDeviceTest:false,results},null,2));if(results.some(row=>!row.passed))process.exitCode=1;
