import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4310',out=process.env.LANGUAGE_OUTPUT||'reports/home-loading/initial-language';
await mkdir(out,{recursive:true});const results=[];
const scenarios=[
 {query:'ar',saved:'fr',browser:'en-US',expected:'ar'},
 {query:'fr',saved:'ar',browser:'ar',expected:'fr'},
 {query:'',saved:'ar',browser:'en-US',expected:'ar'},
 {query:'',saved:null,browser:'ar',expected:'ar'},
 {query:'invalid',saved:'fr',browser:'ar',expected:'fr'},
];
for(const [engine,launcher]of Object.entries({chromium,firefox,webkit})){
 const browser=await launcher.launch(engine==='chromium'?{args:['--no-sandbox']}:{});
 try{for(const prefix of ['','/testnet'])for(const scenario of scenarios){
  const context=await browser.newContext({locale:scenario.browser,viewport:{width:1440,height:1000}}),page=await context.newPage(),row={engine,prefix,scenario,passed:false};
  await page.addInitScript(({saved})=>{
   if(saved)localStorage.setItem('ink-observer-language',saved);
   window.firstExplorerDirection=null;
   const observer=new MutationObserver(()=>{
    if(document.querySelector('main h1')){window.firstExplorerDirection={lang:document.documentElement.lang,dir:document.documentElement.dir};observer.disconnect();}
   });observer.observe(document,{childList:true,subtree:true});
  },scenario);
  try{
   await page.goto(base+prefix+'/?'+new URLSearchParams(scenario.query?{lang:scenario.query}:{}),{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>window.firstExplorerDirection);
   const first=await page.evaluate(()=>window.firstExplorerDirection);assert.deepEqual(first,{lang:scenario.expected,dir:scenario.expected==='ar'?'rtl':'ltr'});row.first=first;
   if(scenario.query==='ar'){
    await page.locator('.home-chart-slot .interactive-chart').waitFor();
    assert(await page.locator('.home-chart-slot .chart-axis').evaluate(el=>el.firstElementChild.getBoundingClientRect().left<el.lastElementChild.getBoundingClientRect().left));
   }
   row.passed=true;
  }catch(e){row.error=e.message;}finally{await context.close();}
  results.push(row);console.log(JSON.stringify(row));await writeFile(out+'/results.json',JSON.stringify({base,complete:false,results},null,2));
 }}finally{await browser.close();}
}
await writeFile(out+'/results.json',JSON.stringify({base,complete:true,passed:results.every(r=>r.passed),results},null,2));if(results.some(r=>!r.passed))process.exitCode=1;
