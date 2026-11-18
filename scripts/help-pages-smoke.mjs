import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4310',out=process.env.HELP_PAGES_OUTPUT||'reports/help-interactions/real-pages';
await mkdir(out,{recursive:true});const results=[];
const browser=await chromium.launch({args:['--no-sandbox']});
try{for(const prefix of['','/testnet'])for(const width of[390,1440])for(const route of['','gas-tracker','stats','accounts','tokens']){
 const row={prefix,width,route:route||'home',passed:false,mockedApi:false},context=await browser.newContext({viewport:{width,height:844},hasTouch:width<500,isMobile:width<500,colorScheme:width<500?'light':'dark'}),page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(25000);
 try{
  await page.goto(base+prefix+'/'+route+'?lang=fr',{waitUntil:'domcontentloaded'});
  const targets=page.locator('main .info-button:not(.summary-retry)');await targets.first().waitFor();
  row.helps=[];
  for(const target of(await targets.all()).slice(0,2)){
   await target.scrollIntoViewIfNeeded();await target.click();const panel=page.locator('.info-floating');await panel.waitFor();
   const box=await panel.boundingBox();assert(box.x>=0&&box.x+box.width<=width+1&&box.y>=0&&box.y+box.height<=844);
   const text=await panel.innerText();assert(text.trim().length>0&&!/undefined|NaN/.test(text));
   row.helps.push({label:await target.getAttribute('aria-label'),box,expanded:await panel.locator('.info-close').count()>0});
   if(row.helps.length===1)await page.screenshot({path:`${out}/${prefix?'sepolia':'mainnet'}-${width}-${route||'home'}.png`});
   await page.keyboard.press('Escape');await panel.waitFor({state:'hidden'});assert(await target.evaluate(e=>document.activeElement===e));
  }
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);row.passed=true;
 }catch(error){row.error=error.stack;await page.screenshot({path:`${out}/failure-${prefix?'sepolia':'mainnet'}-${width}-${route||'home'}.png`}).catch(()=>{});}
 finally{await context.close();}
 results.push(row);console.log(JSON.stringify(row));await writeFile(out+'/results.json',JSON.stringify({base,complete:false,results},null,2));
}}finally{await browser.close();}
await writeFile(out+'/results.json',JSON.stringify({base,complete:true,passed:results.every(r=>r.passed),physicalDeviceTest:false,results},null,2));if(results.some(r=>!r.passed))process.exitCode=1;
