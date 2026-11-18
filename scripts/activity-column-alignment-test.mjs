import assert from'node:assert/strict';import{chromium,firefox,webkit}from'playwright-core';import{mkdir,readFile,writeFile}from'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4311',out=process.env.COLUMN_OUTPUT||'reports/ledger-layout/columns',baseline=process.env.COLUMN_BASELINE==='1';await mkdir(out,{recursive:true});
const sources=JSON.parse(await readFile(process.env.ACTIVITY_SOURCES||'reports/ledger-layout/sources.json')),results=[];
for(const engine of(process.env.COLUMN_ENGINES||'chromium,firefox,webkit').split(',')){
 const browser=await({chromium,firefox,webkit})[engine].launch(engine==='chromium'?{args:['--no-sandbox']}:{});
 for(const prefix of['','/testnet'])for(const width of(process.env.COLUMN_WIDTHS||'320,390,768,900,1101,1440').split(',').map(Number))for(const route of(process.env.COLUMN_ROUTES||'blocks,txs').split(',')){
  const locale=width===320?'fr':width===900?'ar':'en',source=sources[prefix?'sepolia':'mainnet'];const p=await browser.newPage({viewport:{width,height:900},hasTouch:width<1101,colorScheme:width===390?'light':'dark',bypassCSP:true}),r={engine,prefix,width,locale,route,baseline,passed:false};
  const block={...source.block,miner:{hash:'0x'+'1'.repeat(40),is_contract:true,is_verified:true,name:'Ink sequencer fee vault with a long readable contract name'}};
  const tx={...source.transaction,from:block.miner,to:{hash:'0x'+'2'.repeat(40)},status:'error',method:'swapExactTokensForTokens'};
  await p.routeWebSocket(/\/api\/live$/,socket=>socket.close());await p.route('**/api/live/snapshot',r=>r.fulfill({status:503,json:{error:'Controlled unavailable live feed'}}));
  await p.route(/\/api\/explorer\/(blocks|transactions)(?:\?|$)/,r=>r.fulfill({json:{items:Array.from({length:3},()=>route==='blocks'?block:tx),next_page_params:null}}));
  try{
   await p.goto(base+prefix+'/'+route+'?lang='+locale,{waitUntil:'domcontentloaded'});const record=p.locator(route==='blocks'?'.block-list .block-row':'.full-tx-row').first(),header=p.locator('.ledger-columns');await record.waitFor();await p.evaluate(()=>document.fonts.ready);
   r.height=(await record.boundingBox()).height;r.headerVisible=await header.isVisible();
   if(r.headerVisible){
    const selectors=route==='blocks'?['.block-height',':scope > div:nth-child(2)','.block-beneficiary','.block-tx-count','.block-gas']:['.tx-primary',':scope > .method','.tx-block','.flow-party:first-child','.flow-party:last-child','.tx-value > strong','.tx-fee'];
    const cells=await Promise.all(selectors.map(s=>record.locator(s).evaluate(e=>({x:e.getBoundingClientRect().x,w:e.getBoundingClientRect().width}))));
    const headings=await header.locator(':scope > span').evaluateAll(es=>es.map(e=>({x:e.getBoundingClientRect().x,w:e.getBoundingClientRect().width})));
    r.offsets=cells.map((b,i)=>({x:b.x-headings[i].x,width:b.w-headings[i].w}));const aligned=r.offsets.every(o=>Math.abs(o.x)<=1&&Math.abs(o.width)<=1);
    if(baseline)assert(!aligned,'Expected to reproduce existing column drift');else assert(aligned,'Column heading and value use different cell geometry');
   }
   assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Document overflow');
   if(!baseline){r.fieldBounds=await record.evaluate(el=>{const b=el.getBoundingClientRect();return[...el.querySelectorAll('.block-height,.block-beneficiary,.block-size,.block-tx-count,.block-gas,.tx-primary,.flow-party,.tx-value,.method,.tx-block')].filter(x=>x.getBoundingClientRect().width>1).map(x=>{const r=x.getBoundingClientRect();return{text:x.textContent,inside:r.left>=b.left-1&&r.right<=b.right+1};});});assert(r.fieldBounds.every(x=>x.inside),'A field escapes its row');
    if(route==='blocks'){
     const labels=await record.locator('.block-size > small,.block-beneficiary > small,.block-tx-count > small,.block-gas > small').evaluateAll(es=>es.map(e=>({text:e.textContent,available:getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden'})));assert(labels.length===4&&labels.every(e=>e.available),'A block field has no accessible label');
     const meter=record.getByRole('meter');assert(await meter.isVisible());assert.equal(Number(await meter.getAttribute('aria-valuenow')),Number(block.gas_used)/Number(block.gas_limit)*100);assert(await record.locator('.block-tx-count').isVisible());
     const copy=record.locator('.block-beneficiary .copy-button');await copy.scrollIntoViewIfNeeded();if(width<=760){const b=await copy.boundingBox();assert(b.width>=44&&b.height>=44);}assert.equal(await record.locator('.block-beneficiary a').getAttribute('title'),block.miner.hash);
    }
   }
   await record.scrollIntoViewIfNeeded();await p.screenshot({path:`${out}/${engine}-${prefix?'sepolia':'mainnet'}-${width}-${route}.png`});r.passed=true;
  }catch(error){r.error=error.stack;}await p.close();results.push(r);console.log(JSON.stringify({engine,prefix,width,route,passed:r.passed,error:r.error}));await writeFile(out+'/results.json',JSON.stringify({base,baseline,complete:false,results},null,2));
 }
 await browser.close();
}
await writeFile(out+'/results.json',JSON.stringify({base,baseline,complete:true,passed:results.every(r=>r.passed),mockedApi:true,physicalDeviceTest:false,results},null,2));if(results.some(r=>!r.passed))process.exitCode=1;
