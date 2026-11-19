import {chromium,firefox,webkit} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.BASE_URL||'http://127.0.0.1:4310',out=process.env.POLISH_OUTPUT||'reports/polish/interactions';
await mkdir(out,{recursive:true});const results=[];
for(const [engine,launcher]of Object.entries({chromium,firefox,webkit}).filter(([engine])=>!process.env.POLISH_ENGINES||process.env.POLISH_ENGINES.split(',').includes(engine))){
 const browser=await launcher.launch(engine==='chromium'?{args:['--no-sandbox']}:{ });
 try{for(const width of [320,390])for(const theme of (process.env.POLISH_THEMES||'light,dark').split(','))for(const lang of ['fr','ar']){
  const context=await browser.newContext({viewport:{width,height:844},colorScheme:theme,hasTouch:true});const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));const row={engine,width,theme,lang,passed:false};
  const visit=async path=>{await page.goto(base+path+(path.includes('?')?'&':'?')+'lang='+lang,{waitUntil:'domcontentloaded'});await page.locator('h1').waitFor();};
  const bounded=async locator=>{const b=await locator.boundingBox();assert.ok(b&&b.x>=-1&&b.x+b.width<=width+1&&b.y>=-1&&b.y+b.height<=844+1,JSON.stringify(b));};
  try{
   await visit('/');await page.locator('.compact-tx-row').first().waitFor();
   await bounded(page.locator('.network-picker'));
   const header=await page.locator('.brand').first().boundingBox(),network=await page.locator('.network-picker').boundingBox();
   const overlapX=Math.min(header.x+header.width,network.x+network.width)-Math.max(header.x,network.x);
   const overlapY=Math.min(header.y+header.height,network.y+network.height)-Math.max(header.y,network.y);
   assert.ok(overlapX<=1 || overlapY<=1,'Brand/network overlap');
   const search=page.locator('.global-search input');assert.ok(await search.evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=16));
   await search.tap();await search.fill('WETH');await page.locator('.search-submit').tap();await page.waitForURL(/search|token/);
   await visit('/');await page.locator('.utilization-metric .info-button').tap();await bounded(page.locator('.info-floating'));
   await page.keyboard.press('Escape');assert.equal(await page.locator('.info-floating').count(),0);
   assert.ok(await page.locator('.utilization-metric .info-button').evaluate(el=>document.activeElement===el));
   await page.locator('.drawer-trigger').tap();await page.locator('.drawer-category').first().tap();await page.locator('.drawer-links a').last().scrollIntoViewIfNeeded();
   assert.ok(await page.locator('.mobile-drawer').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
   await page.locator('.drawer-back').scrollIntoViewIfNeeded();await page.locator('.drawer-back').tap();await page.keyboard.press('Escape');
   assert.equal(await page.locator('.mobile-drawer').count(),0);
   await visit('/stats');await page.locator('.stats-counters strong').first().waitFor();
   for(const index of [0,1,16,17]){const info=page.locator('.stats-counters .info-button').nth(index);await info.scrollIntoViewIfNeeded();await info.tap();await bounded(page.locator('.info-floating'));await page.keyboard.press('Escape');}
   await visit('/txs');await page.locator('.full-tx-row').first().waitFor();
   for(const metric of await page.locator('.transaction-summary .metric > strong').all())assert.ok(await metric.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Clipped summary');
   await visit('/address/0x4200000000000000000000000000000000000006');await page.locator('.full-tx-row').first().waitFor();
   const overlap=await page.locator('.full-tx-row').first().evaluate(el=>{
    const boxes=[...el.children].map(c=>({name:c.className,box:c.getBoundingClientRect()})).filter(x=>x.box.width&&x.box.height);
    return boxes.flatMap((a,i)=>boxes.slice(i+1).filter(b=>Math.min(a.box.right,b.box.right)-Math.max(a.box.left,b.box.left)>1&&Math.min(a.box.bottom,b.box.bottom)-Math.max(a.box.top,b.box.top)>1).map(b=>[a.name,b.name]));
   });assert.deepEqual(overlap,[],'Transaction cells overlap');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);
   row.passed=true;
  }catch(error){row.error=error.message;await page.screenshot({path:`${out}/${engine}-${width}-${theme}-${lang}.png`}).catch(()=>{});}
  results.push(row);console.log(JSON.stringify(row));await writeFile(out+'/results.json',JSON.stringify({complete:false,results},null,2));await context.close();
 }}finally{await browser.close();}
}
await writeFile(out+'/results.json',JSON.stringify({base,complete:true,passed:results.every(r=>r.passed),results},null,2));if(results.some(r=>!r.passed))process.exitCode=1;
