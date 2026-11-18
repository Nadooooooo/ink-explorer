import assert from 'node:assert/strict';
import { chromium, firefox } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4323',out=process.env.HISTORY_LAYOUT_OUTPUT||'reports/ledger-history/layout';await mkdir(out,{recursive:true});const results=[];
const locales=['en','zh','hi','es','fr','ar','bn','pt','ru','ja'];
const address='0x'+'a'.repeat(40),hash='0x'+'b'.repeat(64),record={hash,height:100,block_number:100,timestamp:'2026-10-22T00:00:00Z',size:1000,miner:{hash:address},transactions_count:1,gas_limit:'10000',gas_used:'100',from:{hash:address},to:{hash:address},value:'0',fee:{value:'0'},status:'ok',method:'transfer'};
for(const [engine,launcher,langs,widths]of[['chromium',chromium,locales,[320]],['firefox',firefox,['fr','ar','hi','bn'],[320,1366]]]){
 const browser=await launcher.launch(engine==='chromium'?{args:['--no-sandbox']}:{firefoxUserPrefs:Object.fromEntries(['x-western','x-cyrillic','x-unicode','ar','ja','zh-CN','zh-HK','zh-TW','x-devanagari','x-beng'].map(group=>['font.minimum-size.'+group,24]))});
 try{for(const locale of langs)for(const width of widths){
  const context=await browser.newContext({viewport:{width,height:900},colorScheme:engine==='firefox'?'light':'dark'}),page=await context.newPage();
  await context.routeWebSocket(/\/api\/live$/,ws=>ws.close());await context.route(/\/api\/live\/snapshot/,route=>route.fulfill({status:503,json:{error:'Unavailable'}}));
  await context.route(/\/api\/(?:explorer\/(?:blocks|transactions)|v1\/transactions)(?:\?|$)/,route=>route.fulfill({json:{items:[record],next_page_params:{cursor:'two'}}}));
  for(const path of['blocks','txs','txs?status=failed']){const row={engine,locale,width,path,minimumFont:engine==='firefox'?24:0,passed:false};try{
   await page.goto(base+'/'+path+(path.includes('?')?'&':'?')+'lang='+locale,{waitUntil:'domcontentloaded'});await page.locator('.ledger-viewport .block-row,.ledger-viewport .full-tx-row').first().waitFor();await page.waitForFunction(()=>document.fonts.status==='loaded',{},{timeout:20000});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   row.geometry=await page.locator('.activity-ledger-page .ledger-top-pagination').evaluateAll(nodes=>nodes.map(nav=>{const bounds=nav.getBoundingClientRect();return {left:bounds.left,right:bounds.right,buttons:[...nav.querySelectorAll('button')].map(button=>{const b=button.getBoundingClientRect();return {left:b.left,right:b.right,width:b.width,height:b.height,label:button.getAttribute('aria-label')};})};}));
   for(const nav of row.geometry){assert(nav.left>=-1&&nav.right<=width+1);assert.equal(nav.buttons.length,3);for(const button of nav.buttons)assert(button.width>=44&&button.height>=44&&button.label);}
   const footer=page.locator('.ledger-pagination-footer');assert(await footer.isVisible());assert((await footer.innerText()).trim());
   await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`${out}/${engine}-${locale}-${width}-${path.replace('?','-')}.png`});row.passed=true;
  }catch(error){row.error=error.stack;await page.screenshot({path:`${out}/failure-${engine}-${locale}-${width}-${path.replace('?','-')}.png`}).catch(()=>{});}results.push(row);console.log(JSON.stringify(row));}
  await context.close();
 }}finally{await browser.close();}
}
await writeFile(out+'/results.json',JSON.stringify({base,complete:true,passed:results.every(row=>row.passed),results},null,2));if(results.some(row=>!row.passed))process.exitCode=1;
