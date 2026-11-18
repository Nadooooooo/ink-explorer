import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4310',out=process.env.SEARCH_FOCUS_OUTPUT||'reports/mobile-density/search-focus';
await mkdir(out,{recursive:true});const results=[],axe=await readFile('node_modules/axe-core/axe.min.js','utf8');
for(const engine of['chromium','firefox','webkit']){const browser=await({chromium,firefox,webkit})[engine].launch(engine==='chromium'?{args:['--no-sandbox']}:{});
 try{for(const prefix of['','/testnet'])for(const forced of(engine==='chromium'?[false,true]:[false])){
  const row={engine,prefix,forced,passed:false},context=await browser.newContext({viewport:{width:390,height:360},hasTouch:true,...(engine!=='firefox'?{isMobile:true}:{}),forcedColors:forced?'active':'none',bypassCSP:true}),page=await context.newPage();
  try{
   await page.goto(base+prefix+'/stats?lang=fr',{waitUntil:'domcontentloaded'});await page.locator('.mobile-search-trigger').tap();await page.waitForFunction(()=>document.activeElement===document.querySelector('.global-search input'));await page.locator('.global-search input').fill('Ink');await page.evaluate(()=>document.fonts.ready);
   row.indicator=await page.locator('.global-search').evaluate(element=>{const field=getComputedStyle(element),input=getComputedStyle(element.querySelector('input'));return{fieldOutline:field.outlineStyle,fieldOutlineWidth:parseFloat(field.outlineWidth),fieldShadow:field.boxShadow,fieldBorder:field.borderColor,inputOutline:input.outlineStyle,box:element.getBoundingClientRect().toJSON()};});
   assert.equal(row.indicator.inputOutline,'none','The focused input adds an inner rectangle');if(forced)assert(row.indicator.fieldOutline!=='none'&&row.indicator.fieldOutlineWidth>=2);else assert(row.indicator.fieldShadow!=='none');assert(row.indicator.box.bottom<=360&&row.indicator.box.left>=0&&row.indicator.box.right<=390);
   await page.waitForTimeout(800);await page.screenshot({path:`${out}/${engine}-${prefix?'sepolia':'mainnet'}-${forced?'forced':'normal'}.png`});await page.evaluate(axe);row.violations=await page.evaluate(async()=>(await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})));assert.deepEqual(row.violations,[]);row.passed=true;
  }catch(error){row.error=error.stack;}finally{await context.close();}results.push(row);console.log(JSON.stringify(row));await writeFile(out+'/results.json',JSON.stringify({base,complete:false,results},null,2));
 }}finally{await browser.close();}
}
await writeFile(out+'/results.json',JSON.stringify({base,complete:true,passed:results.every(r=>r.passed),physicalDeviceTest:false,results},null,2));if(results.some(r=>!r.passed))process.exitCode=1;
