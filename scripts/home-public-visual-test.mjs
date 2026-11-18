import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BASE_URL;if(!base)throw new Error('BASE_URL is required');
const out=process.env.HOME_VISUAL_OUTPUT||'reports/home-loading/public-visual';await mkdir(out,{recursive:true});const results=[];
const browser=await chromium.launch({args:['--no-sandbox']});
try{for(const prefix of ['','/testnet'])for(const[width,locale,theme]of[[320,'fr','dark'],[390,'fr','light'],[1180,'fr','light'],[1440,'ar','dark']]){
 const page=await browser.newPage({viewport:{width,height:1000},colorScheme:theme}),row={prefix,width,locale,theme,passed:false},errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  window.homeTiming={};window.homeShifts=[];
  new PerformanceObserver(list=>{for(const e of list.getEntries())if(!e.hadRecentInput)window.homeShifts.push(e.value)}).observe({type:'layout-shift',buffered:true});
  const observer=new MutationObserver(()=>{
   for(const[k,s]of[['metrics','.home-overview .metric'],['block','.compact-block-row'],['tx','.compact-tx-row'],['chart','.home-chart-slot .interactive-chart']])if(!window.homeTiming[k]&&document.querySelector(s))window.homeTiming[k]=Math.round(performance.now());
   if(Object.keys(window.homeTiming).length===4)observer.disconnect();
  });observer.observe(document,{subtree:true,childList:true});
 });
 try{
  await page.goto(base+prefix+'/?lang='+locale,{waitUntil:'domcontentloaded'});await page.locator('.home-chart-slot .interactive-chart').waitFor();await page.locator('.compact-tx-row').nth(5).waitFor();await page.waitForFunction(()=>document.querySelectorAll('.home-overview .metric')[1]?.querySelector('strong')?.textContent!=='N/A');await page.evaluate(()=>document.fonts.ready);
  const first=page.locator('.compact-block-row').first();const before=await first.locator('a[href*="/block/"]').getAttribute('href');await first.evaluate(el=>el.dataset.publicPreserved='yes');
  await page.waitForFunction(before=>document.querySelector('.compact-block-row a[href*="/block/"]')?.getAttribute('href')!==before,before);
  assert.equal(await first.getAttribute('data-public-preserved'),'yes');
  row.state=await page.evaluate(()=>({timing:window.homeTiming,observedLayoutShifts:window.homeShifts.reduce((a,b)=>a+b,0),overflow:document.documentElement.scrollWidth>innerWidth+1,feedsTop:document.querySelector('.live-columns').getBoundingClientRect().top,errors:document.querySelectorAll('.error-state').length,axis:[...document.querySelectorAll('.home-chart-slot .chart-axis span')].map(el=>({date:el.textContent,left:el.getBoundingClientRect().left}))}));
  assert.equal(row.state.overflow,false);assert.equal(row.state.errors,0);assert(row.state.axis[0].left<row.state.axis[1].left);assert.deepEqual(errors,[]);
  await page.screenshot({path:`${out}/${prefix?'sepolia':'mainnet'}-${width}-${locale}-${theme}.png`});row.passed=true;
 }catch(e){row.error=e.message;}finally{await page.close();}
 results.push(row);console.log(JSON.stringify(row));await writeFile(out+'/results.json',JSON.stringify({base,complete:false,results},null,2));
}}finally{await browser.close();}
await writeFile(out+'/results.json',JSON.stringify({base,complete:true,passed:results.every(r=>r.passed),note:'Single browser samples with real public data, not a latency percentile benchmark. No physical device used.',results},null,2));if(results.some(r=>!r.passed))process.exitCode=1;
