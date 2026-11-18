import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {registerHooks} from 'node:module';
import {chromium,firefox,webkit} from 'playwright-core';
import axe from 'axe-core';
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY='1';
registerHooks({resolve(s,c,n){try{return n(s,c)}catch(e){if(s.startsWith('./')&&c.parentURL?.includes('/src/')&&!/\.[a-z]+$/.test(s))return n(s+'.ts',c);throw e;}}});
const {handleRequest}=await import('../cloudflare/worker.mjs');
const base=process.env.BASE_URL||'http://127.0.0.1:4312',out=process.env.PROFILE_BROWSER_OUTPUT||'reports/profile-arrival/browser';await mkdir(out,{recursive:true});
const entry=(await readFile('dist/index.html','utf8')).match(/<script type="module"[^>]+src="([^"]+)"/)[1],savedFetch=globalThis.fetch,results=[];
let sourceResponse;globalThis.fetch=(u,o)=>String(u).startsWith('https://profiles-fixture.invalid/')?sourceResponse(u,o):savedFetch(u,o);
const env={PUBLIC_URL:base,API_ORIGIN:'https://profiles-fixture.invalid',ORIGIN_TOKEN:'fixture-only',ASSETS:{async fetch(r){try{return new Response(await readFile('dist'+new URL(r.url).pathname));}catch{return new Response('Missing',{status:404});}}}};
const id='0x'+'a'.repeat(40),nextId='0x'+'b'.repeat(40);
try{for(const[engine,launcher]of Object.entries({chromium,firefox,webkit}).filter(([n])=>!process.env.PROFILE_ENGINES||process.env.PROFILE_ENGINES.split(',').includes(n))){
 const browser=await launcher.launch(engine==='chromium'?{args:['--no-sandbox']}:{});
 try{for(const[prefix,chainId,width,language]of[['',57073,320,'fr'],['/testnet',763373,1440,'ar']])for(const kind of ['address','token'])for(const scenario of ['ready','aged','expired','recover']){
  const context=await browser.newContext({viewport:{width,height:1000},...(process.env.INK_RELEASE_VERSION?{extraHTTPHeaders:{'Cloudflare-Workers-Version-Overrides':`inkexplorer="${process.env.INK_RELEASE_VERSION}"`}}:{})}),page=await context.newPage(),errors=[],row={engine,chainId,width,language,kind,scenario};page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  let release,releaseNext,reads=0,nextReads=0,documents=0,mode=scenario==='recover'?'unavailable':'ready',revision=0;
  const held=new Promise(r=>release=r),nextHeld=new Promise(r=>releaseNext=r),path=prefix+'/'+kind+'/'+id+'?lang='+language,endpoint='/api/explorer/'+(kind==='address'?'addresses':'tokens')+'/';
  const data=(next=false)=>kind==='address'?{hash:next?nextId:id,chain_id:chainId,name:next?'Next profile':'Example profile',coin_balance:revision?'2000000000000000000':'1000000000000000000',block_number_balance_updated_at:revision?101:100,balance_check:{scope:"head",status:"matched",block_number:revision?101:100,block_hash:"0x"+(revision?"b":"a").repeat(64),block_timestamp:Math.floor(Date.now()/1000),checked_at:new Date().toISOString(),source:"local"},is_contract:false,is_verified:false}:{address_hash:next?nextId:id,chain_id:chainId,name:next?'Next profile':'Example profile',symbol:'EX',decimals:18,type:'ERC-20',total_supply:'1000000000000000000000',holders_count:'7',exchange_rate:revision?'2':'1'};
  const respond=()=>Response.json(mode==='ready'?data():{error:'Controlled outage'},{status:mode==='ready'?200:503,headers:{'x-ink-data-status':'fresh','x-ink-data-fetched-at':new Date(Date.now()-(scenario==='aged'?20000:0)).toISOString(),'date':new Date().toUTCString(),'retry-after':'1'}});
  sourceResponse=async()=>respond();
  page.on('request',r=>{if(r.isNavigationRequest()&&r.frame()===page.mainFrame())documents++;});
  await context.route('**/*',async r=>{if(r.request().resourceType()!=='document')return r.fallback();const res=await handleRequest(new Request(r.request().url()),env);return r.fulfill({status:res.status,headers:Object.fromEntries(res.headers),body:Buffer.from(await res.arrayBuffer())});});
  await context.route('**/api/**',async r=>{
   const path=new URL(r.request().url()).pathname.replace(/^\/testnet/,'');
   if(path===endpoint+id){reads++;const res=respond();return r.fulfill({status:res.status,headers:Object.fromEntries(res.headers),body:await res.text()});}
   if(path===endpoint+nextId){nextReads++;await nextHeld;return r.fulfill({json:data(true),headers:{'x-ink-data-status':'fresh','x-ink-data-fetched-at':new Date().toISOString(),'date':new Date().toUTCString()}}).catch(()=>{});}
   if(path.startsWith('/api/address-balance/')){const at=await page.evaluate(()=>Date.now());return r.fulfill({json:{schema:1,chainId,address:path.split('/').at(-1),balance:revision?'2000000000000000000':'1000000000000000000',block:{number:revision?101:100,hash:'0x'+(revision?'b':'a').repeat(64),timestamp:Math.floor(at/1000)},observedAt:new Date(at).toISOString(),source:'local'}});}
   if(path==='/api/live/config')return r.fulfill({json:{url:base.replace(/^http/,'ws')+prefix+'/api/live'}});
   if(path==='/api/live/snapshot'){const at=await page.evaluate(()=>Date.now()),block={height:revision?101:100,hash:'0x'+(revision?'b':'a').repeat(64),timestamp:new Date(at).toISOString()};return r.fulfill({json:{protocol:'ink-observer.live.v1',type:'snapshot',sequence:1,network:{chainId,expectedChainId:chainId,online:true,synced:true,stale:false,head:block.height,sampledAt:new Date(at).toISOString()},block,blocks:[block]}}); }
   return r.fulfill({json:{items:[]},headers:{'x-ink-data-status':'fresh','x-ink-data-fetched-at':new Date().toISOString(),'date':new Date().toUTCString()}});
  });
  await context.routeWebSocket(/\/api\/live$/,s=>s.close());
  await context.route('**'+entry,async r=>{await held;await r.fallback().catch(()=>{});});
  try{
   await page.clock.install();const res=await page.goto(base+path,{waitUntil:'commit'});assert.equal(res.status(),mode==='ready'?200:503);
   await page.locator('[data-initial-record]').waitFor();await page.waitForFunction(()=>[...document.querySelectorAll('link[rel="stylesheet"]')].every(l=>l.sheet));
   assert.equal(reads,0);assert.equal(await page.locator('#main-content h1').count(),1);assert((await page.locator('#main-content').innerText()).includes(id));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   if(mode==='ready')assert.equal(await page.locator('[data-record-phase="ready"]').count(),1);
   await page.screenshot({path:`${out}/${engine}-${chainId}-${kind}-${scenario}-initial.png`});
   if(scenario==='expired')await page.clock.fastForward(16000);
   mode='ready';release();const selector=kind==='address'?'.address-page':'.token-detail-header';await page.locator(selector).waitFor();
   await page.getByRole('heading',{name:'Example profile',exact:true}).waitFor();
   if(scenario==='ready'||scenario==='aged')assert.equal(reads,0,'Fresh profile must not be discarded or fetched twice');else assert(reads>=1);
   if(scenario==='ready'||scenario==='aged'){
    await page.evaluate(axe.source);assert.deepEqual(await page.evaluate(async()=>(await axe.run(document)).violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}))),[]);
    const metric=kind==='address'?page.locator('.address-summary .metric > strong').first():page.locator('.token-price');
    if(kind==='address')await page.waitForFunction(()=>document.querySelector('[data-address-balance]')?.getAttribute('data-address-balance'));
    const before=await metric.innerText();revision=1;await page.clock.fastForward(61000);await page.waitForFunction(()=>true);await page.waitForFunction(({selector,before})=>document.querySelector(selector)?.innerText!==before&&!document.querySelector(selector)?.innerText.includes('N/A'),{selector:kind==='address'?'.address-summary .metric > strong':'.token-price',before});
    assert(reads>=1);assert(!(await metric.innerText()).includes('N/A'),'Automatic refresh must yield an actual value');
    await page.evaluate(()=>dispatchEvent(new Event('offline')));await page.waitForFunction(s=>document.querySelector(s)?.innerText.includes('N/A'),kind==='address'?'.address-summary .metric > strong':'.token-price');
    await page.evaluate(()=>dispatchEvent(new Event('online')));await page.waitForFunction(s=>!document.querySelector(s)?.innerText.includes('N/A'),kind==='address'?'.address-summary .metric > strong':'.token-price');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    await page.screenshot({path:`${out}/${engine}-${chainId}-${kind}-interactive.png`});
    await page.evaluate(path=>{history.pushState(null,'',path);dispatchEvent(new PopStateEvent('popstate'));},prefix+'/'+kind+'/'+nextId+'?lang='+language);
    await page.waitForFunction(id=>{const text=document.querySelector('#main-content')?.innerText||'';return text&&!text.includes('Example profile')&&!text.includes(id);},id);assert(!(await page.locator('#main-content').innerText()).includes('Example profile'));assert(!(await page.locator('#main-content').innerText()).includes(id));releaseNext();await page.getByRole('heading',{name:'Next profile',exact:true}).waitFor();assert(nextReads>=1);
   }
   assert.deepEqual(errors,[]);assert.equal(documents,1);Object.assign(row,{passed:true,reads,nextReads,documents});
  }catch(e){Object.assign(row,{passed:false,error:e.stack,errors,reads,nextReads,documents});await page.screenshot({path:`${out}/${engine}-${chainId}-${kind}-${scenario}-failure.png`}).catch(()=>{});}
  finally{release();releaseNext();await context.close();}
  results.push(row);console.log(JSON.stringify(row));await writeFile(out+'/results.json',JSON.stringify({base,documentMocked:true,apiMocked:true,complete:false,results},null,2));
 }}finally{await browser.close();}
}}finally{globalThis.fetch=savedFetch;}
const report={base,documentMocked:true,apiMocked:true,physicalDevices:false,complete:true,passed:results.every(r=>r.passed),results};await writeFile(out+'/results.json',JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;
