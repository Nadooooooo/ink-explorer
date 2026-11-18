import assert from 'node:assert/strict';
import{chromium,firefox,webkit}from'playwright-core';
import{mkdir,writeFile,readFile}from'node:fs/promises';
import axe from'axe-core';
const base=process.env.BASE_URL||'http://127.0.0.1:4310',out=process.env.STREAM_FIRST_OUTPUT||'reports/stream-first/browser';await mkdir(out,{recursive:true});const results=[];
for(const[engine,launcher]of Object.entries({chromium,firefox,webkit}).filter(([name])=>!process.env.STREAM_FIRST_ENGINES||process.env.STREAM_FIRST_ENGINES.split(',').includes(name))){
 const browser=await launcher.launch(engine==='chromium'?{args:['--no-sandbox']}:{});
 try{for(const[prefix,chainId,width,locale]of[['',57073,320,'fr'],['/testnet',763373,1440,'ar']])for(const scenario of ['blocks','transactions','scope']){
  const path=scenario==='transactions'?'/txs':'/blocks',kind=scenario==='transactions'?'transactions':'blocks',isBlocks=kind==='blocks';
  const c=await browser.newContext({viewport:{width,height:1000},...(process.env.INK_RELEASE_VERSION?{extraHTTPHeaders:{'Cloudflare-Workers-Version-Overrides':`inkexplorer="${process.env.INK_RELEASE_VERSION}"`}}:{})}),p=await c.newPage(),errors=[],assetErrors=[],row={engine,prefix,width,locale,scenario};p.setDefaultTimeout(10000);
  p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=400&&['script','font','stylesheet'].includes(r.request().resourceType()))assetErrors.push({url:r.url(),status:r.status()});});
  let socket,release,mode='held',height=1000,sequence=0,reads=0,indexResponses=0,documents=0;const requests=[],gate=new Promise(r=>release=r),h=n=>'0x'+BigInt(n).toString(16).padStart(64,'0'),address='0x'+'a'.repeat(40),now=new Date().toISOString();p.on('request',r=>{if(r.isNavigationRequest()&&r.frame()===p.mainFrame())documents++;});
  const block=(n=1000,id=n)=>({height:n,hash:h(id),timestamp:now,miner:{hash:address},transaction_hashes:[h(id)],transactions_count:1,size:1000,gas_limit:'100',gas_used:'1'});
  const tx=(n=1000,id=n)=>({hash:h(id),block_number:n,block_hash:h(n),position:0,timestamp:now,from:{hash:address},to:{hash:address},value:'0',fee:{value:'1'},status:'ok',method:'0x12345678'}),make=isBlocks?block:tx;
  const frame=()=>({protocol:'ink-observer.live.v1',type:'snapshot',sequence:++sequence,sentAt:now,network:{online:true,synced:true,stale:false,chainId,expectedChainId:chainId,head:height,sampledAt:now},block:block(height),blocks:height===1000?[block(1000)]:[block(height),block(1000)],transactions:height===1000?[tx(1000)]:[tx(height),tx(1000)]});
  await c.routeWebSocket(/\/api\/live$/,ws=>{socket=ws;ws.send(JSON.stringify(frame()));});
  await c.route('**/api/**',async r=>{
   const u=new URL(r.request().url()),name=u.pathname.replace(/^\/testnet/,'');
   if(name==='/api/live/config')return r.fulfill({json:{url:base.replace(/^http/,'ws')+prefix+'/api/live'}});
   if(name==='/api/live/snapshot')return r.fulfill({json:frame()});
   if(name==='/api/explorer/'+kind){
    reads++;const requestMode=mode;requests.push({path:u.pathname+u.search,type:r.request().resourceType(),mode:requestMode});
    if(u.searchParams.get('type')==='reorg')return r.fulfill({json:{items:[{...block(1000,9990),type:'reorg'}],next_page_params:null}});
    // The public document can preload this URL before the application fetches
    // it, especially in WebKit. Hold every initial request, not just the first.
    if(requestMode==='held')await gate;
    if(requestMode==='fail')return r.fulfill({status:503,headers:{'retry-after':'10'},json:{error:'Controlled history failure'}});
    indexResponses++;const older=u.searchParams.has('block_number');
    const enriched={...make(1000),...(isBlocks?{miner:{hash:address,name:'Known beneficiary'}}:{to:{hash:address,name:'Known contract',is_contract:true},method:'knownMethod'})};
    return r.fulfill({json:{items:older?[make(700)]:[enriched,...Array.from({length:49},(_,i)=>make(900-i))],next_page_params:older?null:{block_number:852,index:0}}}).catch(()=>{});
   }
   return r.fulfill({json:{items:[],counters:[]}});
  });
  const selector=isBlocks?'.block-row .block-height a':'.tx-row .tx-primary a',urls=()=>p.locator(selector).evaluateAll(a=>a.map(e=>new URL(e.href).pathname)),expected=n=>prefix+(isBlocks?'/block/'+n:'/tx/'+h(n));
  const waitFirst=n=>p.waitForFunction(({selector,url})=>new URL(document.querySelector(selector)?.href||location.href).pathname===url,{selector,url:expected(n)});
  try{
   await p.clock.install();await p.goto(base+prefix+path+'?lang='+locale,{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>document.querySelector('[data-live-head]')?.dataset.liveHead==='1000');await waitFirst(1000);
   assert(reads>=1);assert.equal(indexResponses,0,'The first rows must precede every indexed response');assert.equal(await p.locator('.ledger-top-pagination').first().locator('button').last().isEnabled(),false,'No fabricated historical cursor');
   if(scenario==='scope'){
    await p.locator('.ledger-filters select').selectOption('reorg');await p.waitForFunction(({selector,expected})=>new URL(document.querySelector(selector)?.href||location.href).pathname===expected,{selector,expected:prefix+'/block/'+h(9990)});
    release();await p.waitForTimeout(120);assert.deepEqual(await urls(),[prefix+'/block/'+h(9990)],'Cancelled canonical response cannot overwrite forked view');socket.send(JSON.stringify(frame()));await p.waitForTimeout(100);assert.deepEqual(await urls(),[prefix+'/block/'+h(9990)]);
   }else{
    await p.locator('.table-shell').hover();height=1001;socket.send(JSON.stringify(frame()));await p.waitForFunction(()=>document.querySelector('[data-live-head]')?.dataset.liveHead==='1001');assert.deepEqual(await urls(),[expected(1000)],'Holding the table keeps visible rows stable');
    mode='good';release();await p.getByText(isBlocks?'Known beneficiary':'Known contract',{exact:true}).first().waitFor();assert.deepEqual(await urls(),[expected(1000)],'Late history enriches only held identities');assert.equal(await p.locator('.ledger-top-pagination').first().locator('button').last().isEnabled(),false);
    await p.locator('.new-rows-button').click();await p.mouse.move(1,1);await waitFirst(1001);await p.waitForFunction(selector=>document.querySelectorAll(selector).length===51,selector);assert((await urls()).includes(expected(852)),'The indexed tail remains visible before its cursor');
    mode='fail';await p.clock.fastForward(1200);await p.evaluate(()=>dispatchEvent(new Event('focus')));await p.locator('.ledger-history-notice').waitFor();height=1002;socket.send(JSON.stringify(frame()));await waitFirst(1002);assert.equal(await p.locator('.error-state').count(),0,'History failure does not replace valid rows');
    await p.evaluate(axe.source);assert.deepEqual(await p.evaluate(async()=>(await axe.run(document)).violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}))),[]);
    await p.locator('.ledger-history-notice').scrollIntoViewIfNeeded();assert(await p.locator('.ledger-history-notice').evaluate(n=>{const a=n.getBoundingClientRect();return [...n.querySelectorAll('button')].every(b=>{const r=b.getBoundingClientRect();return r.left>=a.left&&r.right<=a.right&&r.width>=44&&r.height>=44;});}),'Help and retry controls fit fully inside the notice');await p.screenshot({path:`${out}/${engine}-${chainId}-${kind}-history-down.png`});mode='good';const beforeRetry=reads;await p.locator('.ledger-history-notice > button').click();await p.waitForFunction(()=>document.querySelector('.ledger-history-notice > button')?.disabled);assert.equal(reads,beforeRetry,'Retry respects the server cooldown');await p.clock.fastForward(10050);await p.locator('.ledger-history-notice').waitFor({state:'detached'});await waitFirst(1002);assert.equal(documents,1,'Retry must not reload the document');
    await p.locator('.ledger-top-pagination').first().locator('button').last().click();await waitFirst(700);height=1003;socket.send(JSON.stringify(frame()));await p.waitForTimeout(120);assert.deepEqual(await urls(),[expected(700)],'Live rows do not enter historical pages');
    await p.locator('.ledger-top-pagination').first().locator('button').first().click();await waitFirst(1003);
    // Suspension cancels pending work and must not leave background retry loops.
    await p.evaluate(()=>dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));const suspendedReads=reads;await p.clock.fastForward(31000);await p.waitForTimeout(100);assert.equal(reads,suspendedReads,'Hidden page performs no index polling');
    await p.evaluate(()=>dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));await p.waitForFunction(()=>document.querySelector('[data-live-head]')?.dataset.liveHead==='1003');await waitFirst(1003);assert.equal(documents,1);
   }
   assert.deepEqual(errors,[]);assert.deepEqual(assetErrors,[]);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);Object.assign(row,{passed:true,reads,documents,requests});
  }catch(e){Object.assign(row,{passed:false,error:e.stack,errors,reads,mode,requests,indexResponses});await p.screenshot({path:`${out}/${engine}-${chainId}-${scenario}-failure.png`}).catch(()=>{});}
  finally{release();await c.close();}
  results.push(row);console.log(JSON.stringify(row));await writeFile(out+'/results.json',JSON.stringify({base,apiMocked:true,physicalDevices:false,complete:false,results},null,2));
 }}finally{await browser.close();}
}
await writeFile(out+'/results.json',JSON.stringify({base,apiMocked:true,physicalDevices:false,complete:true,passed:results.every(r=>r.passed),results},null,2));if(results.some(r=>!r.passed))process.exitCode=1;
