import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {registerHooks} from 'node:module';
import {chromium,firefox,webkit} from 'playwright-core';
import axe from 'axe-core';
import {initialPageRoutes} from '../server/page-snapshots.mjs';
registerHooks({resolve(s,c,n){try{return n(s,c)}catch(e){if(s.startsWith('./')&&c.parentURL?.includes('/src/')&&!/\.[a-z]+$/.test(s))return n(s+'.ts',c);throw e;}}});
const {handleRequest}=await import('../cloudflare/worker.mjs');
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY='1';
const base=process.env.BASE_URL||'http://127.0.0.1:4214',publicSite=base.startsWith('https:'),out=process.env.PAGE_ARRIVAL_OUTPUT||'reports/page-arrival/browser';
const template=await readFile('dist/index.html','utf8'),entry=template.match(/<script type="module"[^>]+src="([^"]+)"/)[1],results=[];
const env={PUBLIC_URL:base,ASSETS:{async fetch(r){try{return new Response(await readFile('dist'+new URL(r.url).pathname));}catch{return new Response('Missing',{status:404});}}}};
await mkdir(out,{recursive:true});
async function setup(c){
 if(publicSite&&process.env.INK_RELEASE_VERSION)await c.setExtraHTTPHeaders({'Cloudflare-Workers-Version-Overrides':`inkexplorer="${process.env.INK_RELEASE_VERSION}"`});
 if(!publicSite)await c.route('**/*',async r=>{if(r.request().resourceType()!=='document')return r.fallback();const response=await handleRequest(new Request(r.request().url()),env);await r.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});});
 await c.route('**/api/**',r=>r.fulfill({status:503,json:{error:'Controlled API outage'}}));await c.routeWebSocket(/\/api\/live$/,s=>s.close());
 await c.addInitScript(()=>{window.cspErrors=[];document.addEventListener('securitypolicyviolation',e=>window.cspErrors.push(e.effectiveDirective));});
}
for(const [engine,launcher] of Object.entries({chromium,firefox,webkit}).filter(([name])=>!process.env.PAGE_ARRIVAL_ENGINES||process.env.PAGE_ARRIVAL_ENGINES.split(',').includes(name))){
 const browser=await launcher.launch(engine==='chromium'?{args:['--no-sandbox']}:{});
 const width={chromium:320,firefox:768,webkit:1440}[engine],lang={chromium:'fr',firefox:'ar',webkit:'ja'}[engine];
 try{for(const [index,path] of initialPageRoutes.entries()){
  const prefix=index%2?'/testnet':'',c=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce',colorScheme:index%2?'dark':'light'}),p=await c.newPage(),errors=[];
  p.on('pageerror',e=>errors.push(e.message));await setup(c);let release;const held=new Promise(r=>release=r);await c.route('**'+entry,async r=>{await held;await r.fallback().catch(()=>{});});
  const row={engine,width,lang,prefix,path};
  try{
   await p.goto(base+prefix+path+'?lang='+lang,{waitUntil:'commit'});
   await p.locator('[data-initial-page]').waitFor();await p.waitForFunction(()=>getComputedStyle(document.querySelector('.app-header')).display==='flex');
   const title=await p.locator('#main-content h1').innerText();assert(title.length>0);
   row.initialStartup=await p.evaluate(()=>{const node=document.querySelector('#ink-startup');return {time:performance.now(),failed:document.documentElement.dataset.startupFailed,visibility:node?getComputedStyle(node).visibility:null,animation:node?getComputedStyle(node).animation:null}});
   assert.equal(await p.locator('#ink-startup-reload').isVisible(),false);
   assert.equal(await p.locator('.network-picker select').inputValue(),prefix?'sepolia':'mainnet');
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'Initial document overflow');
   assert.equal(await p.locator('.mobile-search-trigger').isVisible(),width<=760);
   const search=p.locator('.global-search input:not([type=hidden])');assert.equal(await search.isVisible(),width>760);
   if(width<=760)await p.locator('.mobile-search-trigger').click();
   await search.fill('ink before startup');await search.evaluate(e=>e.setSelectionRange(4,10,'backward'));
   const before=await p.locator('.app-header').boundingBox();
   if(['blocks','developers','tokens'].includes(path.slice(1)))await p.screenshot({path:`${out}/${engine}-${path.slice(1)}-initial.png`});
   release();await p.locator('#ink-startup').waitFor({state:'detached'});
   await p.waitForTimeout(60);
   assert.equal(await search.inputValue(),'ink before startup');assert.equal(await search.evaluate(e=>document.activeElement===e),true);
   assert.deepEqual(await search.evaluate(e=>[e.selectionStart,e.selectionEnd,e.selectionDirection]),[4,10,'backward']);
   const after=await p.locator('.app-header').boundingBox();assert(Math.abs(before.height-after.height)<2,'Header height must not jump during startup');
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'Interactive page overflow');
   if(width<=760){await p.locator('.mobile-search-trigger').click();assert.equal(await search.isVisible(),false);await p.locator('.mobile-search-trigger').click();assert.equal(await search.isVisible(),true);await p.keyboard.press('Escape');assert.equal(await search.isVisible(),false);}
   if(path==='/developers'){await p.evaluate(axe.source);const violations=await p.evaluate(async()=>(await axe.run(document)).violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})));assert.deepEqual(violations,[]);}
   assert.deepEqual(errors,[]);assert.deepEqual(await p.evaluate(()=>window.cspErrors),[]);
   Object.assign(row,{title,headerBefore:before,headerAfter:after,passed:true});console.log('PASS page',engine,path);
  }catch(e){row.passed=false;row.error=e.stack;row.errors=errors;row.startupState=await p.evaluate(()=>{const node=document.querySelector('#ink-startup');return {time:performance.now(),failed:document.documentElement.dataset.startupFailed,rootReady:document.querySelector('#root')?.dataset.startupReady,style:node?{visibility:getComputedStyle(node).visibility,position:getComputedStyle(node).position,animation:getComputedStyle(node).animation}:null}}); await p.screenshot({path:out+'/failure.png'}).catch(()=>{});throw e;}
  finally{release();results.push(row);await writeFile(out+'/results.json',JSON.stringify({base,publicSite,mockedData:true,physicalDevices:false,complete:false,results},null,2));await c.close();}
 }}finally{await browser.close();}
}
const browser=await chromium.launch({args:['--no-sandbox']});
try{
for(const [prefix,path,key,value,apiPath] of [['','/blocks','type','reorg','/explorer/blocks'],['','/txs','status','failed','/v1/transactions'],['/testnet','/tokens','type','ERC-721','/explorer/tokens'],['/testnet','/tokens','q','Ink token','/explorer/tokens']]){
 const c=await browser.newContext({viewport:{width:390,height:844}}),p=await c.newPage(),requests=[];await setup(c);let release;const held=new Promise(r=>release=r);
 await c.route('**'+entry,async r=>{await held;await r.fallback().catch(()=>{});});p.on('request',r=>{if(new URL(r.url()).pathname.endsWith(apiPath))requests.push(r.url());});
 try{
  await p.goto(base+prefix+path+'?lang=fr&'+new URLSearchParams({[key]:value}),{waitUntil:'commit'});await p.locator('[data-initial-page]').waitFor();
  assert.equal(await p.locator('#main-content form,#main-content select').count(),0,'Filtered initial document has no incorrect default controls');
  release();await p.locator('#ink-startup').waitFor({state:'detached'});
  await p.waitForFunction(({key,value})=>new URLSearchParams(location.search).get(key)===value,{key,value});
  for(let i=0;i<100&&!requests.some(url=>new URL(url).searchParams.get(key)===value);i++)await p.waitForTimeout(50);
  assert(requests.some(url=>new URL(url).searchParams.get(key)===value),'The actual request uses the URL filter: '+JSON.stringify(requests));
  results.push({mode:'filtered-arrival',prefix,path,key,value,passed:true});console.log('PASS filtered',prefix,path,key);
 }finally{release();await c.close();}
}
for(const [prefix,language]of[['','fr'],['/testnet','ar']]){
 const c=await browser.newContext({viewport:{width:320,height:900},javaScriptEnabled:false}),p=await c.newPage();await setup(c);
 try{
  await p.goto(base+prefix+'/developers?lang='+language);const input=p.locator('.global-search input:not([type=hidden])');assert.equal(await input.isVisible(),true);
  assert.equal(await p.locator('#quickstart').count(),1);const details=p.locator('#endpoints details').first();await details.locator('summary').click();assert.equal(await details.getAttribute('open'),'');
  await input.fill('native page search');await p.locator('.global-search button[type=submit]').click();await p.waitForURL(u=>u.pathname===prefix+'/search'&&u.searchParams.get('q')==='native page search'&&u.searchParams.get('lang')===language);
  results.push({mode:'no-javascript',prefix,language,passed:true});
 }finally{await c.close();}
}}finally{await browser.close();}
await writeFile(out+'/results.json',JSON.stringify({base,publicSite,mockedData:true,physicalDevices:false,complete:true,passed:true,results},null,2));
console.log(`${results.length} page arrival scenarios passed`);
