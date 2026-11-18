import{chromium,firefox,webkit}from'playwright-core';import assert from'node:assert/strict';import{mkdir,writeFile}from'node:fs/promises';import{registerHooks}from'node:module';
registerHooks({resolve(s,c,n){try{return n(s,c)}catch(e){if(s.startsWith('.')&&!/\.[a-z]+$/.test(s))return n(s+'.ts',c);throw e}}});
const{message,locales}=await import('../src/i18n.ts');
const base=process.env.BASE_URL||'http://127.0.0.1:4310',results=[];await mkdir('reports/redesign/locales',{recursive:true});
for(const [engine,implementation]of Object.entries({chromium,firefox,webkit})){
 const browser=await implementation.launch(engine==='chromium'?{args:['--no-sandbox']}:{ });
 try{for(const prefix of ['', '/testnet'])for(const locale of locales){const context=await browser.newContext({viewport:{width:390,height:844}});const page=await context.newPage(),requests=[],errors=[];page.on('request',request=>requests.push(request.url()));page.on('pageerror',error=>errors.push(error.message));const row={engine,prefix,locale,passed:false};
  try{await page.goto(`${base}${prefix}/developers?lang=${locale}`,{waitUntil:'domcontentloaded'});await page.locator('.api-page h1').waitFor();assert.equal(await page.locator('.api-intro p').innerText(),message(locale,'Public read access. No API key required.'));assert.equal(await page.locator('#filters h2').innerText(),message(locale,'Transaction filters'));assert.equal(await page.locator('html').getAttribute('lang'),locale);assert.equal(await page.locator('html').getAttribute('dir'),locale==='ar'?'rtl':'ltr');
   row.localeChunks=requests.filter(url=>/\/assets\/(en|zh|hi|es|fr|ar|bn|pt|ru|ja)-[^/]+\.js/.test(url));assert.equal(row.localeChunks.length,locale==='en'?0:1);if(locale!=='en')assert.ok(row.localeChunks[0].includes(`/assets/${locale}-`));
   await page.locator('.drawer-trigger').click();await page.locator('.drawer-preferences .language-picker select').selectOption(locale==='fr'?'ja':'fr');const next=locale==='fr'?'ja':'fr';await page.waitForFunction(next=>document.documentElement.lang===next,next);assert.equal(await page.locator('.api-intro p').innerText(),message(next,'Public read access. No API key required.'));assert.equal(await page.evaluate(()=>localStorage.getItem('ink-observer-language')),next);await page.keyboard.press('Escape');assert.equal(await page.locator('.mobile-drawer').count(),0);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);row.passed=true;
  }catch(error){row.error=error.message;}results.push(row);console.log(JSON.stringify(row));await context.close();
 }}finally{await browser.close();}
}
await writeFile('reports/redesign/locales/results.json',JSON.stringify({complete:true,passed:results.every(row=>row.passed),results},null,2));if(results.some(row=>!row.passed))process.exitCode=1;
