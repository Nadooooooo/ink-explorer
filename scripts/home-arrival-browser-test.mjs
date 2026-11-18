import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {registerHooks} from 'node:module';
import {chromium,firefox,webkit} from 'playwright';
import axe from 'axe-core';
registerHooks({resolve(specifier,context,next){try{return next(specifier,context)}catch(error){if(specifier.startsWith('./')&&context.parentURL?.includes('/src/')&&!/\.[a-z]+$/.test(specifier))return next(specifier+'.ts',context);throw error;}}});
const {handleRequest}=await import('../cloudflare/worker.mjs');
// Firefox's document.fonts.ready waits for the intentionally held module.
// Capture that real intermediate paint without waiting for DOMContentLoaded.
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY='1';
const base=process.env.BASE_URL||'http://127.0.0.1:4214',publicSite=base.startsWith('https:'),out=process.env.ARRIVAL_OUTPUT||'reports/arrival-seo/home-browser';
await mkdir(out,{recursive:true});
const template=await readFile('dist/index.html','utf8'),entry=template.match(/<script type="module"[^>]+src="([^"]+)"/)[1],results=[];
const env={PUBLIC_URL:base,ASSETS:{async fetch(request){try{return new Response(await readFile('dist'+new URL(request.url).pathname));}catch{return new Response('Missing',{status:404});}}}};
async function setup(context){
 if(publicSite&&process.env.INK_RELEASE_VERSION)await context.setExtraHTTPHeaders({'Cloudflare-Workers-Version-Overrides':`inkexplorer="${process.env.INK_RELEASE_VERSION}"`});
 if(!publicSite)await context.route('**/*',async route=>{
  if(route.request().resourceType()!=='document')return route.fallback();
  const response=await handleRequest(new Request(route.request().url()),env);
  await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});
 });
 await context.route('**/api/**',route=>route.fulfill({status:503,json:{error:'Controlled API outage'}}));
 await context.routeWebSocket(/\/api\/live$/,socket=>socket.close());
}
async function bounds(page){return page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,guide:document.querySelector('.home-guide')?.getBoundingClientRect().toJSON(),overflow:document.documentElement.scrollWidth>innerWidth+1}));}
for(const[engine,launcher]of Object.entries({chromium,firefox,webkit})){
 const browser=await launcher.launch(engine==='chromium'?{args:['--no-sandbox']}:{});
 try{for(const[width,language,theme,prefix]of[[320,'fr','light',''],[768,'ar','dark','/testnet'],[1440,'en','dark','']]){
  const context=await browser.newContext({viewport:{width,height:900},colorScheme:theme,reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await setup(context);
  await context.addInitScript(()=>{window.__shifts=[];window.__csp=[];document.addEventListener('securitypolicyviolation',e=>window.__csp.push(e.effectiveDirective));if(PerformanceObserver.supportedEntryTypes.includes('layout-shift'))new PerformanceObserver(list=>{for(const e of list.getEntries())if(!e.hadRecentInput)window.__shifts.push({value:e.value,sources:e.sources.map(s=>s.node?.className)});}).observe({type:'layout-shift',buffered:true});});
  let release;const held=new Promise(resolve=>release=resolve);await context.route('**'+entry,async route=>{await held;await route.fallback().catch(()=>{});});
  try{
   await page.goto(base+prefix+'/?lang='+language,{waitUntil:'commit'});
   await page.locator('.home-guide').waitFor();await page.waitForFunction(()=>getComputedStyle(document.querySelector('.home-guide-grid')).display==='grid');await page.evaluate(()=>Promise.race([document.fonts.ready,new Promise(resolve=>setTimeout(resolve,1200))]));
   assert.equal(await page.locator('#ink-startup-reload').isVisible(),false,'No reload screen during normal arrival');
   const before=await bounds(page);assert.equal(before.overflow,false);
   assert.equal(await page.locator('.home-guide a').count(),3);
   assert.equal(await page.locator('.network-picker select').inputValue(),prefix?'sepolia':'mainnet');
   assert.equal(await page.locator('.chart-heading-actions select').inputValue(),'30');
   assert.equal(await page.locator('select').nth(1).inputValue(),language);
   assert.equal(await page.locator('.home-feed-tabs').isVisible(),width<900);
   assert.equal(await page.locator('#home-feed-blocks').isVisible(),width>=900);
   await page.screenshot({path:`${out}/${engine}-${width}-initial.png`});
   release();await page.locator('#ink-startup').waitFor({state:'detached'});
   await page.waitForTimeout(300);
   const after=await bounds(page);assert.equal(after.overflow,false);
   assert.equal(await page.locator('.network-picker select').inputValue(),prefix?'sepolia':'mainnet');
   assert.equal(await page.locator('.chart-heading-actions select').inputValue(),'30');
   assert.equal(await page.locator('select').nth(1).inputValue(),language);
   assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>window.__csp),[]);
   if(width===320){await page.evaluate(axe.source);const violations=await page.evaluate(async()=>(await axe.run(document)).violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})));assert.deepEqual(violations,[]);}
   const shifts=await page.evaluate(()=>window.__shifts);
   if(width<900){await page.locator('#home-tab-blocks').click();assert.equal(await page.locator('#home-feed-blocks').isVisible(),true);assert.equal(await page.locator('#home-feed-transactions').isVisible(),false);await page.keyboard.press('Home');assert.equal(await page.locator('#home-feed-transactions').isVisible(),true);await page.setViewportSize({width:1024,height:900});assert.equal(await page.locator('.home-feed-tabs').isVisible(),false);assert.equal(await page.locator('#home-feed-blocks').isVisible(),true);await page.setViewportSize({width,height:900});}
   await page.screenshot({path:`${out}/${engine}-${width}-ready.png`});
   results.push({engine,width,language,theme,prefix,before,after,shifts,passed:true});console.log('PASS arrival',engine,width,language);
  }finally{release();await context.close();}
 }
 const context=await browser.newContext({viewport:{width:320,height:900},javaScriptEnabled:false}),page=await context.newPage();await setup(context);
 try{
  await page.goto(base+'/testnet/?lang=fr');await page.locator('.home-guide').waitFor();assert.equal((await bounds(page)).overflow,false);
  assert.equal(await page.locator('.startup-embedded').count(),1);
  await page.locator('.global-search input[name=q]').fill('12345');await page.locator('.global-search input[name=q]').press('Enter');await page.waitForURL('**/testnet/search?q=12345&lang=fr');
  results.push({engine,mode:'no-javascript-native-search',passed:true});console.log('PASS native search',engine);
 }finally{await context.close();}
 }finally{await browser.close();}
}
const browser=await firefox.launch({firefoxUserPrefs:{'font.minimum-size.x-western':24}});
try{for(const language of ['en','fr','es','pt','ar','ru','hi','bn','zh','ja']){
 const context=await browser.newContext({viewport:{width:320,height:900},javaScriptEnabled:false}),page=await context.newPage();await setup(context);
 try{await page.goto(base+'/?lang='+language);await page.locator('.home-guide').waitFor();const layout=await bounds(page);assert.equal(layout.overflow,false,language+' overflow');results.push({engine:'firefox',mode:'no-javascript-large-font',width:320,minimumFont:24,language,passed:true});console.log('PASS large font',language);}finally{await context.close();}
}}finally{await browser.close();}
await writeFile(out+'/results.json',JSON.stringify({base,publicSite,apiMocked:true,physicalDeviceTest:false,results},null,2));console.log(`${results.length} home arrival checks passed`);
