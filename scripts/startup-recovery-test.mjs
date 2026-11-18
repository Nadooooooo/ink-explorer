import assert from 'node:assert/strict';
import {chromium, firefox, webkit} from 'playwright';
import axe from 'axe-core';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {documentHeaders, renderPage} from '../server/page-document.mjs';
import {startupCopy} from '../server/startup-shell.mjs';
import {initialBuildAssets} from './initial-build-assets.mjs';

const base=process.env.BASE_URL||'http://127.0.0.1:4212';
const out=process.env.STARTUP_OUTPUT||'reports/startup-recovery/browser';
const publicSite=base.startsWith('https:')||process.env.STARTUP_NATIVE_DOCUMENTS==='1',template=await readFile('dist/index.html','utf8');
const entry=template.match(/<script type="module"[^>]+src="([^"]+)"/)?.[1];
assert(entry);await mkdir(out,{recursive:true});
const eagerEntryAssets=await initialBuildAssets('dist',[entry]);
const fatalDependency=eagerEntryAssets.some(asset=>asset!==entry&&asset.endsWith('.js'));
const results=[];
async function prepare(context){
 if(!publicSite)await context.route('**/*',route=>{
  if(route.request().resourceType()!=='document')return route.fallback();
  const url=new URL(route.request().url()),prefix=url.pathname.startsWith('/testnet')?'/testnet':'';
  url.pathname=url.pathname.slice(prefix.length)||'/';
  const response=renderPage(template,url,{origin:base,basePath:prefix});
  return route.fulfill({status:response.status,headers:{...documentHeaders,'content-type':'text/html; charset=utf-8'},body:response.body});
 });
 await context.routeWebSocket(/\/api\/live$/,socket=>socket.close());
 await context.route('**/api/**',route=>route.fulfill({status:503,json:{error:'Controlled API outage'}}));
}
async function layout(page){
 return page.evaluate(()=>{
  const shell=document.querySelector('#ink-startup'),link=document.querySelector('#ink-startup-reload'),r=link?.getBoundingClientRect();
  return {overflow:document.documentElement.scrollWidth>innerWidth+1,embedded:shell.classList.contains('startup-embedded'),snippetTags:[...shell.querySelectorAll('[data-nosnippet]')].map(node=>node.tagName),shellWidth:shell.getBoundingClientRect().width,viewport:innerWidth,background:getComputedStyle(shell).backgroundColor,link:r?{width:r.width,height:r.height,left:r.left,right:r.right}:null};
 });
}
for(const [engine,launcher]of Object.entries({chromium,firefox,webkit}).filter(([name])=>!process.env.STARTUP_ENGINES||process.env.STARTUP_ENGINES.split(',').includes(name))){
 const browser=await launcher.launch(engine==='chromium'?{args:['--no-sandbox']}:{});
 try{
  for(const [prefix,width,locale,theme,mode]of[
   ['',320,'fr','light','entry'],['/testnet',390,'ar','dark','dependency'],
   ['',1440,'en','dark','assets'],['/testnet',320,'fr','light','scripts-disabled'],
  ].filter(row=>!process.env.STARTUP_MODES||process.env.STARTUP_MODES.split(',').includes(row[4]))){
   const context=await browser.newContext({viewport:{width,height:900},colorScheme:theme,javaScriptEnabled:mode!=='scripts-disabled'}),page=await context.newPage();
   await prepare(context);let failed=true,documents=0,blockedDependencies=0;const diagnostic=[];
   page.on('pageerror',error=>diagnostic.push({type:'pageerror',message:error.message}));
   page.on('requestfailed',request=>diagnostic.push({type:'requestfailed',url:request.url(),error:request.failure()}));
   page.on('response',response=>{if(response.url().includes('/assets/')||response.request().resourceType()==='document')diagnostic.push({type:'response',url:response.url(),status:response.status()});});
   page.on('request',request=>{if(request.resourceType()==='document')documents++;});
   await context.addInitScript(()=>{window.__csp=[];document.addEventListener('securitypolicyviolation',event=>window.__csp.push(event.effectiveDirective));});
   await context.route('**/assets/**',route=>{
    const url=new URL(route.request().url()),js=url.pathname.endsWith('.js');
    const dependency=js&&(fatalDependency?eagerEntryAssets.includes(url.pathname)&&url.pathname!==entry:/\/module-ar-[^/]+\.js$/.test(url.pathname));
    const block=mode==='entry'?url.pathname===entry:mode==='dependency'?dependency:mode==='assets';
    if(failed&&block){
     // Reproduce the actual missing-chunk HTTP response. WebKit's inspector
     // abort can retain a blocked import across reloads without requesting it.
     if(mode==='dependency'){blockedDependencies++;return route.fulfill({status:404,headers:{'content-type':'text/plain','cache-control':'no-store'},body:'Asset not found'});}
     return route.abort();
    }
    return route.fallback();
   });
   const url=base+prefix+'/blocks?lang='+locale+'&type=reorg#selection';
   try{
    await page.goto(url,{waitUntil:'domcontentloaded'});
    if(mode==='dependency'&&!fatalDependency){
     // A self-contained entry has no fatal eager dependency. Its remaining
     // initial locale download is recoverable: test the visible fallback and
     // retry rather than requiring the already-replaced startup document.
     await page.locator('.ledger-filters').waitFor();
     await page.waitForFunction(()=>document.documentElement.dataset.localeFallback==='true');
     assert(blockedDependencies>0,'The locale dependency failure must actually occur');
     assert.equal(await page.locator('html').getAttribute('lang'),locale);
     assert.equal(await page.locator('html').getAttribute('dir'),'rtl');
     // The locale alert is adjacent to main in the current document layout.
     const alert=page.locator('header + .error-state[role="alert"]');
     await alert.waitFor({state:'visible'});
     const button=alert.locator('button');
     const measurement=await button.evaluate(element=>{const r=element.getBoundingClientRect();return {height:r.height,left:r.left,right:r.right,viewport:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1};});
     assert.equal(measurement.overflow,false);assert(measurement.height>=44);assert(measurement.left>=0&&measurement.right<=width);
     assert.equal(documents,1,'A failed locale must not trigger an automatic reload loop');
     assert.deepEqual(await page.evaluate(()=>window.__csp),[]);
     await page.evaluate(axe.source);
     const violations=await page.evaluate(async()=>(await axe.run(document)).violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})));
     assert.deepEqual(violations,[]);
     await page.screenshot({path:`${out}/${engine}-${mode}.png`});
     failed=false;await button.focus();await page.keyboard.press('Enter');
     await page.locator('.ledger-filters').waitFor();
     await page.waitForFunction(()=>!document.documentElement.dataset.localeFallback);
     assert.equal(page.url(),url,'Locale retry preserves network, language, filters and fragment');
     assert.equal(documents,2);assert.equal(await page.locator('#ink-startup').count(),0);
     results.push({engine,prefix,width,locale,theme,mode,passed:true,fatalDependency:false,blockedDependencies,localeFallbackRecovered:true,measurement});
     console.log('PASS',engine,'locale dependency recovery');
     continue;
    }
    await page.locator('#ink-startup').waitFor();
    if(mode==='scripts-disabled'){
     assert.equal(await page.locator('#ink-startup noscript p').innerText(),startupCopy[locale][3]);
     assert.equal(await page.locator('#ink-startup [role="status"]').isVisible(),false);
    }else{
     await page.locator('#ink-startup-reload').waitFor({state:'visible',timeout:12000});
     assert.equal(await page.locator('#ink-startup-reload').innerText(),startupCopy[locale][2]);
     assert.deepEqual(await page.evaluate(()=>window.__csp),[]);
     // Install the audit through the debugging channel, without weakening CSP.
     await page.evaluate(axe.source);
     const violations=await page.evaluate(async()=>(await axe.run(document)).violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})));
     assert.deepEqual(violations,[]);
    }
    const measurement=await layout(page);assert.equal(measurement.overflow,false);
    if(measurement.embedded)assert(measurement.shellWidth>=Math.min(256,width-32)&&measurement.shellWidth<=width-16);
    else assert.equal(measurement.shellWidth,measurement.viewport);
    assert(measurement.snippetTags.length>0&&measurement.snippetTags.every(tag=>['DIV','SPAN','SECTION'].includes(tag)));
    assert.equal(measurement.background,theme==='dark'?'rgb(15, 15, 15)':'rgb(250, 250, 250)');
    if(mode!=='scripts-disabled'){assert(measurement.link.height>=44);assert(measurement.link.left>=0&&measurement.link.right<=width);}
    assert.equal(documents,1,'No automatic reload loop');
    await page.screenshot({path:`${out}/${engine}-${mode}.png`});
    if(mode!=='scripts-disabled'){
     failed=false;
     await page.locator('#ink-startup-reload').focus();
     await page.keyboard.press('Enter');
     await page.locator('.ledger-filters').waitFor();
     assert.equal(page.url(),url,'Reload preserves network, language, filters and fragment');
     assert.equal(await page.locator('#ink-startup').count(),0,'React replaces the fallback');
     assert.equal(documents,2);
    }
    results.push({engine,prefix,width,locale,theme,mode,passed:true,measurement});
    console.log('PASS',engine,mode);
   }catch(error){await page.screenshot({path:`${out}/failure-${engine}-${mode}.png`}).catch(()=>{});await writeFile(`${out}/failure-${engine}-${mode}.json`,JSON.stringify({error:error.stack,diagnostic},null,2));throw error;}
   finally{await context.close();}
  }
  if(!process.env.STARTUP_MODES){
   const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
   await prepare(context);let first=true,release;const held=new Promise(resolve=>{release=resolve;});
   await context.addInitScript(()=>{window.__domLoaded=false;document.addEventListener('DOMContentLoaded',()=>window.__domLoaded=true);});
   await context.route('**'+entry,async route=>{
    if(first){first=false;await held;return route.abort().catch(()=>{});}
    return route.fallback();
   });
   try{
    const url=base+'/blocks?lang=fr&type=reorg#slow-connection';
    await page.goto(url,{waitUntil:'commit'});
    await page.locator('#ink-startup-reload').waitFor({state:'visible',timeout:12000});
    assert.equal(await page.evaluate(()=>window.__domLoaded),false,'The recovery action must work before DOMContentLoaded');
    await page.locator('#ink-startup-reload').click();
    await page.locator('.ledger-filters').waitFor();
    assert.equal(page.url(),url);
    results.push({engine,width:390,mode:'stalled-entry-before-domcontentloaded',passed:true});
    console.log('PASS',engine,'stalled entry');
   }finally{release();await context.close();}
  }
 }finally{await browser.close();}
}
// Ten translated documents remain readable with external assets disabled.
const browser=await firefox.launch({firefoxUserPrefs:{'font.minimum-size.x-western':24}});
try{for(const locale of process.env.STARTUP_MODES?[]:Object.keys(startupCopy)){
 const context=await browser.newContext({viewport:{width:320,height:900},reducedMotion:'reduce'}),page=await context.newPage();
 await prepare(context);await context.route('**/assets/**',r=>r.abort());
 try{
  await page.goto(base+'/tokens?lang='+locale,{waitUntil:'domcontentloaded'});
  await page.locator('#ink-startup-reload').waitFor({state:'visible'});
  assert.equal(await page.locator('#ink-startup h1').innerText(),startupCopy[locale][0]);
  assert.equal(await page.locator('html').getAttribute('dir'),locale==='ar'?'rtl':'ltr');
  const measurement=await layout(page);assert.equal(measurement.overflow,false);assert(measurement.link.height>=44);
  await page.screenshot({path:`${out}/locale-${locale}.png`});
  results.push({engine:'firefox',locale,width:320,minimumFont:24,mode:'localization',passed:true,measurement});
 }finally{await context.close();}
}}finally{await browser.close();}
const complete=!process.env.STARTUP_ENGINES&&!process.env.STARTUP_MODES;
if(complete)assert.equal(results.length,25,'All three engines, failure modes, stalled entries and ten locales must run');
await writeFile(out+'/results.json',JSON.stringify({base,publicSite,apiMocked:true,policyBypassed:false,physicalDeviceTest:false,complete,passed:complete&&results.every(row=>row.passed),results},null,2));
console.log(`${results.length} startup recovery scenarios passed`);
