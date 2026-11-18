import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4310',out=process.env.STAT_LAYOUT_OUTPUT||'reports/stat-freshness/unavailable-layout',results=[];
await mkdir(out,{recursive:true});const browser=await chromium.launch({args:['--no-sandbox']});
try{for(const locale of['en','fr','es','pt','zh','ja','ru','ar','hi','bn'])for(const path of['stats','gas-tracker']){
 const context=await browser.newContext({viewport:{width:320,height:740},hasTouch:true,isMobile:true,bypassCSP:true}),page=await context.newPage(),row={locale,path,passed:false};
 await context.routeWebSocket(/\/api\/live$/,ws=>ws.close());
 await context.route('**/api/**',route=>{
  const url=new URL(route.request().url());
  if(url.pathname.endsWith('/live/config'))return route.fulfill({json:{url:base.replace(/^http/,'ws')+'/api/live'}});
  if(url.pathname.endsWith('/stats/lines'))return route.fulfill({json:{sections:[]}});
  return route.fulfill({status:503,json:{error:'Data source unavailable'}});
 });
 try{
  await page.goto(base+'/'+path+'?lang='+locale,{waitUntil:'domcontentloaded'});const action=page.locator('.statistics-retry');await action.waitFor();await action.scrollIntoViewIfNeeded();await page.evaluate(()=>document.fonts.ready);
  const dict=JSON.parse(await readFile(`src/locales/${locale}.json`,'utf8'));assert.equal(await action.getAttribute('aria-label'),dict.retry);
  const box=await action.boundingBox();assert(box.width>=44&&box.height>=44&&box.x>=0&&box.x+box.width<=320);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  const overlap=await action.evaluate(button=>{
   const box=button.getBoundingClientRect(),parent=button.parentElement,title=parent.querySelector('h2')||parent.querySelector('span'),range=document.createRange();range.selectNodeContents(title);
   return [...range.getClientRects()].some(r=>Math.min(r.right,box.right)-Math.max(r.left,box.left)>1&&Math.min(r.bottom,box.bottom)-Math.max(r.top,box.top)>1);
  });assert(!overlap,'Retry overlaps the heading or status');
  const values=page.locator(path==='stats'?'.stats-counters article strong':'.gas-estimates article strong');assert.equal(await values.count(),path==='stats'?18:3);assert((await values.allTextContents()).every(value=>value==='N/A'));
  await page.screenshot({path:`${out}/${locale}-${path}.png`});row.passed=true;
 }catch(error){row.error=error.stack;}finally{await context.close();}
 results.push(row);console.log(JSON.stringify(row));await writeFile(out+'/results.json',JSON.stringify({base,complete:false,results},null,2));
}}finally{await browser.close();}
await writeFile(out+'/results.json',JSON.stringify({base,complete:true,passed:results.every(r=>r.passed),mockedApi:true,physicalDeviceTest:false,results},null,2));if(results.some(r=>!r.passed))process.exitCode=1;
