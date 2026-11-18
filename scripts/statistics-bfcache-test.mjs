import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4310',out=process.env.STAT_BFCACHE_OUTPUT||'reports/stat-freshness/bfcache',results=[];
await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox'],ignoreDefaultArgs:['--disable-back-forward-cache']});
try{for(const prefix of['','/testnet'])for(const width of[390,1440]){
 const context=await browser.newContext({viewport:{width,height:844}}),page=await context.newPage(),row={prefix,width,passed:false,mockedApi:false,modifiedBrowserClock:true,delayedClientFetch:true},reasons=[];
 const cdp=await context.newCDPSession(page);await cdp.send('Page.enable');cdp.on('Page.backForwardCacheNotUsed',reason=>reasons.push(reason));page.setDefaultTimeout(25000);
 try{
  await page.goto(base+prefix+'/stats?lang=fr',{waitUntil:'domcontentloaded'});await page.locator('.stats-counters article strong[title]').first().waitFor();await page.waitForFunction(()=>document.querySelector('[data-live-transport]')?.getAttribute('data-live-transport')==='websocket');
  const marker=await page.evaluate(()=>{
   window.statsMarker=Math.random();window.statsReturns=[];addEventListener('pageshow',e=>window.statsReturns.push(e.persisted));
   const now=Date.now;Date.now=()=>now()+120000;
   const original=window.fetch;window.fetch=async(...args)=>{if(String(args[0]).includes('/stats/counters'))await new Promise(resolve=>setTimeout(resolve,2000));return original(...args);};
   return window.statsMarker;
  });
  await page.goto(base+prefix+'/robots.txt',{waitUntil:'load'});await page.goBack({waitUntil:'commit'});
  await page.waitForFunction(()=>window.statsReturns?.includes(true));assert.equal(await page.evaluate(()=>window.statsMarker),marker);
  await page.waitForFunction(()=>[...document.querySelectorAll('.stats-counters article strong')].every(e=>e.textContent==='N/A'));
  row.hiddenBeforeRecovery=await page.locator('.stats-counters article strong[title]').count();assert.equal(row.hiddenBeforeRecovery,0);
  await page.screenshot({path:`${out}/${prefix?'sepolia':'mainnet'}-${width}-expired.png`});
  await page.locator('.stats-counters article strong[title]').first().waitFor();assert.equal(await page.locator('.counter-source-state').count(),0);row.recovered=await page.locator('.stats-counters article strong[title]').count();assert(row.recovered>0);row.passed=true;
 }catch(error){row.error=error.stack;row.reasons=reasons;}finally{await context.close();}
 results.push(row);console.log(JSON.stringify(row));await writeFile(out+'/results.json',JSON.stringify({base,complete:false,results},null,2));
}}finally{await browser.close();}
await writeFile(out+'/results.json',JSON.stringify({base,complete:true,passed:results.every(r=>r.passed),results},null,2));if(results.some(r=>!r.passed))process.exitCode=1;
