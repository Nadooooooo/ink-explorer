import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4310',out=process.env.ACTIVITY_REAL_OUTPUT||'reports/activity-controls/real',sources=JSON.parse(await readFile(process.env.ACTIVITY_SOURCES||'reports/activity-controls/sources.json')),results=[];
await mkdir(out,{recursive:true});const browser=await chromium.launch({args:['--no-sandbox']});
try{for(const prefix of['','/testnet'])for(const width of(process.env.ACTIVITY_REAL_WIDTHS||'390,768,1440').split(',').map(Number)){
 const s=sources[prefix?'sepolia':'mainnet'],wallet=typeof s.transaction.from==='string'?s.transaction.from:s.transaction.from.hash;
 for(const[name,path,selector]of [['home','/','.compact-tx-row'],['transactions','/txs','.full-tx-row'],['blocks','/blocks','.block-row'],['address','/address/'+wallet,'.address-activity .tx-row'],['block','/block/'+s.block.height+'?tab=transactions','.block-transactions .tx-row']].filter(([name])=>!process.env.ACTIVITY_REAL_ROUTES||process.env.ACTIVITY_REAL_ROUTES.split(',').includes(name))){
  const context=await browser.newContext({viewport:{width,height:1000},hasTouch:true,colorScheme:width===768?'dark':'light'}),page=await context.newPage(),row={prefix,width,name,passed:false},errors=[];
  page.setDefaultTimeout(25000);page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>{window.copies=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>window.copies.push(value)}})});
  try{await page.goto(base+prefix+path+(path.includes('?')?'&':'?')+'lang=fr',{waitUntil:'domcontentloaded'});const record=page.locator(selector).first();await record.waitFor();await page.evaluate(()=>document.fonts.ready);row.height=(await record.boundingBox()).height;const buttons=record.locator('.copy-button:visible');row.targets=await buttons.count();assert(row.targets>0||name==='home'&&width<=760,'Expected usable copy controls');
   for(const button of await buttons.all()){await button.focus();await button.scrollIntoViewIfNeeded();const box=await button.boundingBox();assert(box.width>=43.9&&box.height>=43.9);const expected=await button.evaluate(element=>{const value=element.parentElement.querySelector('.mono').title;element.click();return value});await page.waitForFunction(expected=>window.copies.at(-1)===expected,expected);}
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);await record.scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/${prefix?'sepolia':'mainnet'}-${width}-${name}.png`});row.passed=true;
  }catch(error){row.error=error.stack;}finally{await context.close();}results.push(row);console.log(JSON.stringify(row));await writeFile(out+'/results.json',JSON.stringify({base,complete:false,results},null,2));
 }
}}finally{await browser.close();}
await writeFile(out+'/results.json',JSON.stringify({base,complete:true,passed:results.every(r=>r.passed),mockedApi:false,mockedClipboard:true,physicalDeviceTest:false,results},null,2));if(results.some(r=>!r.passed))process.exitCode=1;
