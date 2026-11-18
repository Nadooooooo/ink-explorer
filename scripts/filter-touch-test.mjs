import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4310',out=process.env.FILTER_TOUCH_OUTPUT||'reports/filters/touch';await mkdir(out,{recursive:true});const results=[];
for(const[engine,launcher]of Object.entries({chromium,firefox,webkit})){
 const browser=await launcher.launch(engine==='chromium'?{args:['--no-sandbox']}:{});
 try{for(const prefix of['','/testnet'])for(const width of[320,390]){
  const context=await browser.newContext({viewport:{width,height:900},hasTouch:true}),page=await context.newPage(),row={engine,prefix,width,passed:false},errors=[];
  page.on('pageerror',e=>errors.push(e.message));await context.route('**/api/v1/transactions*',r=>r.fulfill({json:{items:[],next_page_params:null}}));await context.route('**/api/explorer/transactions*',r=>r.fulfill({json:{items:[],next_page_params:null}}));
  try{
   const params=new URLSearchParams({lang:'fr',activity:'filtered',status:'failed',methods:'0xa9059cbb',from_address_hashes_to_include:'0x'+'a'.repeat(40)});
   await page.goto(base+prefix+'/txs?'+params,{waitUntil:'domcontentloaded'});await page.locator('.filter-more').tap();await page.locator('dialog[open]').waitFor();
   await page.locator('dialog input[name="methods"]').tap();await page.setViewportSize({width,height:480});
   for(const button of await page.locator('dialog .activity-actions button,.filter-close').all()){const box=await button.boundingBox();assert(box.y>=0&&box.y+box.height<=480&&box.width>=44&&box.height>=44);}
   await page.locator('.filter-close').tap();await page.locator('dialog[open]').waitFor({state:'hidden'});assert(await page.locator('.filter-more').evaluate(el=>el===document.activeElement));
   await page.locator('.filter-trigger').tap();await page.locator('dialog select[name="status"]').selectOption('success');await page.locator('dialog button[type="submit"]').tap();await page.locator('dialog[open]').waitFor({state:'hidden'});assert.equal(new URL(page.url()).searchParams.get('status'),'success');
   await page.locator('.filter-reset').tap();await page.locator('.activity-ledger-transactions').waitFor();assert.equal(new URL(page.url()).searchParams.has('status'),false);assert.equal(await page.evaluate(()=>document.body.style.overflow),'');
   await page.locator('.filter-trigger').tap();await page.touchscreen.tap(2,2);await page.locator('dialog[open]').waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>document.body.style.overflow),'');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);row.passed=true;
  }catch(e){row.error=e.stack;}finally{await context.close();}
  results.push(row);console.log(JSON.stringify(row));await writeFile(out+'/results.json',JSON.stringify({base,complete:false,results},null,2));
 }}finally{await browser.close();}
}
await writeFile(out+'/results.json',JSON.stringify({base,complete:true,passed:results.every(r=>r.passed),physicalDeviceTest:false,results},null,2));if(results.some(r=>!r.passed))process.exitCode=1;
