import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4311',out=process.env.PAGE_RESOURCE_OUTPUT||'reports/chart-lifecycle/resources',results=[];
const stamp=n=>new Date(n).toISOString().slice(0,10),day=86400000;
await mkdir(out,{recursive:true});
for(const engine of(process.env.PAGE_RESOURCE_ENGINES||'chromium,firefox,webkit').split(',')){
 const browser=await({chromium,firefox,webkit})[engine].launch(engine==='chromium'?{args:['--no-sandbox']}:{});
 try{for(const prefix of['','/testnet'])for(const width of[390,1440])for(const kind of['home','catalogue']){
  const context=await browser.newContext({viewport:{width,height:900},bypassCSP:true}),page=await context.newPage(),row={engine,prefix,width,kind,passed:false,checks:[]};page.setDefaultTimeout(12000);
  let now=Date.now(),version=100,mode=kind==='catalogue'?'hold':'fresh',calls=0,held=[];
  const info=id=>({id,title:id==='newTxns'?'New transactions':'New accounts',description:'Daily observations',units:null,resolutions:['DAY']});
  const freshHeaders=()=>({date:new Date(now).toUTCString(),'x-ink-data-status':'fresh','x-ink-data-fetched-at':new Date(now).toISOString()});
  const payload=()=>kind==='home'?{stats:{total_addresses:String(version)},blocks:[],transactions:[],chart:[-2,-1,0].map(offset=>({date:stamp(now+offset*day),transactions_count:version}))}:{sections:[{id:'transactions',title:'Transactions',charts:[info(mode==='hold'?'newAccounts':'newTxns')]}]};
  await context.routeWebSocket(/\/api\/live$/,ws=>ws.close());
  await page.route('**/api/live/snapshot',r=>r.fulfill({status:503,json:{error:'Controlled offline node'}}));
  await page.route('**/api/stats/counters',r=>r.fulfill({headers:{date:new Date(now).toUTCString(),'x-ink-data-status':'fresh','x-ink-data-fetched-at':new Date(now).toISOString()},json:{counters:[{id:'newTxns24h',title:'Transactions · 24h',description:'Last 24 hours',value:'1'}]}}));
  await page.route('**/api/'+(kind==='home'?'overview':'stats/lines'),r=>{
   calls++;if(mode==='hold'){held.push({route:r,value:payload()});return;}if(mode==='error')return r.fulfill({status:503,json:{error:'Data source unavailable'}});return r.fulfill({headers:freshHeaders(),json:payload()});
  });
  if(kind==='catalogue')await page.route('**/api/stats/lines/newTxns?**',r=>r.fulfill({headers:freshHeaders(),json:{info:info('newTxns'),chart:[{date:stamp(now-day),value:'100'},{date:stamp(now),value:'200',is_approximate:true}]}}));
  await page.addInitScript(kind=>{
   if(kind==='catalogue')Object.defineProperty(document,'hidden',{configurable:true,value:true});
   const original=fetch;window.fetch=(input,init)=>{
    const path=new URL(String(input),location.href).pathname;
    return /\/api\/(overview|stats\/lines)$/.test(path)?original(input,{...init,signal:undefined}):original(input,init);
   };
  },kind);
  const hide=()=>page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  const show=()=>page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
  const tick=async ms=>{now+=ms;await page.clock.fastForward(ms);};
  const release=async()=>{for(const item of held.splice(0))await item.route.fulfill({headers:freshHeaders(),json:item.value}).catch(()=>{});};
  const homeValue=value=>page.waitForFunction(value=>document.querySelector('.signal-main .chart-head strong')?.textContent===String(value),value);
  try{
   await page.clock.install({time:new Date(now)});await page.goto(base+prefix+(kind==='home'?'/':'/stats/newTxns')+'?lang=en',{waitUntil:'domcontentloaded'});
   if(kind==='home'){
    await homeValue(100);await page.locator('.chart-range select').selectOption('7');
    await hide();const before=calls;await tick(120000);assert.equal(calls,before);assert.equal(await page.locator('.home-chart-slot .loading').count(),1);
    mode='hold';version=200;await show();await page.waitForTimeout(50);assert.equal(calls,before+1);await page.evaluate(()=>dispatchEvent(new Event('focus')));assert.equal(calls,before+1);
    await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));mode='fresh';version=300;await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));await homeValue(300);await release();await page.waitForTimeout(50);await homeValue(300);
    assert.equal(await page.locator('.chart-range select').inputValue(),'7');row.checks.push('Home suspends requests, resumes once, discards late response and preserves selected range');
    await page.locator('.signal-main .interactive-chart').evaluate(el=>el.dataset.preserved='yes');version=400;await tick(31000);await homeValue(400);assert.equal(await page.locator('.signal-main .interactive-chart').getAttribute('data-preserved'),'yes');row.checks.push('Quiet overview refresh retains the chart instance');
    version=500;await page.evaluate(()=>{dispatchEvent(new Event('offline'));dispatchEvent(new Event('focus'));dispatchEvent(new Event('online'));});await homeValue(500);
    mode='error';await tick(31000);await page.locator('.home-chart-slot button').waitFor();await homeValue('N/A');assert.equal(await page.locator('.home-overview .metric:nth-child(3) > strong').innerText(),'N/A');mode='fresh';version=600;await page.locator('.home-chart-slot button').click();await homeValue(600);assert.equal(await page.locator('.chart-range select').inputValue(),'7');row.checks.push('Overview failure clears unavailable values and retry restores only current data');
   }else{
    await page.locator('.statistics-page .loading').waitFor();assert.equal(calls,0,'An initially hidden document must not request the catalogue');await show();await page.waitForTimeout(60);assert.equal(calls,1);
    await hide();mode='fresh';await show();await page.locator('article.stat-chart').scrollIntoViewIfNeeded();await page.locator('.interactive-chart').waitFor();assert.equal(calls,2);await release();await page.waitForTimeout(60);assert.equal(await page.locator('article.stat-chart').count(),1);assert.equal(await page.locator('.stats-heading h1').innerText(),'New transactions');
    await hide();await tick(120000);await show();await page.evaluate(()=>dispatchEvent(new Event('focus')));await page.locator('.interactive-chart').waitFor();assert.equal(calls,2,'Validated static catalogue should remain available without unnecessary reloads');row.checks.push('Pending catalogue suspends and retries; stale cancelled metadata cannot replace current catalogue; validated metadata is reused');
   }
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));row.calls=calls;row.passed=true;
  }catch(error){row.error=error.stack;}finally{await release();await context.close();}
  results.push(row);console.log(JSON.stringify(row));await writeFile(out+'/results.json',JSON.stringify({base,complete:false,results},null,2));
 }}finally{await browser.close();}
}
await writeFile(out+'/results.json',JSON.stringify({base,complete:true,passed:results.every(r=>r.passed),mockedApi:true,syntheticLifecycleEvents:true,results},null,2));if(results.some(r=>!r.passed))process.exitCode=1;
