import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {registerHooks} from 'node:module';
import {chromium,firefox,webkit} from 'playwright';
import axe from 'axe-core';
registerHooks({resolve(s,c,n){try{return n(s,c)}catch(e){if(s.startsWith('./')&&c.parentURL?.includes('/src/')&&!/\.[a-z]+$/.test(s))return n(s+'.ts',c);throw e;}}});
const {handleRequest}=await import('../cloudflare/worker.mjs');
const base=process.env.BASE_URL||'http://127.0.0.1:4310',out=process.env.TX_FOLLOW_OUTPUT||'reports/transaction-follow/browser';await mkdir(out,{recursive:true});
const saved=globalThis.fetch,results=[];let initial;
globalThis.fetch=(url,options)=>String(url).startsWith('https://transaction-fixture.invalid/')?initial():saved(url,options);
const env={PUBLIC_URL:base,API_ORIGIN:'https://transaction-fixture.invalid',ORIGIN_TOKEN:'fixture-only',ASSETS:{async fetch(r){try{return new Response(await readFile('dist'+new URL(r.url).pathname));}catch{return new Response('Missing',{status:404});}}}};
const id='0x'+'a'.repeat(64),old='0x'+'b'.repeat(64),replacement='0x'+'c'.repeat(64),wallet='0x'+'d'.repeat(40),second='0x'+'e'.repeat(64);
try{for(const[engine,launcher]of Object.entries({chromium,firefox,webkit}).filter(([n])=>!process.env.TX_FOLLOW_ENGINES||process.env.TX_FOLLOW_ENGINES.split(',').includes(n))){
 const browser=await launcher.launch(engine==='chromium'?{args:['--no-sandbox']}:{});
 try{for(const[prefix,chainId,width]of[['',57073,320],['/testnet',763373,1440]])for(const scenario of ['stream','recovery','gap']){
  const c=await browser.newContext({viewport:{width,height:1000},...(process.env.INK_RELEASE_VERSION?{extraHTTPHeaders:{'Cloudflare-Workers-Version-Overrides':`inkexplorer="${process.env.INK_RELEASE_VERSION}"`}}:{})}),p=await c.newPage(),errors=[],row={engine,chainId,width,scenario,checks:[]};p.setDefaultTimeout(10000);p.on('pageerror',e=>errors.push(e.message));
  let now=Date.now(),socket,sequence=0,reads=0,documents=0,mode=scenario==='recovery'?'down':'pending',releaseOld,hold=false,receiptResult=null,receiptReads=0;
  const oldGate=new Promise(resolve=>releaseOld=resolve);
  const pending={hash:id,block_number:null,status:'pending',from:{hash:wallet,name:'Test wallet'},to:{hash:wallet},gas_limit:'300000',value:'1000000000000000000',fee:{type:'maximum',value:'999999999'},nonce:7,method:'testMethod',raw_input:'0x12345678'};
  let ready={...pending,block_number:100,status:'ok',result:'success',gas_used:'21000',gas_price:'2',fee:{type:'actual',value:'42000'},timestamp:new Date(now).toISOString(),confirmations:999999};
  const frame=(head=100,blocks=[],transactions=[])=>({protocol:'ink-observer.live.v1',type:'snapshot',sequence:++sequence,sentAt:new Date(now).toISOString(),network:{chainId,expectedChainId:chainId,head,online:true,synced:true,stale:false,sampledAt:new Date(now).toISOString(),finalizedBlock:90},blocks,transactions});
  let current=frame();
  initial=async()=>Response.json(scenario!=='recovery'?pending:{error:'Controlled outage'},{status:scenario!=='recovery'?200:503,headers:{'x-ink-data-status':'fresh','x-ink-data-fetched-at':new Date().toISOString(),'retry-after':'1'}});
  p.on('request',r=>{if(r.isNavigationRequest()&&r.frame()===p.mainFrame())documents++;});
  await c.route('**/*',async r=>{if(r.request().resourceType()!=='document')return r.fallback();const res=await handleRequest(new Request(r.request().url()),env);return r.fulfill({status:res.status,headers:Object.fromEntries(res.headers),body:Buffer.from(await res.arrayBuffer())});});
  await c.route('**/api/**',async r=>{
   const name=new URL(r.request().url()).pathname.replace(/^\/testnet/,'');
   if(name==='/api/live/config')return r.fulfill({json:{url:base.replace(/^http/,'ws')+prefix+'/api/live'}});
   if(name==='/api/live/snapshot')return r.fulfill({json:current});
   if(name==='/api/explorer/transactions/'+id){reads++;if(hold)await oldGate;return r.fulfill(mode==='down'?{status:503,headers:{'retry-after':'1'},json:{error:'Controlled outage'}}:mode==='limited'?{status:429,headers:{'retry-after':'20'},json:{error:'Controlled cooldown'}}:{json:mode==='pending'?pending:ready}).catch(()=>{});}
   if(name==='/api/explorer/transactions/'+second)return r.fulfill({json:{...ready,hash:second,block_number:99}});
   if(name==='/api/contract-rpc'){receiptReads++;return r.fulfill({json:{chainId,result:receiptResult}});}
   return r.fulfill({json:{items:[]}});
  });
  await c.routeWebSocket(/\/api\/live$/,ws=>{socket=ws;ws.send(JSON.stringify(current));});
  const status=()=>p.locator('.transaction-detail-header .status');
  const check=async(name,fn)=>{await fn();row.checks.push(name);};
  const send=async(next)=>{now=await p.evaluate(()=>Date.now());current={...next,sequence:++sequence,network:{...next.network,sampledAt:new Date(now).toISOString()}};socket.send(JSON.stringify(current));await p.waitForTimeout(70);};
  const waitConfirm=n=>p.waitForFunction(n=>document.querySelector('[data-transaction-confirmations]')?.textContent===`${n} confirmations`,String(n));
  try{
   await p.clock.install({time:new Date(now)});await p.goto(base+prefix+'/tx/'+id+'?lang=en');await p.locator('#ink-startup').waitFor({state:'detached'});
   now=await p.evaluate(()=>Date.now());await p.clock.pauseAt(new Date(now+20));now+=20;
   if(scenario==='gap'){
    const block={height:100,hash:old,transaction_hashes:[id],timestamp:new Date(now).toISOString()};
    await send(frame(101,[block],[{...ready,block_hash:old}]));await waitConfirm(1);
    await p.evaluate(()=>dispatchEvent(new Event('pagehide')));
    ready={...ready,block_number:105,status:'error',result:'execution reverted'};mode='ready';
    current=frame(200,[],[]);current.network.finalizedBlock=190;
    receiptResult={transactionHash:id,blockHash:'0x'+'9'.repeat(64),blockNumber:'0x69',status:'0x0',gasUsed:'0x5208',effectiveGasPrice:'0x2',l1Fee:'0x3'};
    await p.evaluate(()=>dispatchEvent(new Event('pageshow')));await waitConfirm('N/A');
    await p.waitForFunction(()=>document.querySelector('.transaction-follow-notice')?.textContent.includes('Checking'));
    row.checks.push('Changed indexed inclusion after missed window masks the unverified count');
    await p.clock.fastForward(5100);await waitConfirm(95);assert.equal((await status().textContent()).trim(),'Failed');assert(receiptReads>=1);
    row.checks.push('Receipt verification moves the open record to the new inclusion without reload');
   }else if(scenario==='stream'){
    await check('Initial indexed pending is reused',async()=>{assert.equal((await status().textContent()).trim(),'Pending');assert.equal(reads,0);});
    if(width<600)await p.locator('.section-picker select').selectOption('input');else await p.locator('.tabs').getByRole('button',{name:'Input data',exact:true}).click();
    const block={height:100,hash:old,transaction_hashes:[id],timestamp:new Date(now).toISOString()};
    await send(frame(101,[block],[]));
    await check('Inclusion updates status and preserves selected tab',async()=>{assert.equal((await status().textContent()).trim(),'Confirmed');assert.equal(await p.locator('.section-picker select').inputValue(),'input');});
    if(width<600)await p.locator('.section-picker select').selectOption('overview');else await p.locator('.tabs').getByRole('button',{name:'Overview',exact:true}).click();await waitConfirm(1);
    const receipt={hash:id,block_number:100,block_hash:old,status:'error',result:'execution reverted',fee:{type:'actual',value:'42000'},gas_used:'21000',gas_price:'2'};
    await send(frame(105,[block],[receipt]));await waitConfirm(5);
    await check('Failure and confirmations follow receipts and head',async()=>assert.equal((await status().textContent()).trim(),'Failed'));
    await p.clock.fastForward(5100);await p.waitForTimeout(150);
    await check('Late pending index cannot erase node receipt',async()=>{assert(reads>=1);assert.equal((await status().textContent()).trim(),'Failed');});
    await send(frame(105,[{...block,hash:replacement,transaction_hashes:[]}],[]));
    await check('Canonical replacement removes old execution',async()=>{assert.equal((await status().textContent()).trim(),'Pending');assert((await p.locator('.transaction-follow-notice').innerText()).includes('replaced'));assert.equal(await p.locator('[data-transaction-confirmations]').count(),0);});
    await send(frame(105,[{...block,height:101,hash:replacement}],[{...receipt,block_number:101,block_hash:replacement,status:'ok',result:'success',fee:{type:'actual',value:'42'}}]));await waitConfirm(4);
    await check('Reinclusion resumes without reload',async()=>{assert.equal((await status().textContent()).trim(),'Success');assert.equal(await p.locator('.transaction-follow-notice').count(),0);});
    current.network.sampledAt=new Date(now-20000).toISOString();socket.send(JSON.stringify(current));await waitConfirm('N/A');
    await check('Expired head does not retain a current count',async()=>assert((await p.locator('[data-transaction-confirmations]').innerText()).includes('N/A')));
    await send(current);await waitConfirm(4);
    await send(frame(140,[{height:101,hash:'0x'+'f'.repeat(64),transaction_hashes:[]}],[]));
    current=frame(140,[],[]);await send(current);
    receiptResult={transactionHash:id,blockHash:'0x'+'9'.repeat(64),blockNumber:'0x66',status:'0x0',gasUsed:'0x5208',effectiveGasPrice:'0x2',l1Fee:'0x3'};
    await p.clock.fastForward(5100);await waitConfirm(38);
    await check('Receipt RPC recovers reinclusion missed by the short stream window',async()=>{assert(receiptReads>=1);assert.equal((await status().textContent()).trim(),'Failed');});
    await p.evaluate(()=>dispatchEvent(new Event('pagehide')));const before=reads;await p.clock.fastForward(20000);await p.waitForTimeout(100);assert.equal(reads,before);
    now=await p.evaluate(()=>Date.now());current.network.sampledAt=new Date(now).toISOString();await p.evaluate(()=>dispatchEvent(new Event('pageshow')));await waitConfirm(38);row.checks.push('Suspension stops reads; resume restores observation');
   }else{
    await p.locator('.error-state').waitFor();mode='ready';await p.clock.fastForward(5100);await p.locator('.transaction-definitions').waitFor();await waitConfirm(0);
    row.checks.push('Initial 503 recovers automatically without a click');
    mode='limited';await p.clock.fastForward(5100);await p.locator('.transaction-follow-notice').waitFor();const before=reads;
    await p.clock.fastForward(15000);await p.waitForTimeout(100);assert.equal(reads,before);mode='ready';await p.clock.fastForward(5100);await p.locator('.transaction-follow-notice').waitFor({state:'detached'});assert(reads>before);row.checks.push('Background retry obeys Retry-After and retains the record');
    await p.evaluate(()=>dispatchEvent(new Event('offline')));await waitConfirm('N/A');now=await p.evaluate(()=>Date.now());current=frame(110);await p.evaluate(()=>dispatchEvent(new Event('online')));await waitConfirm(10);row.checks.push('Offline and online update confirmations without reload');
   }
   await p.clock.resume();await p.evaluate(axe.source);assert.deepEqual(await p.evaluate(async()=>(await axe.run(document)).violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}))),[]);
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await p.screenshot({path:`${out}/${engine}-${chainId}-${scenario}.png`});
   hold=true;await p.clock.fastForward(5100);await p.waitForTimeout(100);
   await p.evaluate(path=>{history.pushState(null,'',path);dispatchEvent(new PopStateEvent('popstate'));},prefix+'/tx/'+second+'?lang=en');await p.locator('.transaction-detail-header').filter({hasText:second}).waitFor();releaseOld();await p.waitForTimeout(100);assert(!(await p.locator('.transaction-detail-header').innerText()).includes(id));row.checks.push('Navigation cancels old request and rejects its late response');
   assert.deepEqual(errors,[]);assert.equal(documents,1);Object.assign(row,{passed:true,reads,receiptReads,documents});
  }catch(e){Object.assign(row,{passed:false,error:e.stack,errors,reads,documents});await p.screenshot({path:`${out}/${engine}-${chainId}-${scenario}-failure.png`}).catch(()=>{});}
  finally{releaseOld();await c.close();}
  results.push(row);console.log(JSON.stringify(row));await writeFile(out+'/results.json',JSON.stringify({base,documentMocked:true,apiMocked:true,physicalDevices:false,complete:false,results},null,2));
 }}finally{await browser.close();}
}}finally{globalThis.fetch=saved;}
await writeFile(out+'/results.json',JSON.stringify({base,documentMocked:true,apiMocked:true,physicalDevices:false,complete:true,passed:results.every(r=>r.passed),results},null,2));if(results.some(r=>!r.passed))process.exitCode=1;
