import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4310',out=process.env.CHART_LIFECYCLE_OUTPUT||'reports/chart-lifecycle/browser',baseline=process.env.CHART_LIFECYCLE_BASELINE==='1',results=[];
const day=86400000,stamp=value=>new Date(value).toISOString().slice(0,10),info={id:'newTxns',title:'New transactions',description:'New transactions per interval',units:null,resolutions:['DAY','WEEK']};
const selectedPeriod=Number(process.env.CHART_LIFECYCLE_PERIOD||7);
await mkdir(out,{recursive:true});
for(const engine of(process.env.CHART_LIFECYCLE_ENGINES||'chromium,firefox,webkit').split(',')){
 const browser=await({chromium,firefox,webkit})[engine].launch(engine==='chromium'?{args:['--no-sandbox']}:{});
 try{for(const prefix of['','/testnet'])for(const width of(process.env.CHART_LIFECYCLE_WIDTHS||'390,1440').split(',').map(Number))for(const route of(process.env.CHART_LIFECYCLE_ROUTES||'stats/newTxns,stats').split(',')){
  const context=await browser.newContext({viewport:{width,height:900},bypassCSP:true}),page=await context.newPage(),row={engine,prefix,width,route,selectedPeriod,baseline,passed:false,checks:[]},errors=[];
  page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));let now=Date.now(),version=100,mode='fresh',calls=[],held=[];
  const freshHeaders=()=>({date:new Date(now).toUTCString(),'x-ink-data-status':'fresh','x-ink-data-fetched-at':new Date(now).toISOString()});
  const payload=url=>{
   const weekly=new URL(url).searchParams.get('resolution')==='WEEK',anchor=weekly?Date.parse(stamp(now))-((new Date(now).getUTCDay()+6)%7)*day:now;
   return {info,chart:[-2,-1,0].map((offset,index)=>({date:stamp(anchor+offset*(weekly?7:1)*day),date_to:stamp(anchor+(offset*(weekly?7:1)+(weekly?6:0))*day),value:String(version*(index+1)),is_approximate:offset===0}))};
  };
  await context.routeWebSocket(/\/api\/live$/,ws=>ws.close());
  await page.route('**/api/live/snapshot',r=>r.fulfill({status:503,json:{error:'Controlled unavailable node'}}));
  await page.route('**/api/stats/lines',r=>r.fulfill({json:{sections:[{id:'transactions',title:'Transactions',charts:[info]}]}}));
  await page.route('**/api/stats/counters',r=>r.fulfill({headers:{date:new Date(now).toUTCString(),'x-ink-data-status':'fresh','x-ink-data-fetched-at':new Date(now).toISOString()},json:{counters:[{id:'newTxns24h',title:'Transactions · 24h',description:'Transactions over 24 hours',value:'100'}]}}));
  await page.route('**/api/stats/lines/newTxns?**',r=>{calls.push(r.request().url());if(mode==='hold'){held.push({route:r,payload:payload(r.request().url())});return;}if(mode==='error')return r.fulfill({status:503,json:{error:'Data source unavailable'}});return r.fulfill({headers:freshHeaders(),json:payload(r.request().url())});});
  // Deliberately ignore transport aborts to verify the lifecycle publication guard.
  await page.addInitScript(()=>{const original=fetch;window.fetch=(input,init)=>String(input).includes('/stats/lines/newTxns?')?original(input,{...init,signal:undefined}):original(input,init);});
  const hide=()=>page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  const show=()=>page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
  const tick=async ms=>{now+=ms;await page.clock.fastForward(ms);};
  const total=value=>page.waitForFunction(value=>document.querySelector('.chart-period-summary strong')?.textContent===new Intl.NumberFormat('en',{maximumFractionDigits:2}).format(value),value);
  const release=async()=>{for(const item of held.splice(0))await item.route.fulfill({headers:freshHeaders(),json:item.payload}).catch(()=>{});};
  try{
   await page.clock.install({time:new Date(now)});await page.goto(base+prefix+'/'+route+'?lang=en',{waitUntil:'domcontentloaded'});
   const chart=page.locator('article.stat-chart');await chart.scrollIntoViewIfNeeded();await total(600);await chart.locator('select').selectOption(String(selectedPeriod));await total(600);await chart.locator('.chart-data summary').click();await chart.locator('.chart-data tbody tr').first().waitFor();const readyHeight=(await chart.boundingBox()).height;
   await hide();const before=calls.length;await tick(day);assert.equal(calls.length,before,'Hidden chart must not poll');version=200;mode='hold';await show();
   if(baseline){await page.waitForTimeout(100);assert.equal(calls.length,before);assert.equal(new URL(calls.at(-1)).searchParams.get('to'),stamp(now-day));await total(600);row.checks.push('Reproduced: returning next day retains old values and old date window without a request');}
   else{
    await page.waitForFunction(()=>document.querySelector('article.stat-chart')?.getAttribute('aria-busy')==='true');await page.waitForTimeout(50);assert.equal(calls.length,before+1);assert.equal(new URL(calls.at(-1)).searchParams.get('to'),selectedPeriod?stamp(now):null);assert.equal(new URL(calls.at(-1)).searchParams.get('from'),selectedPeriod?stamp(now-(selectedPeriod-1)*day):null);
    assert(await chart.locator('.chart-data button').isDisabled());assert(Math.abs((await chart.boundingBox()).height-readyHeight)<=1,'Revalidation changed the chart/table height');assert((await chart.locator('.chart-data tbody td:last-child').allInnerTexts()).every(text=>text.trim()==='N/A'),'Pending table exposes unvalidated values');await page.evaluate(()=>dispatchEvent(new Event('focus')));assert.equal(calls.length,before+1);row.checks.push('Resume recomputes dates once and disables stale export');
    await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));version=300;mode='fresh';await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));await total(1800);await release();await page.waitForTimeout(50);await total(1800);
    assert.equal(await chart.locator('select').inputValue(),String(selectedPeriod));assert(await chart.locator('.chart-data').evaluate(el=>el.open));row.checks.push('Page return preserves selected period and open table; late canceled response cannot replace newer values');
    await chart.locator('.interactive-chart').evaluate(el=>el.dataset.preserved='yes');version=400;await tick(61000);await total(2400);assert.equal(await chart.locator('.interactive-chart').getAttribute('data-preserved'),'yes');row.checks.push('Visible interval refresh updates values without remounting the plot');
    await hide();const suspended=calls.length;await tick(120000);assert.equal(calls.length,suspended);await page.evaluate(()=>dispatchEvent(new Event('offline')));await show();await page.locator('.chart-error').waitFor();assert.equal(calls.length,suspended);version=500;await page.evaluate(()=>dispatchEvent(new Event('online')));await total(3000);row.checks.push('Offline data is unavailable and online resumes without reload');
    mode='error';await tick(61000);await chart.locator('.chart-error').waitFor();assert.deepEqual(await chart.locator('.chart-period-summary strong').allTextContents(),['N/A','N/A','N/A']);version=600;mode='fresh';await chart.locator('.chart-error button').click();await total(3600);assert.equal(await chart.locator('select').inputValue(),String(selectedPeriod));row.checks.push('Failed refresh clears summaries and remains retryable');
    version=700;const rapid=calls.length;await page.evaluate(()=>{dispatchEvent(new Event('offline'));dispatchEvent(new Event('focus'));dispatchEvent(new Event('online'));});await total(4200);assert.equal(calls.length,rapid+1);row.checks.push('Immediate offline/focus/online sequence recovers without a cooldown dead end');
    if(route==='stats'){
     await page.locator('.stats-totals summary').click();await page.setViewportSize({width,height:400});await page.locator('.stats-heading').scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelector('article.stat-chart')?.getBoundingClientRect().top>innerHeight+200);await page.waitForTimeout(100);const offscreen=calls.length;await tick(61000);assert.equal(calls.length,offscreen,'Offscreen charts must not poll');
     version=800;await page.locator('.stats-totals summary').click();const returned=page.waitForResponse(response=>response.url().includes('/stats/lines/newTxns?'));await page.setViewportSize({width,height:900});await chart.scrollIntoViewIfNeeded();await returned;await total(4800);assert(calls.length>offscreen);assert.equal(await chart.locator('select').inputValue(),String(selectedPeriod));row.checks.push('Charts outside the viewport stop requesting data and resume when visible');
    }
    await page.addScriptTag({path:'node_modules/axe-core/axe.min.js'});row.violations=await page.evaluate(async()=>(await axe.run('article.stat-chart',{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})));assert.deepEqual(row.violations,[]);
   }
   assert.deepEqual(errors,[]);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await chart.screenshot({path:`${out}/${engine}-${prefix?'sepolia':'mainnet'}-${width}-${route.replace('/','-')}.png`});row.requests=calls.map(url=>new URL(url).search);row.passed=true;
  }catch(error){row.error=error.stack;}finally{await release();await context.close();}
  results.push(row);console.log(JSON.stringify(row));await writeFile(out+'/results.json',JSON.stringify({base,baseline,complete:false,results},null,2));
 }}finally{await browser.close();}
}
await writeFile(out+'/results.json',JSON.stringify({base,baseline,complete:true,passed:results.every(r=>r.passed),mockedApi:true,syntheticLifecycleEvents:true,physicalDeviceTest:false,results},null,2));if(results.some(r=>!r.passed))process.exitCode=1;
