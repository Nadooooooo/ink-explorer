import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,firefox,webkit} from 'playwright-core';
import axe from 'axe-core';
const base=process.env.BASE_URL||'http://127.0.0.1:4315',out=process.env.ADDRESS_LIVE_OUTPUT||'reports/address-live/browser';
await mkdir(out,{recursive:true});const results=[],id='0x'+'1'.repeat(40),other='0x'+'2'.repeat(40);
const hash=(height,fork=false)=>'0x'+BigInt(height+(fork?10000:0)).toString(16).padStart(64,'0');
for(const[engine,launcher]of Object.entries({chromium,firefox,webkit}).filter(([name])=>!process.env.ADDRESS_LIVE_ENGINES||process.env.ADDRESS_LIVE_ENGINES.split(',').includes(name))){
 const browser=await launcher.launch(engine==='chromium'?{args:['--no-sandbox']}:{});
 try{for(const[prefix,chainId,width]of[['',57073,320],['/testnet',763373,1440]].filter((_,i)=>!process.env.ADDRESS_FIRST_CASE||i===0)){
  const context=await browser.newContext({viewport:{width,height:1000},...(process.env.INK_RELEASE_VERSION?{extraHTTPHeaders:{'Cloudflare-Workers-Version-Overrides':`inkexplorer="${process.env.INK_RELEASE_VERSION}"`}}:{})}),page=await context.newPage(),row={engine,chainId,width,checks:[]},errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(12000);
  let now=Date.now(),height=100,sequence=0,fork=false,socket,reads=0,documents=0,mode='normal',gate,release;
  const stamp=()=>new Date(now).toISOString();
  const observation=(address=id)=>({schema:1,chainId:mode==='wrong-chain'?1:chainId,address,balance:String(BigInt(height-99)*10n**18n),block:{number:height,hash:hash(height,fork),timestamp:Math.floor(now/1000)},observedAt:stamp(),source:'local'});
  const profile=address=>({hash:address,chain_id:chainId,name:address===id?'Current account':'Next account',coin_balance:'999000000000000000000',block_number_balance_updated_at:1,is_contract:false,is_verified:false});
  const frame=()=>({type:'snapshot',protocol:'ink-observer.live.v1',sequence:++sequence,sentAt:stamp(),network:{chainId,expectedChainId:chainId,head:height,online:true,synced:true,stale:false,sampledAt:stamp()},block:{height,hash:hash(height,fork),timestamp:stamp()},blocks:Array.from({length:Math.min(20,height-99)},(_,i)=>({height:height-i,hash:hash(height-i,i===0&&fork),timestamp:stamp(),transaction_hashes:[]})),transactions:[]});
  const send=()=>socket.send(JSON.stringify(frame()));
  const amount=()=>page.locator('[data-address-balance]').getAttribute('data-address-balance');
  const waitAmount=value=>page.waitForFunction(value=>document.querySelector('[data-address-balance]')?.getAttribute('data-address-balance')===value,value);
  const hold=()=>{gate=new Promise(r=>release=r);};
  const unblock=()=>{release?.();gate=undefined;};
  const check=async(name,fn)=>{await fn();row.checks.push({name,passed:true});};
  page.on('request',r=>{if(r.isNavigationRequest()&&r.frame()===page.mainFrame())documents++;});
  await context.route('**/api/**',async route=>{
   const path=new URL(route.request().url()).pathname.replace(/^\/testnet/,'');
   if(path==='/api/live/config')return route.fulfill({json:{url:base.replace(/^http/,'ws')+prefix+'/api/live'}});
   if(path==='/api/live/snapshot')return route.fulfill({json:frame()});
   if(path.startsWith('/api/address-balance/')){reads++;const body=observation(path.split('/').at(-1));await gate;return route.fulfill({json:body}).catch(()=>{});}
   if(/^\/api\/explorer\/addresses\/0x[0-9a-f]{40}$/.test(path))return route.fulfill(mode==='index-down'?{status:503,json:{error:'Data source unavailable'},headers:{'retry-after':'1'}}:{json:profile(path.split('/').at(-1)),headers:{'x-ink-data-status':'fresh','x-ink-data-fetched-at':stamp(),'date':new Date(now).toUTCString()}});
   if(path.endsWith('/counters'))return route.fulfill({json:{transactions_count:'1',token_transfers_count:'0'},headers:{'x-ink-data-status':'fresh','x-ink-data-fetched-at':stamp(),'date':new Date(now).toUTCString()}});
   return route.fulfill({json:{items:[]},headers:{'x-ink-data-status':'fresh','x-ink-data-fetched-at':stamp(),'date':new Date(now).toUTCString()}});
  });
  await context.routeWebSocket(/\/api\/live$/,ws=>{socket=ws;send();});
  try{
   await page.clock.install({time:new Date(now)});await page.goto(base+prefix+'/address/'+id+'?lang=en');
   await waitAmount('1000000000000000000');now=await page.evaluate(()=>Date.now());now+=1000;await page.clock.pauseAt(new Date(now));
   await check('Node balance replaces an unchanged historical index without reloading',async()=>{assert.equal(await amount(),'1000000000000000000');assert(!(await page.locator('.address-summary').innerText()).includes('999 ETH'));assert.equal(documents,1);});
   height=101;send();await waitAmount('2000000000000000000');
   const repeated=reads;for(let i=0;i<10;i++)send();await page.waitForTimeout(150);
   await check('Duplicate reports do not duplicate balance reads',async()=>assert.equal(reads,repeated));
   hold();now+=300;await page.clock.fastForward(300);height=102;send();
   const until=Date.now()+3000;while(reads===repeated&&Date.now()<until)await page.waitForTimeout(20);assert(reads>repeated);
   const heldReads=reads;for(height=103;height<106;height++)send();height=105;
   await page.waitForTimeout(150);await check('Burst keeps a single request in flight',async()=>assert.equal(reads,heldReads));
   unblock();await page.clock.fastForward(300);now+=300;send();await waitAmount('6000000000000000000');
   await check('Latest head is read after the pending request',async()=>assert(reads<=heldReads+1));
   hold();fork=true;send();await waitAmount('');
   await check('Same-height replacement hides the former balance immediately',async()=>assert.equal(await amount(),''));
   unblock();await page.clock.fastForward(300);now+=300;send();await waitAmount('6000000000000000000');
   assert.equal(await page.locator('[data-address-balance]').getAttribute('data-balance-hash'),hash(height,true));
   fork=false;mode='wrong-chain';height=106;await page.clock.fastForward(300);now+=300;send();await waitAmount('');
   await check('Wrong-chain response cannot display a balance',async()=>assert.equal(await amount(),''));
   mode='normal';height=107;now+=1500;await page.clock.fastForward(1500);send();await waitAmount('8000000000000000000');
   await page.evaluate(()=>dispatchEvent(new Event('offline')));await waitAmount('');
   await page.evaluate(()=>dispatchEvent(new Event('online')));now+=500;await page.clock.fastForward(500);await waitAmount('8000000000000000000');
   await check('Offline clears the balance and recovery needs no document reload',async()=>assert.equal(documents,1));
   now+=16000;await page.clock.fastForward(16000);await waitAmount('');await page.waitForTimeout(100);now+=1100;await page.clock.fastForward(1100);await page.waitForTimeout(100);send();await waitAmount('8000000000000000000');
   await check('Silent transport expires the balance and fresh observations recover it',async()=>assert.equal(documents,1));
   hold();now+=300;await page.clock.fastForward(300);height=108;send();await page.waitForTimeout(100);
   await page.evaluate(path=>{history.pushState(null,'',path);dispatchEvent(new PopStateEvent('popstate'));},prefix+'/address/'+other+'?lang=en');
   await page.getByRole('heading',{name:'Next account',exact:true}).waitFor();assert.equal(await amount(),'');unblock();
   now+=500;await page.clock.fastForward(500);send();await waitAmount('9000000000000000000');
   await check('Navigation cancels old-address work without leaking its identity',async()=>{assert(!(await page.locator('#main-content').innerText()).includes(id));assert.equal(documents,1);});
   mode='index-down';const unknown='0x'+'3'.repeat(40);
   await page.evaluate(path=>{history.pushState(null,'',path);dispatchEvent(new PopStateEvent('popstate'));},prefix+'/address/'+unknown+'?lang=en');
   now+=500;await page.clock.fastForward(500);send();await waitAmount('9000000000000000000');
   await check('A failed index profile cannot hide a verified node balance',async()=>{assert((await page.locator('#main-content').innerText()).includes(unknown));assert.equal(documents,1);});
   await page.clock.resume();await page.evaluate(axe.source);
   await check('Layout, accessibility and scripts',async()=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(async()=>(await axe.run(document)).violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>v.id)),[]);});
   await page.screenshot({path:`${out}/${engine}-${chainId}.png`});Object.assign(row,{passed:true,reads,documents});
  }catch(error){Object.assign(row,{passed:false,error:error.stack,reads,documents,errors,debug:await page.evaluate(()=>({head:document.querySelector('[data-live-head]')?.outerHTML,balance:document.querySelector('[data-address-balance]')?.outerHTML,startup:!!document.querySelector('#ink-startup'),scripts:[...document.scripts].map(s=>s.src).filter(Boolean)})),socketCreated:!!socket});await page.screenshot({path:`${out}/${engine}-${chainId}-failure.png`}).catch(()=>{});}
  finally{unblock();await context.close();}
  results.push(row);console.log(JSON.stringify(row));await writeFile(out+'/results.json',JSON.stringify({base,apiMocked:true,complete:false,results},null,2));
 }}finally{await browser.close();}
}
const report={base,apiMocked:true,physicalDevices:false,complete:true,passed:results.every(r=>r.passed),results};await writeFile(out+'/results.json',JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;
