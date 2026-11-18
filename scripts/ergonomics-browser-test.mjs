import assert from 'node:assert/strict';
import {chromium,firefox,webkit}from'playwright';
import{mkdir,writeFile}from'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4312',out=process.env.ERGONOMICS_OUTPUT||'reports/ergonomics/interactions';await mkdir(out,{recursive:true});const results=[];
for(const engine of(process.env.ERGONOMICS_ENGINES||'chromium,firefox,webkit').split(',')){
 const browser=await({chromium,firefox,webkit})[engine].launch(engine==='chromium'?{args:['--no-sandbox']}:{});
 for(const prefix of['','/testnet'])for(const[width,locale,theme]of[[320,'fr','dark'],[390,'en','light'],[768,'ar','dark'],[899,'fr','light'],[900,'en','dark'],[1180,'fr','light'],[1440,'en','dark']]){
  const context=await browser.newContext({viewport:{width,height:900},hasTouch:width<900,colorScheme:theme,bypassCSP:true});const page=await context.newPage(),errors=[],row={engine,prefix,width,locale,theme,passed:false};page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000);
  const checkBounds=async()=>assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Page overflows horizontally');
  const overlap=async(a,b)=>page.evaluate(([a,b])=>{const x=document.querySelector(a).getBoundingClientRect(),y=document.querySelector(b).getBoundingClientRect();return Math.min(x.right,y.right)-Math.max(x.left,y.left)>1&&Math.min(x.bottom,y.bottom)-Math.max(x.top,y.top)>1;},[a,b]);
  try{
   await page.goto(base+prefix+'/?lang='+locale,{waitUntil:'domcontentloaded'});await page.locator('.compact-tx-row').first().waitFor();await page.evaluate(()=>document.fonts.ready);
   assert.equal(await overlap('.utilization-metric .info-button','.utilization-gauge'),false,'Gauge and help target overlap');
   assert(await page.locator('.utilization-gauge').evaluate(el=>{const a=el.getBoundingClientRect(),b=el.closest('.metric').getBoundingClientRect();return a.top>=b.top&&a.left>=b.left&&a.right<=b.right&&a.bottom<=b.bottom;}),'Gauge clipped');
   row.firstTransactionY=await page.locator('.compact-tx-row').first().evaluate(el=>el.getBoundingClientRect().top+scrollY);
   if(width<900){
    assert.equal(await page.getByRole('tab').count(),2);assert.equal(await page.locator('#home-feed-blocks').isVisible(),false);
    const tx=page.locator('#home-tab-transactions'),blocks=page.locator('#home-tab-blocks');
    await tx.focus();await page.keyboard.press('ArrowRight');assert.equal(await blocks.getAttribute('aria-selected'),'true');await page.locator('#home-feed-blocks .compact-block-row').first().waitFor();assert.equal(await page.locator('#home-feed-transactions').isVisible(),false);
    await page.keyboard.press('Home');assert.equal(await tx.getAttribute('aria-selected'),'true');
    await blocks.click();await page.setViewportSize({width:1000,height:900});await page.waitForFunction(()=>!document.querySelector('.home-feed-tabs'));assert(await page.locator('#home-feed-blocks').isVisible());assert(await page.locator('#home-feed-transactions').isVisible());
    await page.setViewportSize({width,height:900});await page.waitForFunction(()=>!!document.querySelector('.home-feed-tabs'));assert.equal(await blocks.getAttribute('aria-selected'),'true');await tx.click();
   }else{assert.equal(await page.getByRole('tab').count(),0);assert(await page.locator('#home-feed-blocks').isVisible());}
   await checkBounds();await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`${out}/${engine}-${prefix?'sepolia':'mainnet'}-${width}-home.png`});
   if(width<1180){await page.locator('.drawer-trigger').click();await page.locator('.drawer-category').first().click();assert.equal(await page.locator('.drawer-links .nav-section-start').count(),2);assert(await page.locator('main').evaluate(el=>el.inert));await page.screenshot({path:`${out}/${engine}-${prefix?'sepolia':'mainnet'}-${width}-menu.png`});await page.keyboard.press('Escape');assert(await page.locator('.drawer-trigger').evaluate(el=>document.activeElement===el));}
   else{await page.locator('[data-group="chain"]').click();assert.equal(await page.locator('.nav-popover .nav-section-start').count(),2);await page.keyboard.press('Escape');}
   await page.goto(base+prefix+'/stats?lang='+locale,{waitUntil:'domcontentloaded'});await page.locator('.stats-chart-card').first().waitFor();await page.evaluate(()=>document.fonts.ready);
   assert.equal(await page.locator('.stats-essential article').count(),4);assert.equal(await page.locator('.stats-totals').getAttribute('open'),null);
   const input=page.locator('.stats-search input');assert.equal(await overlap('.stats-search input','.stats-search svg'),false,'Search icon overlaps text');
   row.firstChartY=await page.locator('.stats-chart-card').first().evaluate(el=>el.getBoundingClientRect().top+scrollY);if(width<=390)assert(row.firstChartY<740,'Mobile chart buried below secondary totals');
   await page.locator('.stats-totals summary').click();assert(await page.locator('.stats-totals article').first().isVisible());assert((await page.locator('.stats-totals article').count())>=14);await checkBounds();
   await page.locator('.stats-totals summary').press('Enter');assert.equal(await page.locator('.stats-totals article').first().isVisible(),false);
   await input.fill('nonsense-not-a-chart');await page.locator('.stat-chart-grid .empty').waitFor();await input.fill('');await page.locator('.stats-chart-card').first().waitFor();
   if(width<1180){await page.locator('.stats-category-select select').selectOption('blocks');assert.equal(new URL(page.url()).searchParams.get('category'),'blocks');}
   else{await page.locator('.stats-categories [data-category=""]').click();assert.equal(new URL(page.url()).searchParams.get('category'),'');await page.locator('.stats-categories [data-category="blocks"]').click();assert.equal(new URL(page.url()).searchParams.get('category'),'blocks');}
   await checkBounds();await page.evaluate(()=>scrollTo(0,0));await page.addScriptTag({path:'node_modules/axe-core/axe.min.js'});row.violations=await page.evaluate(async()=>(await axe.run('main',{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})));assert.deepEqual(row.violations,[]);assert.deepEqual(errors,[]);
   await page.screenshot({path:`${out}/${engine}-${prefix?'sepolia':'mainnet'}-${width}-stats.png`});row.passed=true;
  }catch(error){row.error=error.stack;await page.screenshot({path:`${out}/failure-${engine}-${prefix?'sepolia':'mainnet'}-${width}.png`}).catch(()=>{});}
  results.push(row);console.log(JSON.stringify(row));await writeFile(out+'/results.json',JSON.stringify({base,complete:false,results},null,2));await context.close();
 }
 await browser.close();
}
await writeFile(out+'/results.json',JSON.stringify({base,complete:true,passed:results.every(r=>r.passed),physicalDevices:false,realApi:true,results},null,2));if(results.some(r=>!r.passed))process.exitCode=1;
