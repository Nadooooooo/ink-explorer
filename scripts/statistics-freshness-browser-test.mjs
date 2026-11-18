import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4310',out=process.env.STAT_FRESH_OUTPUT||'reports/stat-freshness/browser',baseline=process.env.STAT_FRESH_BASELINE==='1';
const sources=JSON.parse(await readFile('reports/stat-freshness/sources.json','utf8')),axe=await readFile('node_modules/axe-core/axe.min.js','utf8'),results=[];
await mkdir(out,{recursive:true});
for(const engine of(process.env.STAT_FRESH_ENGINES||'chromium,firefox,webkit').split(',')){
 const browser=await({chromium,firefox,webkit})[engine].launch(engine==='chromium'?{args:['--no-sandbox']}:{});
 try{for(const prefix of(process.env.STAT_FRESH_MAIN_ONLY==='1'?['']:['','/testnet']))for(const width of(process.env.STAT_FRESH_WIDTHS||'390,1440').split(',').map(Number)){
  const locale=width<500?'fr':'ar',context=await browser.newContext({viewport:{width,height:844},hasTouch:width<500,...(engine!=='firefox'?{isMobile:width<500}:{}),bypassCSP:true}),page=await context.newPage(),errors=[],row={engine,prefix,width,locale,baseline,passed:false};
  page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(12000);
  let now=Date.now(),counterMode='fresh',gasMode='fresh',counterCalls=0,gasCalls=0,counterVersion=10000,held=[];
  const source=sources[prefix?'sepolia':'mainnet'],t=JSON.parse(await readFile(`src/locales/${locale}.json`,'utf8'));
  const counters=()=>({counters:source.counters.counters.map(c=>({...c,value:c.id==='newTxns24h'?String(counterVersion):c.value}))});
  const headers=(mode)=>({'x-ink-data-status':mode==='stale'?'stale':'fresh','x-ink-data-fetched-at':new Date(now-(mode==='old'?180000:mode==='aging'?75000:0)).toISOString(),date:new Date(now).toUTCString()});
  await context.routeWebSocket(/\/api\/live$/,ws=>ws.close());
  await context.route('**/api/**',async route=>{
   const path=new URL(route.request().url()).pathname.replace(/^\/testnet/,'');
   if(path==='/api/live/config')return route.fulfill({json:{url:base.replace(/^http/,'ws')+prefix+'/api/live'}});
   if(path==='/api/live/snapshot')return route.fulfill({status:503,json:{error:'Controlled fixture offline'}});
   if(path==='/api/stats/counters'){
    counterCalls++;const mode=counterMode;
    if(mode==='hold'){held.push(route);return;}
    if(mode==='error')return route.fulfill({status:503,json:{error:'Data source unavailable'}});
    const value=counters();
    if(mode==='malformed')return route.fulfill({headers:headers(mode),json:{counters:[null]}});
    if(mode==='empty')return route.fulfill({headers:headers(mode),json:{counters:[]}});
    if(mode==='partial'){value.counters.find(c=>c.id==='newTxns24h').value='0';value.counters.find(c=>c.id==='totalAddresses').value=true;value.counters=value.counters.filter(c=>c.id!=='totalTokens');}
    return route.fulfill({headers:mode==='undated'?{}:headers(mode),json:value});
   }
   if(path==='/api/stats/lines')return route.fulfill({json:source.lines});
   if(path.startsWith('/api/stats/lines/'))return route.fulfill({json:{chart:[{date:'2026-10-17',value:'1'},{date:'2026-10-18',value:'2'}]}});
   if(path==='/api/explorer/stats'){
    gasCalls++;
    if(gasMode==='error')return route.fulfill({status:503,json:{error:'Data source unavailable'}});
    const data={coin_price:'2400',gas_price_updated_at:new Date(now-(gasMode==='old-oracle'?180000:0)).toISOString(),gas_prices:{slow:{wei:'1',time:5000},average:{wei:'234567',time:3000},fast:{wei:'345678',time:1000}}};
    if(gasMode==='partial'){data.gas_prices.slow={wei:'',price:45,time:-1};data.gas_prices.average={wei:'0',time:0};}
    return route.fulfill({headers:headers(gasMode),json:data});
   }
   if(path==='/api/overview')return route.fulfill({headers:headers('fresh'),json:{stats:{total_addresses:'12345'},blocks:[],transactions:[],chart:[]}});
   return route.fulfill({json:{items:[],next_page_params:null}});
  });
  const tick=async ms=>{now+=ms;await page.clock.fastForward(ms);};
  const cards=page.locator('.stats-counters article'),first=cards.first().locator('strong'),retry=page.locator('.counter-source-state .statistics-retry');
  const settled=()=>page.waitForFunction(()=>[...document.querySelectorAll('.stats-counters article strong')].every(e=>e.textContent==='N/A'));
  const refresh=async mode=>{counterMode=mode;const before=counterCalls;await tick(30001);await page.waitForFunction(()=>document.querySelector('.statistics-page')!=null);await page.waitForTimeout(70);assert(counterCalls>before);};
  try{
   await page.clock.install({time:new Date(now)});await page.goto(base+prefix+'/stats?lang='+locale,{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>document.querySelector('.stats-counters article strong')?.getAttribute('title')==='10000');
   await refresh('error');
   if(baseline){await page.locator('.stats-counters [role="status"]').waitFor();row.retainedTitles=await cards.locator('strong[title]').count();assert(row.retainedTitles>0);await page.screenshot({path:`${out}/retained-stale-counters.png`});row.passed=true;}
   else{
    await settled();assert.equal(await cards.count(),18);assert.equal(await cards.locator('strong[title]').count(),0);assert.equal(await cards.locator('strong small').count(),0);await retry.waitFor();
    await retry.scrollIntoViewIfNeeded();const box=await retry.boundingBox();assert(box.width>=44&&box.height>=44);
    await page.screenshot({path:`${out}/${engine}-${prefix?'sepolia':'mainnet'}-${width}-unavailable.png`});
    counterMode='fresh';counterVersion=20000;await retry.focus();await retry.press('Enter');await page.waitForFunction(()=>document.querySelector('.stats-counters article strong')?.getAttribute('title')==='20000');await page.waitForFunction(()=>document.activeElement?.id==='main-content');
    await refresh('hold');await tick(20001);await settled();await retry.waitFor();assert.equal(await retry.isDisabled(),false);
    counterMode='fresh';counterVersion=25000;await retry.click();await page.waitForFunction(()=>document.querySelector('.stats-counters article strong')?.getAttribute('title')==='25000');
    for(const route of held.splice(0))await route.fulfill({headers:headers('fresh'),json:{counters:source.counters.counters}}).catch(()=>{});row.timeout=true;
    for(const mode of ['malformed','empty','stale','old','undated']){await refresh(mode);await settled();row[mode]=true;}
    await refresh('partial');await page.waitForFunction(()=>document.querySelector('.stats-counters article strong')?.getAttribute('title')==='0');
    for(const title of['Total addresses','Total tokens']){const card=cards.filter({has:page.getByRole('button',{name:t[title],exact:true})});assert.equal(await card.locator('strong').innerText(),'N/A');}
    assert.equal(await cards.count(),18);row.partial=true;
    await refresh('aging');await page.waitForFunction(()=>document.querySelector('.stats-counters article strong')?.getAttribute('title')==='25000');await tick(15001);await settled();row.expiration=true;
    counterMode='fresh';counterVersion=30000;await refresh('fresh');await page.waitForFunction(()=>document.querySelector('.stats-counters article strong')?.getAttribute('title')==='30000');
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
    const before=counterCalls;await tick(120000);assert.equal(counterCalls,before,'Hidden pages must suspend polling');
    counterMode='hold';await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});await settled();
    await page.waitForTimeout(70);assert.equal(counterCalls,before+1);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));assert.equal(counterCalls,before+1,'A resumed request must not overlap another request');
    await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));counterMode='fresh';counterVersion=40000;
    await page.evaluate(()=>window.dispatchEvent(new Event('pageshow')));await page.waitForFunction(()=>document.querySelector('.stats-counters article strong')?.getAttribute('title')==='40000');
    for(const route of held.splice(0))await route.fulfill({headers:headers('fresh'),json:{counters:source.counters.counters}}).catch(()=>{});
    await page.waitForTimeout(70);assert.equal(await first.getAttribute('title'),'40000');row.lifecycle=true;
    await page.evaluate(()=>window.dispatchEvent(new Event('offline')));await settled();counterVersion=50000;await page.evaluate(()=>window.dispatchEvent(new Event('online')));await page.waitForFunction(()=>document.querySelector('.stats-counters article strong')?.getAttribute('title')==='50000');row.offline=true;
    // Same current-value contract is used by the homepage and transaction summaries.
    for(const path of['','txs']){
     counterMode='fresh';await page.goto(base+prefix+'/'+path+'?lang='+locale,{waitUntil:'domcontentloaded'});
     const values=page.locator(path?'.transaction-summary .metric > strong':'.home-overview .metric-grid .metric').nth(path?0:1);
     await page.waitForFunction(selector=>{const element=document.querySelector(selector);return !!element&&!element.textContent.includes('N/A');},path?'.transaction-summary .metric > strong':'.home-overview .metric-grid .metric:nth-child(2) strong');
     counterMode='error';await tick(30001);await page.waitForFunction(selector=>document.querySelector(selector)?.textContent?.includes('N/A'),path?'.transaction-summary .metric > strong':'.home-overview .metric-grid .metric:nth-child(2) strong');assert((await values.innerText()).includes('N/A'));
    }
    counterMode='fresh';gasMode='fresh';await page.goto(base+prefix+'/gas-tracker?lang='+locale,{waitUntil:'domcontentloaded'});
    const gas=page.locator('.gas-estimates article strong');await page.waitForFunction(()=>document.querySelector('.gas-estimates article strong')?.textContent?.includes('Gwei'));
    for(const mode of['error','stale','old-oracle']){gasMode=mode;const before=gasCalls;await tick(30001);await page.waitForFunction(()=>[...document.querySelectorAll('.gas-estimates article strong')].every(e=>e.textContent==='N/A'));assert(gasCalls>before);row['gas-'+mode]=true;}
    gasMode='partial';await page.locator('.gas-estimates-title .statistics-retry').click();await page.waitForFunction(()=>document.querySelectorAll('.gas-estimates article strong')[1]?.textContent?.includes('Gwei'));assert.equal(await gas.first().innerText(),'N/A');assert((await gas.nth(1).innerText()).includes('0'));assert.equal(await gas.first().locator('small').count(),0);
    gasMode='fresh';await tick(30001);await page.waitForFunction(()=>document.querySelector('.gas-estimates article strong')?.textContent?.includes('Gwei'));assert.equal(await page.locator('.gas-estimates-title .statistics-retry').count(),0);
    await page.evaluate(axe);row.violations=await page.evaluate(async()=>(await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})));assert.deepEqual(row.violations,[]);assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);row.passed=true;
   }
  }catch(error){row.error=error.stack;await page.screenshot({path:`${out}/failure-${engine}-${prefix?'sepolia':'mainnet'}-${width}.png`}).catch(()=>{});}
  finally{await context.close();}
  results.push(row);console.log(JSON.stringify(row));await writeFile(out+'/results.json',JSON.stringify({base,complete:false,results},null,2));
 }}finally{await browser.close();}
}
await writeFile(out+'/results.json',JSON.stringify({base,complete:true,passed:results.every(r=>r.passed),mockedApi:true,physicalDeviceTest:false,results},null,2));if(results.some(r=>!r.passed))process.exitCode=1;
