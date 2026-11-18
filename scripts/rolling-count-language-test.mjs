import assert from 'node:assert/strict';
import {chromium,firefox} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
const out='reports/rolling-metrics/languages';await mkdir(out,{recursive:true});const results=[];
for(const engine of [chromium,firefox]){
 const browser=await engine.launch(engine===chromium?{args:['--no-sandbox']}:{firefoxUserPrefs:{'font.minimum-size.x-western':24}});
 try{for(const locale of ['en','fr','es','pt','zh','ja','ru','ar','hi','bn']){
 const f=await(await fetch('http://127.0.0.1:4214/api/live/snapshot')).json();assert(f.rolling24h);f.rolling24h.transactions=999999999;f.rolling24h.missingReceipts=f.rolling24h.unknownFees=999999999;f.rolling24h.feeWei=null;
 const c=await browser.newContext({viewport:{width:320,height:900}}),p=await c.newPage(),r={engine:engine.name(),locale};
 await c.routeWebSocket(/\/api\/live$/,ws=>ws.send(JSON.stringify(f)));
 await c.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;if(path.endsWith('/live/config'))return route.fulfill({json:{url:'ws://127.0.0.1:4214/api/live'}});if(path.endsWith('/live/snapshot'))return route.fulfill({json:f});return route.fulfill({status:503,json:{error:'Unavailable fixture'}});});
 try{
 await p.goto('http://127.0.0.1:4214/?lang='+locale,{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>document.querySelector('[data-counter="newTxns24h"] strong')?.title==='999999999');
 const geometry=await p.locator('[data-counter="newTxns24h"]').evaluate(card=>{const outer=card.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(card.querySelector('strong'));const value=range.getBoundingClientRect();const button=card.querySelector('button').getBoundingClientRect(),label=card.querySelector('.info-visible-label').getBoundingClientRect(),symbol=card.querySelector('.info-symbol').getBoundingClientRect();return {overflow:document.documentElement.scrollWidth>innerWidth+1,valueFits:value.left>=outer.left&&value.right<=outer.right&&value.bottom<=outer.bottom,controlsFit:button.left>=outer.left&&button.right<=outer.right,noOverlap:label.right<=symbol.left+1||symbol.right<=label.left+1,width:outer.width,height:outer.height};});
 assert.equal(geometry.overflow,false);assert(geometry.valueFits&&geometry.controlsFit&&geometry.noOverlap);Object.assign(r,{geometry,passed:true});await p.screenshot({path:`${out}/${engine.name()}-${locale}.png`});
 }catch(e){r.passed=false;r.error=e.stack;}finally{await c.close();}results.push(r);console.log(JSON.stringify(r));
 }}finally{await browser.close();}
}
await writeFile(out+'/results.json',JSON.stringify({mocked:true,physicalDevices:false,results},null,2));if(results.some(r=>!r.passed))process.exitCode=1;
