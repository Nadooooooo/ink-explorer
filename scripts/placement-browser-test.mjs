import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright-core';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4311',out=process.env.PLACEMENT_OUTPUT||'reports/placement/browser';await mkdir(out,{recursive:true});
const hash=n=>'0x'+n.toString(16).padStart(64,'0'),address=n=>'0x'+n.toString(16).padStart(40,'0');
const entity=(n)=>({hash:address(n),is_contract:n===2,is_verified:n===2,proxy_type:n===2?'eip1967':undefined,name:n===2?'Ink bridge with a long contract name':null});
const tx=n=>({hash:hash(n),block_number:n,timestamp:new Date(Date.now()-15000).toISOString(),status:n%2?'ok':'error',from:entity(1),to:entity(2),value:'12345000000000000',fee:{value:'12345678901'},transaction_types:['contract_call'],method:'transferWithAuthorization'});
const block=n=>({hash:hash(n),height:n,timestamp:new Date(Date.now()-15000).toISOString(),size:5300,miner:entity(2),transactions_count:42,gas_limit:'100000000',gas_used:'42000000'});
const results=[],axe=await readFile('node_modules/axe-core/axe.min.js','utf8');
for(const [engine,launch] of Object.entries({chromium,firefox,webkit}).filter(([k])=>!process.env.PLACEMENT_ENGINES||process.env.PLACEMENT_ENGINES.split(',').includes(k))){
 const browser=await launch.launch(engine==='chromium'?{args:['--no-sandbox']}:{});
 try{for(const prefix of ['','/testnet'])for(const[width,locale,theme]of[[320,'fr','light'],[390,'en','dark'],[768,'ar','dark'],[1440,'fr','light']]){
  const context=await browser.newContext({viewport:{width,height:900},colorScheme:theme,hasTouch:width<900,bypassCSP:true,acceptDownloads:true});const page=await context.newPage(),errors=[],row={engine,prefix,width,locale,theme,passed:false};page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  await context.addInitScript(()=>{window.copied=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>window.copied.push(value)}});});
  await context.routeWebSocket(/\/api\/live$/,ws=>ws.close());
  await context.route('**/api/live/snapshot',r=>r.fulfill({json:{type:'snapshot',protocol:'ink-observer.live.v1',sequence:1,network:{chainId:prefix?763373:57073,expectedChainId:prefix?763373:57073,online:false,synced:false,stale:true},blocks:[],transactions:[]}}));
  await context.route('**/api/explorer/transactions*',route=>{const next=new URL(route.request().url()).searchParams.has('cursor');return route.fulfill({json:{items:Array.from({length:6},(_,i)=>tx((next?10:100)+i)),next_page_params:next?null:{cursor:100}}});});
  await context.route('**/api/explorer/blocks*',route=>{const u=new URL(route.request().url()),next=u.searchParams.has('cursor');return route.fulfill({json:{items:Array.from({length:6},(_,i)=>({...block((next?10:100)+i),type:u.searchParams.get('type')==='reorg'?'reorg':'block'})),next_page_params:next?null:{cursor:100}}});});
  await context.route('**/api/v1/transactions*',route=>{const next=new URL(route.request().url()).searchParams.has('cursor');return route.fulfill({json:{items:[tx(next?10:100)],next_page_params:next?null:{cursor:100}}});});
  try{
   for(const route of ['txs','blocks','txs?status=failed']){
    await page.goto(base+prefix+'/'+route+(route.includes('?')?'&':'?')+'lang='+locale,{waitUntil:'domcontentloaded'});
    const viewport=page.locator('.ledger-viewport'),record=viewport.locator('.full-tx-row,.block-row').first(),heading=viewport.locator('.ledger-columns');await record.waitFor();await page.evaluate(()=>document.fonts.ready);
    assert(await heading.isVisible(),'Column headings missing');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'Page overflow');
    const before=await record.boundingBox();assert(before.height<=100,`Oversized row ${before.height}`);
    const primary=record.locator('.tx-primary,.block-height').first();
    await viewport.evaluate(e=>e.scrollLeft=document.dir==='rtl'?-250:250);await page.waitForTimeout(50);const first=await primary.boundingBox();
    await viewport.evaluate(e=>e.scrollLeft=document.dir==='rtl'?-450:450);await page.waitForTimeout(50);const second=await primary.boundingBox();
    if(width>=600&&width<1300)assert(Math.abs(first.x-second.x)<1,'Frozen anchor moved');
    if(width<600)assert(Math.abs(first.x-second.x)>100,'Frozen column obscures phone');
    const link=record.locator('.block-beneficiary .text-link,.flow-party .text-link').last();await link.focus();const box=await link.boundingBox(),bounds=await viewport.boundingBox();assert(box.x>=bounds.x-1&&box.x+box.width<=bounds.x+bounds.width+1,'Keyboard destination clipped');
    await record.locator('.block-beneficiary .copy-button,.flow-party .copy-button').last().click();assert.equal(await page.evaluate(()=>window.copied.at(-1)),address(2));
    const copyBoxes=await record.locator('.copy-button').evaluateAll(nodes=>nodes.map(e=>({w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height})));assert(copyBoxes.every(x=>x.w>=44&&x.h>=44),JSON.stringify(copyBoxes));
    await viewport.evaluate(e=>e.scrollLeft=0);
    const top=page.locator('.ledger-top-pagination');assert(await top.locator('button').first().isDisabled());await top.locator('button').last().click();await page.waitForFunction(()=>{const e=document.querySelector('.ledger-viewport a[href*="/tx/"],.ledger-viewport a[href*="/block/"]');const path=e?new URL(e.href).pathname:'';return path.endsWith('a')||path.endsWith('/10');});
    await page.waitForFunction(()=>document.querySelector('.ledger-top-pagination button:last-child')?.disabled);assert(await top.locator('button').last().isDisabled());await top.locator('button').first().click();await page.waitForFunction(()=>document.querySelector('.ledger-top-pagination button:first-child')?.disabled);
    if(route==='blocks'){
      await page.locator('.ledger-filters select').selectOption('reorg');await page.locator('.forked-block-hash').first().waitFor();assert(await page.locator('.forked-block-icon').first().isVisible());await viewport.evaluate(e=>e.scrollLeft=0);const forked=await record.boundingBox();assert(forked.height<140);
    }
    await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`${out}/${engine}-${prefix?'sepolia':'mainnet'}-${width}-${route.replace('?','-')}.png`});
    if(route==='txs'){await page.evaluate(axe);const v=await page.evaluate(async()=>(await axe.run('main',{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})));assert.deepEqual(v,[]);}
   }
   assert.deepEqual(errors,[]);row.passed=true;
  }catch(error){row.error=error.stack;await page.screenshot({path:`${out}/failure-${engine}-${prefix?'sepolia':'mainnet'}-${width}.png`}).catch(()=>{});}
  results.push(row);console.log(JSON.stringify(row));await writeFile(out+'/results.json',JSON.stringify({base,complete:false,results},null,2));await context.close();
 }}finally{await browser.close();}
}
await writeFile(out+'/results.json',JSON.stringify({base,complete:true,passed:results.every(r=>r.passed),physicalDevices:false,results},null,2));if(results.some(r=>!r.passed))process.exitCode=1;
