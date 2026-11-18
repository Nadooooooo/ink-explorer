import assert from 'node:assert/strict';
import { chromium, firefox, webkit } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4323',out=process.env.HISTORY_OUTPUT||'reports/ledger-history/browser';
await mkdir(out,{recursive:true});
const hash=n=>'0x'+n.toString(16).padStart(64,'0'),address='0x'+'a'.repeat(40);
const tx=n=>({hash:hash(n),block_number:n,timestamp:'2026-10-22T00:00:00Z',status:'error',from:{hash:address},to:{hash:address,is_contract:true},value:'0',fee:{value:'100'},transaction_types:['contract_call'],method:'transfer'});
const block=n=>({hash:hash(n),height:n,timestamp:'2026-10-22T00:00:00Z',size:1234,miner:{hash:address},transactions_count:2,gas_limit:'1000000',gas_used:'1000'});
const axe=await readFile('node_modules/axe-core/axe.min.js','utf8'),results=[];
for(const [engine,launcher]of Object.entries({chromium,firefox,webkit}).filter(([name])=>!process.env.HISTORY_ENGINES||process.env.HISTORY_ENGINES.split(',').includes(name))){
 const browser=await launcher.launch(engine==='chromium'?{args:['--no-sandbox']}:{});
 try{for(const prefix of['','/testnet'])for(const width of[320,1440]){
  const locale=width===320?'fr':'ar',context=await browser.newContext({viewport:{width,height:900},colorScheme:prefix?'light':'dark',hasTouch:width===320}),page=await context.newPage();
  page.setDefaultTimeout(12000);
  const row={engine,prefix,width,locale,passed:false},errors=[],requests=[];let failure=false,hold=false,release;
  page.on('pageerror',error=>errors.push(error.message));
  await context.routeWebSocket(/\/api\/live$/,ws=>ws.close());
  await context.route(/\/api\/live\/snapshot/,r=>r.fulfill({status:503,json:{error:'Controlled offline snapshot'}}));
  await context.route(/\/api\/(?:explorer\/(?:transactions|blocks)|v1\/transactions)(?:\?|$)/,async route=>{
   const u=new URL(route.request().url()),cursor=u.searchParams.get('cursor')||'first',index=cursor==='first'?1:cursor==='opaque%/second:page'?2:3;
   requests.push({path:u.pathname,cursor,status:u.searchParams.get('status'),type:u.searchParams.get('type')});
   if(hold&&index===3)await new Promise(resolve=>release=resolve);
   if(failure&&index===3)return route.fulfill({status:503,json:{error:'Controlled page failure'}});
   return route.fulfill({json:{items:[u.pathname.endsWith('/blocks')?block(index*100):tx(index*100)],next_page_params:index===3?null:{cursor:index===1?'opaque%/second:page':'opaque/third%:page'}}}).catch(()=>{});
  });
  try{for(const path of['blocks','txs','txs?status=failed']){
   failure=false;hold=false;const start=requests.length;
   await page.goto(base+prefix+'/'+path+(path.includes('?')?'&':'?')+'lang='+locale,{waitUntil:'domcontentloaded'});
   const top=page.locator('.table-toolbar .ledger-top-pagination'),bottom=page.locator('.activity-ledger-page .pagination');
   const ready=async index=>{
    const target=path==='blocks'?`/block/${index*100}`:`/tx/${hash(index*100)}`;
    await page.locator(`.ledger-viewport a[href*="${target}"]`).first().waitFor();
    if(path.includes('status')&&new URL(page.url()).searchParams.has('status'))await page.locator('.filtered-activity .table-shell[aria-busy="false"]').waitFor();
   };
   await ready(1);const navigationStart=requests.length;assert.equal(await top.locator('button').count(),3);
   assert(await top.locator('button').nth(0).isDisabled());assert(await top.locator('button').nth(1).isDisabled());
   await top.locator('button').nth(2).click();await ready(2);
   hold=true;await top.locator('button').nth(2).click();
   await page.waitForFunction(()=>[...document.querySelectorAll('.table-toolbar .ledger-top-pagination button')].every(button=>button.disabled));
   while(!release)await new Promise(resolve=>setTimeout(resolve,5));release();release=undefined;hold=false;await ready(3);
   assert(await top.locator('button').nth(2).isDisabled());assert(await top.locator('button').nth(1).isEnabled());
   await top.locator('button').nth(1).click();await ready(2);
   await bottom.locator('button').nth(1).click();await ready(1);
   assert(await top.locator('button').nth(1).isDisabled());
   await bottom.locator('button').nth(2).click();await ready(2);
   await bottom.locator('button').nth(2).click();await ready(3);
   await top.locator('button').nth(0).click();await ready(1);
   assert.deepEqual(requests.slice(navigationStart).map(request=>request.cursor),['opaque%/second:page','opaque/third%:page','opaque%/second:page','first','opaque%/second:page','opaque/third%:page','first']);
   // A failed next page must retain the path back, without showing the old page as the new one.
   await top.locator('button').nth(2).click();await ready(2);failure=true;
   await top.locator('button').nth(2).click();await page.locator('main [role="alert"]').first().waitFor();
   assert(await top.locator('button').nth(2).isDisabled());assert(await top.locator('button').nth(1).isEnabled());
   assert.equal(await page.locator('.ledger-viewport a[href*="/tx/"],.ledger-viewport .block-height a').count(),0);
   failure=false;await top.locator('button').nth(1).click();await ready(2);
   if(path==='blocks'){
    await page.locator('.ledger-filters select').selectOption('reorg');await page.locator('.forked-block-hash').first().waitFor();
    assert.equal(requests.at(-1).type,'reorg');assert(await top.locator('button').nth(1).isDisabled());
   }else if(path.includes('status')){
    assert(requests.slice(start).every(request=>request.status==='failed'));
    await page.locator('.filter-reset').click();await ready(1);assert(await top.locator('button').nth(1).isDisabled());
   }
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   for(const control of[...await top.locator('button').all(),...await bottom.locator('button').all()]){
    const b=await control.boundingBox();assert(b.width>=44&&b.height>=44,JSON.stringify(b));
    assert(b.x>=-1&&b.x+b.width<=width+1,'Pagination control outside screen');
   }
   await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`${out}/${engine}-${prefix?'sepolia':'mainnet'}-${width}-${path.replace('?','-')}.png`});
   await page.evaluate(axe);const violations=await page.evaluate(async()=>{const result=await axe.run('.activity-ledger-page',{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return result.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}));});assert.deepEqual(violations,[]);
  }
  assert.deepEqual(errors,[]);assert(requests.every(request=>request.path.startsWith(prefix+'/api/')));row.passed=true;
  }catch(error){row.error=error.stack;row.requests=requests;await page.screenshot({path:`${out}/failure-${engine}-${prefix?'sepolia':'mainnet'}-${width}.png`}).catch(()=>{});}
  results.push(row);console.log(JSON.stringify(row));await context.close();
 }}finally{await browser.close();}
}
await writeFile(out+'/results.json',JSON.stringify({base,complete:true,passed:results.every(row=>row.passed),physicalDeviceTest:false,results},null,2));
if(results.some(row=>!row.passed))process.exitCode=1;
