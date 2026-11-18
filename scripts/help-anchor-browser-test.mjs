import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4310',out=process.env.HELP_ANCHOR_OUTPUT||'reports/touch-help/anchor',results=[];
await mkdir(out,{recursive:true});
for(const engine of['chromium','firefox','webkit']){
 const browser=await({chromium,firefox,webkit})[engine].launch(engine==='chromium'?{args:['--no-sandbox']}:{});
 try{for(const prefix of['','/testnet'])for(const width of[390,1440]){
  const context=await browser.newContext({viewport:{width,height:900},hasTouch:width<500}),page=await context.newPage(),row={engine,prefix,width,passed:false},errors=[];page.setDefaultTimeout(20000);page.on('pageerror',error=>errors.push(error.message));
  try{
   await page.goto(base+prefix+'/accounts?lang=fr',{waitUntil:'domcontentloaded'});const target=page.locator('.ledger-heading-title .info-button'),anchor=page.locator('.ledger-heading-title'),panel=page.locator('.info-floating');await target.waitFor();await page.evaluate(()=>document.fonts.ready);
   await page.evaluate(()=>{
    const request=window.requestAnimationFrame,cancel=window.cancelAnimationFrame;
    window.helpFrames={calls:0,pending:new Set()};
    window.requestAnimationFrame=callback=>{let id=request(time=>{window.helpFrames.pending.delete(id);window.helpFrames.calls++;callback(time);});window.helpFrames.pending.add(id);return id;};
    window.cancelAnimationFrame=id=>{window.helpFrames.pending.delete(id);cancel(id);};
   });
   await target.click();await panel.waitFor();const before={anchor:await target.boundingBox(),panel:await panel.boundingBox()};
   await anchor.evaluate(element=>element.style.transform='translateY(80px)');
   await page.waitForFunction(()=>{const a=document.querySelector('.ledger-heading-title .info-button').getBoundingClientRect(),p=document.querySelector('.info-floating').getBoundingClientRect();return Math.abs(p.top-a.bottom-8)<1;});
   const after={anchor:await target.boundingBox(),panel:await panel.boundingBox()};row.motion={anchor:after.anchor.y-before.anchor.y,panel:after.panel.y-before.panel.y};assert(Math.abs(row.motion.anchor-80)<1&&Math.abs(row.motion.panel-80)<1);
   await anchor.evaluate(element=>element.style.removeProperty('transform'));
   await page.waitForFunction(()=>{const a=document.querySelector('.ledger-heading-title .info-button').getBoundingClientRect(),p=document.querySelector('.info-floating').getBoundingClientRect();return Math.abs(p.top-a.bottom-8)<1;});
   const oldTitle=await anchor.locator('h1').innerText();await anchor.locator('h1').evaluate(element=>{element.style.maxWidth='170px';element.textContent='Comptes dont le nom occupe maintenant plusieurs lignes';});
   await page.waitForFunction(()=>{const a=document.querySelector('.ledger-heading-title .info-button').getBoundingClientRect(),p=document.querySelector('.info-floating').getBoundingClientRect();return Math.abs(p.top-a.bottom-8)<1;});
   row.wrappedAnchorY=(await target.boundingBox()).y;assert(row.wrappedAnchorY>before.anchor.y+10);await page.screenshot({path:`${out}/${engine}-${prefix?'sepolia':'mainnet'}-${width}-wrapped.png`});
   await page.keyboard.press('Escape');await panel.waitFor({state:'hidden'});assert(await target.evaluate(element=>document.activeElement===element));
   await page.waitForTimeout(80);const closed=await page.evaluate(()=>({calls:window.helpFrames.calls,pending:window.helpFrames.pending.size}));await page.waitForTimeout(200);const idle=await page.evaluate(()=>({calls:window.helpFrames.calls,pending:window.helpFrames.pending.size}));assert.equal(closed.pending,0);assert.deepEqual(idle,closed,'Anchor tracking continued after closing');row.trackingStopped=true;
   await anchor.locator('h1').evaluate((element,text)=>{element.style.removeProperty('max-width');element.textContent=text;},oldTitle);
   await page.setViewportSize({width,height:240});await target.scrollIntoViewIfNeeded();await target.click();await panel.waitFor();await panel.locator('.info-body').evaluate(element=>{const span=document.createElement('span');span.textContent=' Informations complémentaires sur les données et leur provenance.'.repeat(30);element.append(span);});
   await page.locator('.info-expanded').waitFor();await page.waitForFunction(()=>document.activeElement?.classList.contains('info-body'));
   await anchor.evaluate(element=>element.style.display='none');await panel.waitFor({state:'hidden'});await page.waitForFunction(()=>document.activeElement?.id==='main-content');row.hiddenAnchorClosed=true;
   const pending=await page.evaluate(()=>window.helpFrames.pending.size);assert.equal(pending,0);assert.deepEqual(errors,[]);row.passed=true;
  }catch(error){row.error=error.stack;await page.screenshot({path:`${out}/failure-${engine}-${prefix?'sepolia':'mainnet'}-${width}.png`}).catch(()=>{});}finally{await context.close();}
  results.push(row);console.log(JSON.stringify(row));await writeFile(out+'/results.json',JSON.stringify({base,complete:false,results},null,2));
 }}finally{await browser.close();}
}
await writeFile(out+'/results.json',JSON.stringify({base,complete:true,passed:results.every(r=>r.passed),mockedApi:false,physicalDeviceTest:false,results},null,2));if(results.some(r=>!r.passed))process.exitCode=1;
