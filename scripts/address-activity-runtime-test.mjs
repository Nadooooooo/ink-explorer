import assert from 'node:assert/strict';import {chromium} from 'playwright-core';import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4319',out=process.env.ADDRESS_ACTIVITY_RUNTIME_OUTPUT||'reports/activity-stability/runtime',duration=12000;await mkdir(out,{recursive:true});const results=[];const browser=await chromium.launch({args:['--no-sandbox']});
try{for(const[width,locale]of [[390,'fr'],[1440,'ar']]){
 const context=await browser.newContext({viewport:{width,height:1000},...(process.env.INK_RELEASE_VERSION?{extraHTTPHeaders:{'Cloudflare-Workers-Version-Overrides':`inkexplorer="${process.env.INK_RELEASE_VERSION}"`}}:{})}),page=await context.newPage(),errors=[];let documents=0;page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.isNavigationRequest()&&r.frame()===page.mainFrame())documents++;});const row={width,locale,cpuThrottle:4,observationMs:duration};
 try{
  const doc=await page.goto(base+'/address/0x4200000000000000000000000000000000000015?tab=transactions&lang='+locale,{waitUntil:'domcontentloaded'});row.version=doc.headers()['x-ink-version'];if(process.env.EXPECTED_VERSION)assert.equal(row.version,process.env.EXPECTED_VERSION);await page.waitForSelector('.address-transactions .tx-primary a');
  if(base.startsWith('https:'))await page.waitForFunction(()=>document.querySelector('[data-live-transport]')?.getAttribute('data-live-transport')==='websocket');
  await Promise.race([page.evaluate(()=>document.fonts.ready),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('Fonts did not become ready')),20000);timer.unref();})]);await page.waitForTimeout(1500);
  const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  await page.evaluate(()=>{
   const first=()=>document.querySelector('.address-transactions .tx-primary a')?.getAttribute('href');window.__activityRuntime={first:first(),seen:new Set([first()]),longTasks:[],shifts:[]};
   new MutationObserver(()=>window.__activityRuntime.seen.add(first())).observe(document.querySelector('.address-transactions'),{subtree:true,childList:true,attributes:true,attributeFilter:['href']});
   new PerformanceObserver(list=>window.__activityRuntime.longTasks.push(...list.getEntries().map(e=>({at:e.startTime,duration:e.duration})))).observe({type:'longtask'});
   new PerformanceObserver(list=>window.__activityRuntime.shifts.push(...list.getEntries().filter(e=>!e.hadRecentInput).map(e=>({at:e.startTime,value:e.value,sources:e.sources?.map(s=>({tag:s.node?.tagName,className:String(s.node?.className||''),before:s.previousRect.toJSON(),after:s.currentRect.toJSON()}))})))).observe({type:'layout-shift'});
  });
  await new Promise(r=>setTimeout(r,duration));const measured=await page.evaluate(()=>{const r=window.__activityRuntime;return{first:r.first,seen:[...r.seen].filter(Boolean),longTasks:r.longTasks,shifts:r.shifts,rows:document.querySelectorAll('.address-transactions .tx-row').length,overflow:document.documentElement.scrollWidth>innerWidth+1};});
  const shifts=measured.shifts;let session=0,sessionStart=0,last=0,maximum=0;for(const e of shifts){if(e.at-last>1000||e.at-sessionStart>5000){session=0;sessionStart=e.at;}session+=e.value;maximum=Math.max(maximum,session);last=e.at;}
  Object.assign(row,measured,{layoutShiftSum:shifts.reduce((s,e)=>s+e.value,0),maximumObservedSessionShift:maximum,documents});
  assert(measured.seen.length-1>=(base.startsWith('https:')?4:2),'The stable view must still update automatically');assert(row.layoutShiftSum<0.05,'Automatic updates must not move transaction rows through the viewport');assert.equal(measured.overflow,false);assert.equal(documents,1);assert.deepEqual(errors,[]);row.passed=true;await page.screenshot({path:`${out}/chromium-${width}.png`});
 }catch(error){Object.assign(row,{passed:false,error:error.stack,documents,errors});await page.screenshot({path:`${out}/chromium-${width}-failure.png`}).catch(()=>{});}
 finally{await context.close();}
 results.push(row);console.log(JSON.stringify({width,passed:row.passed,layoutShiftSum:row.layoutShiftSum,updates:row.seen?.length-1,error:row.error}));await writeFile(out+'/results.json',JSON.stringify({base,apiMocked:false,complete:false,results},null,2));
}}finally{await browser.close();}
const report={base,apiMocked:false,physicalDevice:false,fieldCoreWebVitals:false,scope:'Two 12-second Chromium observations after startup at CPU x4. Shift sum and maximum observed shift session are laboratory samples, not visitor-population Core Web Vitals.',complete:true,passed:results.every(r=>r.passed),results};await writeFile(out+'/results.json',JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;
