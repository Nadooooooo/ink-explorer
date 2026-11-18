import{chromium}from'playwright';import{mkdir,writeFile}from'node:fs/promises';import assert from'node:assert/strict';
const base=process.env.BASE_URL||'https://inkexplorer.xyz',out='reports/redesign/public-browser',results=[];await mkdir(out,{recursive:true});const browser=await chromium.launch({args:['--no-sandbox']});
try{for(const prefix of ['', '/testnet'])for(const width of [390,1440]){
 const context=await browser.newContext({viewport:{width,height:900},colorScheme:width===390?'dark':'light'});const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const row={prefix,width,passed:false};
 try{
  await page.goto(base+prefix+'/?lang=fr',{waitUntil:'domcontentloaded'});await page.locator('.compact-tx-row').first().waitFor();await page.waitForFunction(()=>document.querySelector('[data-live-transport]')?.getAttribute('data-live-transport')==='websocket');await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.locator('html').getAttribute('lang'),'fr');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.screenshot({path:`${out}/${prefix?'testnet':'mainnet'}-${width}.png`,fullPage:true});
  if(width===390){await page.locator('.drawer-trigger').click();await page.locator('.drawer-category').first().click();assert.equal(await page.locator('.drawer-links a').count(),11);await page.screenshot({path:`${out}/${prefix?'testnet':'mainnet'}-drawer.png`});await page.locator('.drawer-links a[href*="/txs"]').click();await page.locator('.tx-row').first().waitFor();assert.equal(await page.locator('.mobile-drawer').count(),0);await page.locator('.drawer-trigger').click();await page.locator('.drawer-category').nth(2).click();await page.locator('.drawer-links a[href*="/gas-tracker"]').click();await page.locator('.gas-estimates').waitFor();}
  else{await page.locator('[data-group=stats]').click();await page.locator('.nav-popover a[href*="/analytics"]').click();await page.locator('.stats-counters strong').first().waitFor();await page.locator('.stats-chart-card').first().scrollIntoViewIfNeeded();await page.locator('.stats-chart-card .interactive-chart').first().waitFor();}
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);row.passed=true;
 }catch(error){row.error=error.message;}
 await context.close();results.push(row);console.log(JSON.stringify(row));
}}finally{await browser.close();await writeFile(out+'/results.json',JSON.stringify({base,recordedAt:new Date().toISOString(),passed:results.every(r=>r.passed),results},null,2));}
if(results.some(r=>!r.passed))process.exitCode=1;
