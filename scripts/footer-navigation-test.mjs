import assert from 'node:assert/strict';import {chromium,firefox,webkit} from 'playwright-core';import {mkdir,writeFile,readFile} from 'node:fs/promises';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),base=process.env.BASE_URL||'http://127.0.0.1:4319',out=process.env.FOOTER_NAV_OUTPUT||'reports/footer/navigation',results=[];await mkdir(out,{recursive:true});
for(const engine of(process.env.FOOTER_NAV_ENGINES||'chromium,firefox,webkit').split(',')){
 const browser=await({chromium,firefox,webkit})[engine].launch(engine==='chromium'?{args:['--no-sandbox']}:{});
 try{for(const prefix of['','/testnet'])for(const width of[390,1440]){
  const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage(),locale=prefix?'ar':'fr',row={engine,prefix,width,passed:false},errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.routeWebSocket(/\/api\/live$/,ws=>ws.close());await context.route('**/api/**',route=>route.fulfill({status:503,json:{error:'Controlled unrelated source'}}));
  try{await page.goto(base+prefix+'/?lang='+locale,{waitUntil:'domcontentloaded'});await page.locator('.site-footer').waitFor();await page.locator('.site-footer').scrollIntoViewIfNeeded();
   assert.equal(await page.locator('.site-footer nav').count(),2);assert.equal(await page.locator('.footer-status').textContent(),(prefix?'Ink Sepolia':'Ink Mainnet')+'N/A');assert(await page.evaluate(()=>getComputedStyle(document.querySelector('.footer-status')).color===getComputedStyle(document.querySelector('.footer-brand p')).color));
   await page.evaluate(await readFile(require.resolve('axe-core/axe.min.js'),'utf8'));const audit=await page.evaluate(()=>axe.run(document.querySelector('.site-footer'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));assert.deepEqual(audit.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);
   const docs=page.locator('.site-footer a[href="https://docs.inkonchain.com"]');assert.equal(await docs.getAttribute('target'),'_blank');assert((await docs.getAttribute('rel')).includes('noreferrer'));
   for(const route of['/blocks','/advanced','/developers']){const link=page.locator('.site-footer a[href="'+prefix+route+'?lang='+locale+'"]');await link.focus();assert(await link.evaluate(el=>document.activeElement===el));await page.keyboard.press('Enter');await page.waitForURL(base+prefix+route+'?lang='+locale);assert.equal(await page.locator('html').getAttribute('lang'),locale);}
   const home=page.locator('.site-footer .brand');await home.focus();await page.keyboard.press('Enter');await page.waitForURL(base+prefix+'/?lang='+locale);await page.locator('.site-footer').scrollIntoViewIfNeeded();assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.screenshot({path:`${out}/${engine}-${prefix?'sepolia':'mainnet'}-${width}.png`});row.passed=true;
  }catch(error){row.error=error.stack;await page.screenshot({path:`${out}/failure-${engine}-${prefix?'sepolia':'mainnet'}-${width}.png`}).catch(()=>{});}finally{await context.close();}
  results.push(row);console.log(JSON.stringify(row));await writeFile(`${out}/results.json`,JSON.stringify({base,complete:false,results},null,2));
 }}finally{await browser.close();}
}
await writeFile(`${out}/results.json`,JSON.stringify({base,complete:true,passed:results.every(r=>r.passed),mockedApi:true,physicalDeviceTest:false,results},null,2));if(results.some(r=>!r.passed))process.exitCode=1;
