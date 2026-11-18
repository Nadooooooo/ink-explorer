import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4311',out=process.env.FRESH_CHART_OUTPUT||'reports/chart-freshness/browser',baseline=process.env.FRESH_CHART_BASELINE==='1',results=[];
await mkdir(out,{recursive:true});
const info={id:'newTxns',title:'New transactions',description:'Transactions per day',units:null,resolutions:['DAY']},day=86400000,stamp=n=>new Date(n).toISOString().slice(0,10);
for(const engine of (process.env.FRESH_CHART_ENGINES||'chromium,firefox,webkit').split(',')){
 const browser=await({chromium,firefox,webkit})[engine].launch(engine==='chromium'?{args:['--no-sandbox']}:{});
 try{for(const prefix of (baseline?['']:['','/testnet']))for(const width of (baseline?[390]:[390,1440]))for(const home of [true,false]){
  const c=await browser.newContext({viewport:{width,height:900},bypassCSP:true}),p=await c.newPage(),r={engine,prefix,width,home,baseline,passed:false},errors=[];p.setDefaultTimeout(12000);p.on('pageerror',e=>errors.push(e.message));
  let now=Date.now(),version=100,mode='fresh',calls=0,held=[];
  const headers=()=>mode==='undated'?{}:{date:new Date(now).toUTCString(),'x-ink-data-status':mode==='stale'?'stale':'fresh','x-ink-data-fetched-at':new Date(now-(mode==='old'?180000:mode==='aging'?75000:mode==='aging-flight'?(home?50000:20000):0)).toISOString()};
  const payload=()=>home?{stats:{total_addresses:'1'},blocks:[],transactions:[],chart:[-2,-1,0].map(offset=>({date:stamp(now+offset*day),transactions_count:version}))}:{info,chart:[-2,-1,0].map(offset=>({date:stamp(now+offset*day),value:String(version),is_approximate:offset===0}))};
  await c.routeWebSocket(/\/api\/live$/,ws=>ws.close());
  await c.route('**/api/**',route=>{
   const u=new URL(route.request().url()),path=u.pathname.replace(/^\/testnet/,'');
   if(path==='/api/live/config')return route.fulfill({json:{url:base.replace(/^http/,'ws')+prefix+'/api/live'}});
   if(path==='/api/live/snapshot')return route.fulfill({status:503,json:{error:'Controlled offline node'}});
   if(path==='/api/stats/lines')return route.fulfill({json:{sections:[{id:'transactions',title:'Transactions',charts:[info]}]}});
   if(path===(home?'/api/overview':'/api/stats/lines/newTxns')){
    calls++;if(mode==='hold'){held.push(route);return;}
    return route.fulfill({headers:headers(),json:payload()});
   }
   return route.fulfill({json:{items:[]}});
  });
  const chart=()=>p.locator(home?'.signal-main':'article.stat-chart'),value=()=>chart().locator(home?'.chart-head strong':'.chart-period-summary strong').first();
  const tick=async ms=>{now+=ms;await p.clock.fastForward(ms);await p.waitForTimeout(60);};
  const waitValue=expected=>p.waitForFunction(({home,expected})=>document.querySelector(home?'.signal-main .chart-head strong':'.chart-period-summary strong')?.textContent===expected,{home,expected:typeof expected==='number'&&!home?new Intl.NumberFormat('en',{maximumFractionDigits:2}).format(expected):String(expected)});
  const retry=()=>chart().locator(home?'.home-resource-state button':'.chart-error button');
  try{
   await p.clock.install({time:new Date(now)});await p.goto(base+prefix+(home?'/':'/stats/newTxns')+'?lang=en',{waitUntil:'domcontentloaded'});await chart().scrollIntoViewIfNeeded();await waitValue(home?100:300);
   if(!home)await chart().locator('.chart-data summary').click();
   mode='stale';version=200;await tick(home?31000:61000);
   if(baseline){await waitValue(home?200:600);r.reproduced='A stale response replaces the visible current value';}
   else{
    await waitValue('N/A');await retry().waitFor();await chart().screenshot({path:`${out}/${engine}-${prefix?'sepolia':'mainnet'}-${width}-${home?'home':'chart'}-unavailable.png`});if(!home){assert(await chart().locator('.chart-data button').isDisabled());assert((await chart().locator('.chart-data tbody td:last-child').allInnerTexts()).every(x=>x.trim()==='N/A'));}
    for(const invalid of ['old','undated']){mode=invalid;await retry().click();await retry().waitFor();await waitValue('N/A');}
    mode='fresh';version=300;await retry().click();await waitValue(home?300:900);
    // A valid but near-expiry response must expire before the next 30/60s poll.
    mode='aging';version=301;await tick(home?31000:61000);await waitValue(home?301:903);const before=calls;mode='hold';await tick(15001);await waitValue('N/A');assert.equal(calls,before,'Expiry should not add a request');
    if(!home){assert(await chart().locator('.chart-data button').isDisabled());assert((await chart().locator('.chart-data tbody td:last-child').allInnerTexts()).every(x=>x.trim()==='N/A'));}
    mode='fresh';version=400;await retry().click();await waitValue(home?400:1200);
    mode='aging-flight';version=401;await tick(home?31000:61000);await waitValue(home?401:1203);mode='hold';await tick(home?31000:61000);assert(held.length>0);await tick(10001);await waitValue('N/A');
    mode='fresh';version=450;await retry().click();await waitValue(home?450:1350);
    await p.evaluate(()=>dispatchEvent(new Event('offline')));await waitValue('N/A');version=500;await p.evaluate(()=>dispatchEvent(new Event('online')));await waitValue(home?500:1500);
    // Hidden views do not publish expiry, poll, or leak old values on return.
    await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});const paused=calls;await tick(120000);assert.equal(calls,paused);mode='stale';await p.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});await waitValue('N/A');await retry().waitFor();mode='fresh';version=600;await retry().click();await waitValue(home?600:1800);
    assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);await chart().screenshot({path:`${out}/${engine}-${prefix?'sepolia':'mainnet'}-${width}-${home?'home':'chart'}.png`});r.checks=['stale response rejected','old and undated response rejected','expires between polls and during a pending request','CSV and data table unavailable','retry/online resume','hidden suspension'];
   }
   r.passed=true;
  }catch(e){r.error=e.stack;}finally{for(const route of held)await route.abort().catch(()=>{});await c.close();}
  results.push(r);console.log(JSON.stringify(r));await writeFile(out+'/results.json',JSON.stringify({base,complete:false,results},null,2));
 }}finally{await browser.close();}
}
await writeFile(out+'/results.json',JSON.stringify({base,complete:true,passed:results.every(r=>r.passed),baseline,mockedApi:true,results},null,2));if(results.some(r=>!r.passed))process.exitCode=1;
