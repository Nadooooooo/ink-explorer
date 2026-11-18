import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright-core';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4310',out=process.env.DETAIL_COPY_OUTPUT||'reports/contract-controls/copy',sources=JSON.parse(await readFile(process.env.DETAIL_SOURCES||'reports/contract-controls/sources.json')),results=[];
const widths=(process.env.DETAIL_WIDTHS||'320,768,1440').split(',').map(Number),engines=(process.env.DETAIL_ENGINES||'chromium,firefox,webkit').split(',');
await mkdir(out,{recursive:true});
for(const engine of engines){const browser=await({chromium,firefox,webkit})[engine].launch(engine==='chromium'?{args:['--no-sandbox']}:{});
try{for(const prefix of['','/testnet'])for(const width of widths){const s=sources[prefix?'sepolia':'mainnet'],locale=width===768?'ar':'fr';
for(const[name,path,ready]of[['account','/address/'+s.wallet,'.address-summary'],['proxy','/address/'+s.proxy+'?tab=overview','.address-facts'],['tx','/tx/'+s.tx,'.transaction-definitions'],['token','/token/'+s.contract,'.token-summary'],['block','/block/'+s.block,'.block-definitions']]){
const context=await browser.newContext({viewport:{width,height:900},hasTouch:true,colorScheme:width===768?'dark':'light'}),page=await context.newPage(),row={engine,prefix,width,name,passed:false},errors=[];page.setDefaultTimeout(25000);page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{window.copies=[];window.rejectCopy=false;Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{if(window.rejectCopy)throw Error('Clipboard denied');window.copies.push(value)}}});document.execCommand=()=>false;});
try{await page.goto(base+prefix+path+(path.includes('?')?'&':'?')+'lang='+locale,{waitUntil:'domcontentloaded'});await page.locator(ready).waitFor();await page.evaluate(()=>document.fonts.ready);
const buttons=page.locator(':is(.detail-header,.definitions,.token-contract-id) .copyable > .copy-button:visible');row.targets=[];assert(await buttons.count()>0);
for(const button of await buttons.all()){
await button.evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));
const measured=await button.evaluate(e=>{const r=e.getBoundingClientRect(),text=e.parentElement.querySelector('.mono'),box=text.getBoundingClientRect();return{width:r.width,height:r.height,expected:text.getAttribute('title')||text.textContent,overlap:Math.min(r.right,box.right)-Math.max(r.left,box.left)>1&&Math.min(r.bottom,box.bottom)-Math.max(r.top,box.top)>1,hit:document.elementFromPoint(r.left+2,r.top+r.height/2)?.closest('button')===e}});
assert(measured.width>=43.9&&measured.height>=43.9,'Copy target is small');assert(!measured.overlap&&measured.hit,'Copy target overlaps its text or is covered');const box=await button.boundingBox();await page.touchscreen.tap(box.x+2,box.y+box.height/2);await page.waitForFunction(value=>window.copies.at(-1)===value,measured.expected);row.targets.push(measured);
}
const first=buttons.first(),expected=row.targets[0].expected;await page.evaluate(()=>window.rejectCopy=true);await first.click();const fallback=first.locator('..').locator('.copy-fallback input');await fallback.waitFor();assert.equal(await fallback.inputValue(),expected);assert(await fallback.evaluate(e=>document.activeElement===e&&e.selectionStart===0&&e.selectionEnd===e.value.length));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
await page.evaluate(()=>window.rejectCopy=false);await first.click();await fallback.waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>window.copies.at(-1)),expected);assert.deepEqual(errors,[]);
await page.evaluate(()=>{document.activeElement?.blur();scrollTo(0,0)});await page.screenshot({path:`${out}/${engine}-${prefix?'sepolia':'mainnet'}-${width}-${name}.png`});row.passed=true;
}catch(e){row.error=e.stack;await page.screenshot({path:`${out}/failure-${engine}-${prefix?'sepolia':'mainnet'}-${width}-${name}.png`}).catch(()=>{});}finally{await context.close();}
results.push(row);console.log(JSON.stringify({engine,prefix,width,name,passed:row.passed,error:row.error,targets:row.targets?.length}));await writeFile(out+'/results.json',JSON.stringify({base,complete:false,results},null,2));
}}}finally{await browser.close();}}
await writeFile(out+'/results.json',JSON.stringify({base,complete:true,passed:results.every(r=>r.passed),mockedClipboard:true,mockedApi:false,physicalDeviceTest:false,results},null,2));if(results.some(r=>!r.passed))process.exitCode=1;
