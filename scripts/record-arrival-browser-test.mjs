import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {registerHooks} from 'node:module';
import {chromium,firefox,webkit} from 'playwright-core';
import axe from 'axe-core';
// Firefox keeps FontFaceSet.status="loading" until the held module finishes,
// even when every requested font has loaded. Observe the individual font faces.
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY='1';
registerHooks({resolve(s,c,n){try{return n(s,c)}catch(e){if(s.startsWith('./')&&c.parentURL?.includes('/src/')&&!/\.[a-z]+$/.test(s))return n(s+'.ts',c);throw e;}}});
const {handleRequest}=await import('../cloudflare/worker.mjs');
const base=process.env.BASE_URL||'http://127.0.0.1:4310',out=process.env.RECORD_BROWSER_OUTPUT||'reports/detail-arrival/browser';await mkdir(out,{recursive:true});
const entry=(await readFile('dist/index.html','utf8')).match(/<script type="module"[^>]+src="([^"]+)"/)[1],savedFetch=globalThis.fetch,results=[];
let sourceResponse;
globalThis.fetch=(url,options)=>String(url).startsWith('https://record-fixture.invalid/')?sourceResponse(url,options):savedFetch(url,options);
const env={PUBLIC_URL:base,API_ORIGIN:'https://record-fixture.invalid',ORIGIN_TOKEN:'fixture-only',ASSETS:{async fetch(r){try{return new Response(await readFile('dist'+new URL(r.url).pathname));}catch{return new Response('Missing',{status:404});}}}};
const h='0x'+'a'.repeat(64),other='0x'+'b'.repeat(64),wallet='0x'+'c'.repeat(40);
try{for(const[engine,launcher]of Object.entries({chromium,firefox,webkit}).filter(([n])=>!process.env.RECORD_ENGINES||process.env.RECORD_ENGINES.split(',').includes(n))){
 const browser=await launcher.launch(engine==='chromium'?{args:['--no-sandbox']}:{});
 try{for(const[prefix,chainId,width,language]of[['',57073,320,'fr'],['/testnet',763373,1440,'ar']])for(const kind of ['block','transaction'])for(const scenario of ['ready','indexing','unavailable','recover','expired']){
  const c=await browser.newContext({viewport:{width,height:1000},...(process.env.INK_RELEASE_VERSION?{extraHTTPHeaders:{'Cloudflare-Workers-Version-Overrides':`inkexplorer="${process.env.INK_RELEASE_VERSION}"`}}:{})}),p=await c.newPage(),errors=[],row={engine,chainId,width,language,kind,scenario};p.setDefaultTimeout(12000);p.on('pageerror',e=>errors.push(e.message));
  let release,releaseNext,mode=scenario==='expired'?'ready':scenario==='recover'?'unavailable':scenario,apiReads=0,documents=0,nextReads=0;const held=new Promise(r=>release=r),nextHeld=new Promise(r=>releaseNext=r),path=prefix+(kind==='block'?'/block/100':'/tx/'+h)+'?lang='+language;
  const record=(next=false)=>kind==='block'?{height:next?99:100,hash:next?other:h,parent_hash:other,timestamp:new Date().toISOString(),gas_used:'21000',gas_limit:'30000000',base_fee_per_gas:'1',transactions_count:1,size:1000,transaction_fees:'900719925474099312345',miner:{hash:wallet}}:{hash:next?other:h,block_number:100,timestamp:new Date().toISOString(),from:{hash:wallet},to:{hash:wallet},value:'1234567891234567891',fee:{value:'0'},gas_price:'1',gas_used:'21000',gas_limit:'21000',nonce:1,status:'ok',method:'transfer'};
  const proof=kind==='block'?{code:'BLOCK_INDEXING',chainId,block:{number:'100',hash:h},retryAfterMs:3000}:{code:'TRANSACTION_INDEXING',chainId,transaction:{hash:h,blockNumber:'100',blockHash:other},retryAfterMs:1000};
  const response=(initial=false)=>Response.json(mode==='ready'?record():mode==='indexing'?proof:{error:'Controlled source outage'},{status:mode==='ready'?200:mode==='indexing'?202:503,headers:{'x-ink-data-status':'fresh','x-ink-data-fetched-at':new Date().toISOString(),'retry-after':'1'}});
  sourceResponse=async()=>response(true);
  p.on('request',r=>{if(r.isNavigationRequest()&&r.frame()===p.mainFrame())documents++;});
  await c.route('**/*',async r=>{
   if(r.request().resourceType()!=='document')return r.fallback();
   const response=await handleRequest(new Request(r.request().url()),env);return r.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});
  });
  await c.route('**/api/**',async r=>{
   const u=new URL(r.request().url()),name=u.pathname.replace(/^\/testnet/,'');
   if(name==='/api/live/config')return r.fulfill({json:{url:base.replace(/^http/,'ws')+prefix+'/api/live'}});
   if(name==='/api/live/snapshot')return r.fulfill({json:{protocol:'ink-observer.live.v1',type:'snapshot',sequence:1,network:{chainId,expectedChainId:chainId,online:true,synced:true,stale:false,head:100},blocks:[]}});
   if(name==='/api/explorer/'+(kind==='block'?'blocks/100':'transactions/'+h)){apiReads++;const res=response();return r.fulfill({status:res.status,headers:Object.fromEntries(res.headers),body:await res.text()});}
   if(name==='/api/explorer/'+(kind==='block'?'blocks/99':'transactions/'+other)){nextReads++;await nextHeld;return r.fulfill({json:record(true)}).catch(()=>{});}
   return r.fulfill({json:{items:[]}});
  });
  await c.routeWebSocket(/\/api\/live$/,s=>s.close());
  await c.route('**'+entry,async r=>{await held;await r.fallback().catch(()=>{});});
  try{
   await p.clock.install();const response=await p.goto(base+path,{waitUntil:'commit'});assert.equal(response.status(),mode==='unavailable'?503:200);
   await p.locator('[data-initial-record]').waitFor();await p.waitForFunction(()=>[...document.querySelectorAll('link[rel="stylesheet"]')].every(l=>l.sheet)&&[...document.fonts].some(f=>f.status==='loaded')&&[...document.fonts].every(f=>f.status!=='loading'));
   assert.equal(await p.locator('[data-record-phase]').getAttribute('data-record-phase'),mode);
   assert.equal(apiReads,0);assert.equal(await p.locator('#ink-startup-reload').isVisible(),false);
   if(mode==='ready')assert((await p.locator('#main-content').innerText()).includes(h));else assert.equal(await p.locator('#main-content dl').count(),0);
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   await p.screenshot({path:`${out}/${engine}-${chainId}-${kind}-${scenario}-initial.png`});
   if(scenario==='expired')await p.clock.fastForward(16000);
   if(scenario==='recover')mode='ready';
   release();await p.locator('#ink-startup').waitFor({state:'detached'});
   const ready=kind==='block'?'.block-definitions':'.transaction-definitions';
   if(mode==='indexing'){
    await p.locator(kind==='block'?'.block-indexing':'.transaction-indexing-notice').waitFor();mode='ready';await p.clock.fastForward(3100);
   }else if(mode==='unavailable'){
    await p.locator('.error-state button').waitFor();mode='ready';await p.clock.fastForward(1500);await p.locator('.error-state button').click();
   }
   await p.locator(ready).waitFor();assert((await p.locator('#main-content').innerText()).includes(h));
   if(scenario==='ready')assert.equal(apiReads,0,'Fresh initial data must survive startup without a duplicate fetch');else assert(apiReads>=1,'Expired or pending data must be fetched again');
   if(scenario==='ready'){
    await p.evaluate(axe.source);assert.deepEqual(await p.evaluate(async()=>(await axe.run(document)).violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}))),[]);
    const next=prefix+(kind==='block'?'/block/99':'/tx/'+other)+'?lang='+language;
    await p.evaluate(path=>{history.pushState(null,'',path);dispatchEvent(new PopStateEvent('popstate'));},next);
    await p.locator('.record-arrival-loading').waitFor();assert(!(await p.locator('#main-content').innerText()).includes(h),'Previous record must disappear immediately after navigation');
    releaseNext();await p.locator(ready).waitFor();assert((await p.locator('#main-content').innerText()).includes(other));assert(nextReads>=1);
   }
   assert.deepEqual(errors,[]);assert.equal(documents,1);Object.assign(row,{passed:true,apiReads,documents,nextReads});
  }catch(e){Object.assign(row,{passed:false,error:e.stack,errors,apiReads,nextReads});await p.screenshot({path:`${out}/${engine}-${chainId}-${kind}-${scenario}-failure.png`}).catch(()=>{});}
  finally{release();releaseNext();await c.close();}
  results.push(row);console.log(JSON.stringify(row));await writeFile(out+'/results.json',JSON.stringify({base,documentMocked:true,apiMocked:true,physicalDevices:false,complete:false,results},null,2));
 }}finally{await browser.close();}
}}finally{globalThis.fetch=savedFetch;}
await writeFile(out+'/results.json',JSON.stringify({base,documentMocked:true,apiMocked:true,physicalDevices:false,complete:true,passed:results.every(r=>r.passed),results},null,2));if(results.some(r=>!r.passed))process.exitCode=1;
