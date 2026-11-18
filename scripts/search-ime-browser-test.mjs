import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {registerHooks} from 'node:module';
import {chromium} from 'playwright-core';
registerHooks({resolve(s,c,n){try{return n(s,c)}catch(e){if(s.startsWith('./')&&c.parentURL?.includes('/src/')&&!/\.[a-z]+$/.test(s))return n(s+'.ts',c);throw e;}}});
const {handleRequest}=await import('../cloudflare/worker.mjs');
const base=process.env.BASE_URL||'http://127.0.0.1:4214',publicSite=base.startsWith('https:'),out=process.env.IME_OUTPUT||'reports/search-ime/browser';
const template=await readFile('dist/index.html','utf8'),entry=template.match(/<script type="module"[^>]+src="([^"]+)"/)[1];
const env={PUBLIC_URL:base,ASSETS:{async fetch(r){try{return new Response(await readFile('dist'+new URL(r.url).pathname));}catch{return new Response('Missing',{status:404});}}}};
const cases=[
 {name:'japanese-commit',preedit:'とうきょう',commit:'東京',expected:'東京'},
 {name:'chinese-replacement',initial:'token old tail',selection:[6,9],preedit:'nihao',commit:'你好',expected:'token 你好 tail'},
 {name:'korean-commit',preedit:'ㅎ',commit:'한',expected:'한'},
 {name:'cancel',preedit:'とうきょう',cancel:true,expected:''},
 {name:'blur',preedit:'とうきょう',blur:true,expected:'とうきょう'},
 {name:'already-committed',preedit:'とうきょう',commit:'東京',beforeRelease:true,expected:'東京'},
 {name:'long-composition',preedit:'とうきょう',commit:'東京',hold:true,expected:'東京'},
];
await mkdir(out,{recursive:true});const results=[],browser=await chromium.launch({args:['--no-sandbox']});
try{for(const [prefix,width,path] of [['',1440,'/'],['/testnet',390,'/'],['',390,'/blocks'],['/testnet',390,'/tokens']])for(const scenario of cases){
 const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),page=await context.newPage(),errors=[],searches=[];
 let release;const held=new Promise(r=>release=r);const row={prefix,width,path,scenario:scenario.name};
 page.on('pageerror',e=>errors.push(e.message));
 await context.addInitScript(()=>{window.imeEvents=[];window.cspErrors=[];document.addEventListener('securitypolicyviolation',e=>window.cspErrors.push(e.effectiveDirective));for(const type of ['compositionstart','compositionupdate','compositionend','input'])document.addEventListener(type,e=>window.imeEvents.push({type,data:e.data,value:e.target.value}),true);});
 if(publicSite&&process.env.INK_RELEASE_VERSION)await context.setExtraHTTPHeaders({'Cloudflare-Workers-Version-Overrides':`inkexplorer="${process.env.INK_RELEASE_VERSION}"`});
 if(!publicSite)await context.route('**/*',async r=>{if(r.request().resourceType()!=='document')return r.fallback();const response=await handleRequest(new Request(r.request().url()),env);await r.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});});
 await context.route('**/api/**',r=>{const url=new URL(r.request().url());if(url.pathname.endsWith('/search')){searches.push(url.searchParams.get('q'));return r.fulfill({json:{items:[],next_page_params:null}});}return r.fulfill({status:503,json:{error:'Controlled API outage'}});});
 await context.routeWebSocket(/\/api\/live$/,s=>s.close());
 await context.route('**'+entry,async r=>{await held;await r.fallback().catch(()=>{});});
 try{
  await page.goto(base+prefix+path+'?lang=ja',{waitUntil:'commit'});
  const input=page.locator('.global-search input:not([type=hidden])');
  if(path!=='/'&&width<=760)await page.locator('.mobile-search-trigger').click();
  await input.fill(scenario.initial||'');await input.focus();
  if(scenario.selection)await input.evaluate((e,selection)=>e.setSelectionRange(...selection),scenario.selection);
  await input.evaluate(e=>window.originalImeInput=e);
  const cdp=await context.newCDPSession(page);
  await cdp.send('Input.imeSetComposition',{text:scenario.preedit,selectionStart:scenario.preedit.length,selectionEnd:scenario.preedit.length});
  if(scenario.beforeRelease)await cdp.send('Input.insertText',{text:scenario.commit});
  release();
  if(!scenario.beforeRelease){
   await page.waitForFunction(()=>document.querySelector('#root')?.dataset.startupReady==='true');
   assert.equal(await input.evaluate(e=>e===window.originalImeInput),true,'Retain the browser-owned input until composition settles');
   if(scenario.hold)await page.waitForTimeout(8500);
   assert.equal(await page.locator('#ink-startup-reload').isVisible(),false,'An intentional composition wait must not display reload advice');
   if(scenario.cancel)await cdp.send('Input.imeSetComposition',{text:'',selectionStart:0,selectionEnd:0});
   else if(scenario.blur)await page.locator('.global-search button[type=submit]').focus();
   else await cdp.send('Input.insertText',{text:scenario.commit});
  }
  await page.locator('#ink-startup').waitFor({state:'detached'});
  assert.equal(await input.inputValue(),scenario.expected,'Only committed text survives the handoff');
  assert.equal(await input.evaluate(e=>document.activeElement===e),!scenario.blur,'Preserve the intended focus');
  assert.equal(await page.locator('[data-startup-composing]').count(),0);
  assert.equal(await page.locator('#root').getAttribute('data-startup-ready'),null);
  // Repeat a real composition after mount; the bootstrap must no longer own it.
  await input.focus();await input.evaluate(e=>e.setSelectionRange(e.value.length,e.value.length));
  await cdp.send('Input.imeSetComposition',{text:'ねこ',selectionStart:2,selectionEnd:2});
  await cdp.send('Input.insertText',{text:'猫'});
  const expected=scenario.expected+'猫';assert.equal(await input.inputValue(),expected);
  assert.equal(await page.locator('[data-startup-composing]').count(),0,'Early listeners are removed after startup');
  await page.locator('.global-search button[type=submit]').click();
  await page.waitForFunction(q=>location.pathname.endsWith('/search')&&new URLSearchParams(location.search).get('q')===q,expected);
  assert.equal(new URL(page.url()).pathname,prefix+'/search');assert(searches.includes(expected));
  assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>window.cspErrors),[]);
  Object.assign(row,{passed:true,expected,events:await page.evaluate(()=>window.imeEvents)});console.log('PASS IME',prefix||'mainnet',scenario.name);
 }catch(e){row.error=e.stack;row.events=await page.evaluate(()=>window.imeEvents).catch(()=>[]);row.errors=errors;await writeFile(out+'/failure.json',JSON.stringify(row,null,2));throw e;}
 finally{release();results.push(row);await writeFile(out+'/results.json',JSON.stringify({base,publicSite,engine:'Chromium CDP native composition',physicalKeyboardTest:false,apiMocked:true,results},null,2));await context.close();}
}}finally{await browser.close();}
console.log(`${results.length} native IME scenarios passed`);
