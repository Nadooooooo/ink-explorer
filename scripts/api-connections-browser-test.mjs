import assert from 'node:assert/strict';
import {chromium,firefox,webkit,devices} from 'playwright-core';
import axe from 'axe-core';
import {mkdir,writeFile} from 'node:fs/promises';
import vm from 'node:vm';
const base=process.env.BASE_URL||'http://127.0.0.1:4470',out=process.env.API_CONNECTIONS_OUTPUT||'reports/api-connections';await mkdir(out,{recursive:true});
const rows=[],failures=[];
const profiles=[{name:'desktop',viewport:{width:1440,height:1000},lang:'en'},{name:'iPhone-17-viewport',viewport:devices['iPhone 17'].viewport,lang:'fr',touch:true},{name:'Pixel-10-Pro-viewport',viewport:devices['Pixel 10 Pro'].viewport,lang:'ar',touch:true},{name:'compact-320',viewport:{width:320,height:900},lang:'fr',touch:true}];
try{for(const [engine,launcher]of Object.entries({chromium,firefox,webkit})){
 const browser=await launcher.launch(engine==='chromium'?{executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']}:{});
 try{for(const prefix of ['','/testnet'])for(const profile of profiles){
  const context=await browser.newContext({viewport:profile.viewport,hasTouch:!!profile.touch,isMobile:engine==='firefox'?false:!!profile.touch}),page=await context.newPage(),runtime=[],mapped=[];
  page.on('pageerror',e=>runtime.push(e.message));
  await context.addInitScript(()=>{window.__copied=null;window.__copyFail=false;Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{if(window.__copyFail)throw Error('Controlled denial');window.__copied=value;}}});const original=document.execCommand.bind(document);document.execCommand=(...args)=>window.__copyFail?false:original(...args);});
  // Canonical links are mapped only to the unpublished local review service.
  // No request is sent to the public site for these new endpoints.
  await context.route('https://inkexplorer.xyz/**',async route=>{
   const u=new URL(route.request().url());assert(/^\/(testnet\/)?api(?:\/rpc)?$/.test(u.pathname),'Unexpected public request '+u.href);
   const response=await route.fetch({url:base+u.pathname,maxRedirects:0,headers:{...route.request().headers(),host:'inkexplorer.xyz','x-forwarded-proto':'https','accept-encoding':'identity'}});assert.match(response.headers()['content-type']||'',/application\/json/);mapped.push({url:u.href,status:response.status(),body:await response.json()});await route.fulfill({response});
  });
  try{
   const response=await page.goto(base+prefix+'/developers?lang='+profile.lang,{waitUntil:'domcontentloaded'});assert.equal(response.status(),200);await page.locator('#ink-startup').waitFor({state:'detached'});await page.locator('.api-connections').waitFor();assert.equal(await page.locator('html').getAttribute('lang'),profile.lang);
   const expected=['https://inkexplorer.xyz'+prefix+'/api','https://inkexplorer.xyz'+prefix+'/api/rpc'];
   assert.equal(await page.locator('.api-connection').count(),2);
   for(let i=0;i<2;i++){
    const card=page.locator('.api-connection').nth(i),link=card.locator('a[href]');assert.equal(await link.getAttribute('href'),expected[i]);assert.equal((await link.innerText()).trim(),expected[i]);
    await card.locator('button.copy-button').click();await page.waitForFunction(value=>window.__copied===value,expected[i]);
    const popupPromise=context.waitForEvent('page');await link.click();const popup=await popupPromise;await popup.waitForLoadState('domcontentloaded');assert.equal(popup.url(),expected[i]);assert.equal(mapped.at(-1).status,200);assert.equal(mapped.at(-1).body.chainId,prefix?763373:57073);await popup.close();
   }
   const card=page.locator('.api-connection').first();await page.evaluate(()=>{window.__copyFail=true;});await card.locator('button.copy-button').click();const fallback=card.locator('.copy-fallback input');await fallback.waitFor();assert.equal(await fallback.inputValue(),expected[0]);assert(await fallback.evaluate(el=>document.activeElement===el&&el.selectionStart===0&&el.selectionEnd===el.value.length));await page.evaluate(()=>{window.__copyFail=false;});await card.locator('button.copy-button').click();await fallback.waitFor({state:'detached'});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   const touch=await page.locator('.api-connection .copy-button').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {width:r.width,height:r.height};}));assert(touch.every(x=>x.width>=44&&x.height>=44));
   const curl=await page.locator('#rpc .api-code code').first().innerText(),js=await page.locator('#rpc .api-code code').nth(1).innerText();assert(curl.includes(expected[1]));assert(curl.includes('\\\n'));assert(!curl.includes('\\n  -H'));
   const logs=[];await vm.runInNewContext(`(async()=>{${js}})()`,{fetch:async(url,init)=>{assert.equal(url,expected[1]);return fetch(base+prefix+'/api/rpc',init);},console:{log:v=>logs.push(v)},BigInt});assert.equal(typeof logs[0],'bigint');assert(logs[0]>0n);
   if(engine==='chromium'&&profile.name==='desktop'){
    const rest=await page.locator('#quickstart .api-code code').nth(1).innerText(),restLogs=[];await vm.runInNewContext(`(async()=>{${rest}})()`,{fetch:async(url,init)=>{assert(String(url).startsWith(expected[0]+'/'));return fetch(base+new URL(url).pathname+new URL(url).search,init);},URLSearchParams,console:{log:v=>restLogs.push(v)}});assert(restLogs.length>=1);assert(Array.isArray(restLogs[0]));
   }
   await page.evaluate(axe.source);const violations=await page.evaluate(async()=>(await axe.run(document,{resultTypes:['violations']})).violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})));assert.deepEqual(violations,[]);assert.deepEqual(runtime,[]);
   await page.screenshot({path:out+`/${engine}-${prefix?'sepolia':'mainnet'}-${profile.name}.png`,fullPage:false});rows.push({engine,prefix,profile:profile.name,lang:profile.lang,emulationOnly:true,urls:expected,clipboard:'injected writer plus denied-write manual selection',preparedLinks:mapped.map(x=>({url:x.url,status:x.status})),rpcExample:true,passed:true});console.log(JSON.stringify({engine,prefix,profile:profile.name,passed:true}));
  }catch(e){failures.push({engine,prefix,profile:profile.name,error:e.stack});}
  finally{await context.close();}
 }}finally{await browser.close();}
}}finally{await writeFile(out+'/results.json',JSON.stringify({at:new Date().toISOString(),base,passed:rows.length===24&&!failures.length,scope:'Unpublished local review. Canonical service links mapped to the review transport; no public availability claim.',rows,failures},null,2));console.log(JSON.stringify({states:rows.length,failures}));if(rows.length!==24||failures.length)process.exitCode=1;}
