import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4311',out=process.env.CHART_BFCACHE_OUTPUT||'reports/chart-lifecycle/bfcache',results=[];
const selectedPeriod=process.env.CHART_BFCACHE_PERIOD||'7',bottom=process.env.CHART_BFCACHE_BOTTOM==='1';
await mkdir(out,{recursive:true});
const geometry=page=>page.evaluate(()=>{
 const rect=selector=>{const e=document.querySelector(selector);if(!e)return null;const r=e.getBoundingClientRect();return {top:r.top,height:r.height,text:selector.includes('tbody')?e.innerText:undefined};};
 return {scrollY,documentHeight:document.documentElement.scrollHeight,chart:rect('article.stat-chart'),plot:rect('.interactive-chart'),loading:rect('.chart-loading'),table:rect('.chart-data table'),lastRow:rect('.chart-data tbody tr:last-child'),summary:rect('.chart-period-summary'),footer:rect('footer')};
});
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox'],ignoreDefaultArgs:['--disable-back-forward-cache']});
try{for(const prefix of['','/testnet'])for(const width of[390,1440])for(const route of(process.env.CHART_BFCACHE_ROUTES||'stats,home').split(',')){
 const home=route==='home',context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),row={prefix,width,route,selectedPeriod,bottom,passed:false,mockedApi:false,delayedClientFetch:true},reasons=[];
 const cdp=await context.newCDPSession(page);await cdp.send('Page.enable');cdp.on('Page.backForwardCacheNotUsed',value=>reasons.push(value));page.setDefaultTimeout(25000);
 try{
  await page.goto(base+prefix+(home?'/':'/stats/newTxns')+'?lang=fr',{waitUntil:'domcontentloaded'});
  const chart=page.locator(home?'.signal-main':'article.stat-chart');await chart.scrollIntoViewIfNeeded();await chart.locator('.interactive-chart').waitFor();await chart.locator('select').selectOption(selectedPeriod);
  if(!home){await page.waitForFunction(()=>document.querySelector('article.stat-chart')?.getAttribute('aria-busy')==='false');await chart.locator('.chart-data summary').click();}
  await page.waitForFunction(()=>document.querySelector('[data-live-transport]')?.getAttribute('data-live-transport')==='websocket');
  if(bottom&&!home){await chart.locator('.chart-data tbody tr').last().scrollIntoViewIfNeeded();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));row.scrollBefore=await page.evaluate(()=>scrollY);}
  row.before=await geometry(page);
  const marker=await page.evaluate(home=>{
   window.chartMarker=Math.random();window.chartReturns=[];window.chartReads=[];
   addEventListener('pageshow',event=>window.chartReturns.push(event.persisted));
   const original=fetch;window.fetch=async(...args)=>{if(String(args[0]).includes(home?'/api/overview':'/stats/lines/newTxns?')){window.chartReads.push(String(args[0]));await new Promise(resolve=>setTimeout(resolve,2000));}return original(...args);};
   return window.chartMarker;
  },home);
  await page.goto(base+prefix+'/robots.txt',{waitUntil:'load'});await page.goBack({waitUntil:'commit'});
  await page.waitForFunction(()=>window.chartReturns?.includes(true));assert.equal(await page.evaluate(()=>window.chartMarker),marker);row.restoredFromBFCache=true;
  await chart.locator(home?'.home-chart-slot .loading':'.chart-loading').waitFor();assert.equal(await chart.locator('select').inputValue(),selectedPeriod);
  if(home)assert.equal(await chart.locator('.chart-head strong').innerText(),'N/A');
  else{assert(await chart.locator('.chart-data').evaluate(el=>el.open));assert(await chart.locator('.chart-data button').isDisabled());assert.deepEqual(await chart.locator('.chart-period-summary strong').allTextContents(),['N/A','N/A','N/A']);}
  row.pending=await geometry(page);
  if(bottom&&!home){
   assert(row.pending.lastRow,'Revalidation removed the table being read');
   assert(Math.abs(row.pending.lastRow.top-row.before.lastRow.top)<=3,'Revalidation moved the reading row');
   assert((await chart.locator('.chart-data tbody td:last-child').allInnerTexts()).every(text=>text.trim()==='N/A'),'Pending table exposes unvalidated values');
   assert.equal(await chart.getByRole('cell',{name:'N/A',exact:true}).count(),await chart.locator('.chart-data tbody tr').count(),'Assistive technology can still read unvalidated values');
  }
  await page.screenshot({path:`${out}/${prefix?'sepolia':'mainnet'}-${width}-${route}-checking.png`});
  await chart.locator('.interactive-chart').waitFor();assert.equal(await chart.locator('.chart-error').count(),0);
  if(!home){assert.equal(await chart.locator('.chart-data button').isDisabled(),false);assert(await chart.locator('.chart-data tbody tr').count()>0);}
  row.after=await geometry(page);
  row.reads=await page.evaluate(()=>window.chartReads);assert.equal(row.reads.length,1,'Returning should not issue overlapping requests');assert.equal(await chart.locator('select').inputValue(),selectedPeriod);
  if(bottom&&!home){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));row.after=await geometry(page);row.scrollAfter=row.after.scrollY;assert(row.after.lastRow&&Math.abs(row.after.lastRow.top-row.before.lastRow.top)<=3,'Returning to an expanded table moved the reading row');}
  row.passed=true;
 }catch(error){row.error=error.stack;row.reasons=reasons;}finally{await context.close();}
 results.push(row);console.log(JSON.stringify(row));await writeFile(out+'/results.json',JSON.stringify({base,complete:false,results},null,2));
}}finally{await browser.close();}
await writeFile(out+'/results.json',JSON.stringify({base,complete:true,passed:results.every(r=>r.passed),results},null,2));if(results.some(r=>!r.passed))process.exitCode=1;
