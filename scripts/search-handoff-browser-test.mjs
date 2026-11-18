import assert from 'node:assert/strict';import{readFile,writeFile,mkdir}from'node:fs/promises';import{registerHooks}from'node:module';import{chromium,firefox,webkit}from'playwright-core';
registerHooks({resolve(s,c,n){try{return n(s,c)}catch(e){if(s.startsWith('./')&&c.parentURL?.includes('/src/')&&!/\.[a-z]+$/.test(s))return n(s+'.ts',c);throw e;}}});
const{handleRequest}=await import('../cloudflare/worker.mjs');const base=process.env.BASE_URL||'http://127.0.0.1:4214',publicSite=base.startsWith('https:'),out=process.env.HANDOFF_OUTPUT||'reports/search-handoff/browser';await mkdir(out,{recursive:true});
const template=await readFile('dist/index.html','utf8'),entry=template.match(/<script type="module"[^>]+src="([^"]+)"/)[1],results=[];
const env={PUBLIC_URL:base,ASSETS:{async fetch(r){try{return new Response(await readFile('dist'+new URL(r.url).pathname));}catch{return new Response('Missing',{status:404});}}}};
for(const[engine,launcher]of Object.entries({chromium,firefox,webkit})){
 const browser=await launcher.launch(engine==='chromium'?{args:['--no-sandbox']}:{});
 try{for(const[prefix,width,lang]of[['',1440,'fr'],['/testnet',390,'ar']])for(const focus of['input','submit','blurred']){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[],searches=[];let release;const held=new Promise(r=>release=r);
  page.on('pageerror',e=>errors.push(e.message));
  if(publicSite&&process.env.INK_RELEASE_VERSION)await context.setExtraHTTPHeaders({'Cloudflare-Workers-Version-Overrides':`inkexplorer="${process.env.INK_RELEASE_VERSION}"`});
  if(!publicSite)await context.route('**/*',async route=>{if(route.request().resourceType()!=='document')return route.fallback();const r=await handleRequest(new Request(route.request().url()),env);return route.fulfill({status:r.status,headers:Object.fromEntries(r.headers),body:Buffer.from(await r.arrayBuffer())});});
  await context.route('**/api/**',r=>{const url=new URL(r.request().url());if(url.pathname.endsWith('/search')){searches.push(url.searchParams.get('q'));return r.fulfill({json:{items:[],next_page_params:null}});}return r.fulfill({status:503,json:{error:'Controlled API outage'}});});
  await context.routeWebSocket(/\/api\/live$/,s=>s.close());await context.route('**'+entry,async r=>{await held;await r.fallback().catch(()=>{});});
  try{
   await page.goto(base+prefix+'/?lang='+lang,{waitUntil:'commit'});const input=page.locator('.global-search input:not([type=hidden])'),submit=page.locator('.global-search button[type=submit]'),query='ink typed before startup';
   await input.fill(query);await input.evaluate(e=>e.setSelectionRange(2,8,'backward'));
   if(focus==='submit')await submit.focus();else if(focus==='blurred')await input.blur();
   release();await page.locator('#ink-startup').waitFor({state:'detached'});await page.waitForTimeout(100);
   assert.equal(await input.inputValue(),query,'Typed text survives initial React mount');
   assert.equal(await input.evaluate(e=>document.activeElement===e),focus==='input');assert.equal(await submit.evaluate(e=>document.activeElement===e),focus==='submit');
   assert.deepEqual(await input.evaluate(e=>[e.selectionStart,e.selectionEnd,e.selectionDirection]),[2,8,'backward'],'Selection survives initial mount');
   if(focus==='input'||focus==='submit')await page.keyboard.press('Enter');else await submit.click();
   await page.waitForFunction(query=>location.pathname.endsWith('/search')&&new URLSearchParams(location.search).get('q')===query,query);
   assert.equal(new URL(page.url()).pathname,prefix+'/search');assert(searches.includes(query),'Submitted React state uses the preserved query');
   // Returning home must not replay the startup value on a later navigation.
   await page.evaluate(url=>{history.pushState({},'',url);dispatchEvent(new PopStateEvent('popstate'));},prefix+'/?lang='+lang);
   await page.waitForFunction(()=>document.querySelector('.global-search input')?.value==='');assert.deepEqual(errors,[]);
   results.push({engine,prefix,width,lang,focus,query,passed:true});console.log('PASS',engine,prefix||'mainnet',focus);
  }catch(error){await writeFile(out+'/failure.json',JSON.stringify({engine,prefix,width,lang,focus,error:error.stack,errors,searches},null,2));throw error;}
  finally{release();await context.close();}
 }}finally{await browser.close();}
}
await writeFile(out+'/results.json',JSON.stringify({base,publicSite,apiMocked:true,physicalDeviceTest:false,results},null,2));console.log(`${results.length} startup search handoff scenarios passed`);
