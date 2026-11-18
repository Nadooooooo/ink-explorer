import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
import {mkdir,writeFile}from'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4310',out=process.env.LEDGER_ARRIVAL_OUTPUT||'reports/ledger-arrival/browser',results=[];
await mkdir(out,{recursive:true});
for(const[engine,launcher]of Object.entries({chromium,firefox,webkit})){
 const browser=await launcher.launch(engine==='chromium'?{args:['--no-sandbox']}:{});
 try{for(const[prefix,chainId,width]of[['',57073,390],['/testnet',763373,1440]])for(const path of ['/blocks','/txs','/blocks?type=reorg']){
  const c=await browser.newContext({viewport:{width,height:844},...(process.env.INK_RELEASE_VERSION?{extraHTTPHeaders:{'Cloudflare-Workers-Version-Overrides':`inkexplorer="${process.env.INK_RELEASE_VERSION}"`}}:{})}),p=await c.newPage(),row={engine,prefix,path,width},errors=[];
  p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(10000);let socket,release;const gate=new Promise(r=>release=r);const now=new Date().toISOString(),hash=n=>'0x'+n.repeat(64),address='0x'+'a'.repeat(40),isBlocks=path.startsWith('/blocks'),forked=path.includes('reorg');
  const block=(height,id)=>({height,hash:hash(id),timestamp:now,gas_limit:'30000000',gas_used:'0',transactions_count:1,size:1234,miner:{hash:address},transaction_hashes:[hash(id)]});
  const tx=(height,id)=>({hash:hash(id),timestamp:now,block_number:height,block_hash:hash(id),position:0,status:'ok',value:'0',fee:{value:'0'},from:{hash:address},to:{hash:address},method:'transfer'});
  const current=block(9000000,'b'),recent=tx(9000000,'b'),make=isBlocks?block:tx;
  const frame=seq=>({protocol:'ink-observer.live.v1',type:'snapshot',sequence:seq,sentAt:now,network:{chainId,expectedChainId:chainId,head:9000000,online:true,synced:true,stale:false,sampledAt:now},block:current,blocks:[current],transactions:[recent]});
  await c.routeWebSocket(/\/api\/live$/,ws=>{socket=ws;ws.send(JSON.stringify(frame(1)));});
  await c.route('**/api/**',async r=>{
   const url=new URL(r.request().url()),name=url.pathname.replace(/^\/testnet/,'');
   if(name==='/api/live/config')return r.fulfill({json:{url:base.replace(/^http/,'ws')+prefix+'/api/live'}});
   if(name==='/api/live/snapshot')return r.fulfill({json:frame(1)});
   if(name==='/api/explorer/'+(isBlocks?'blocks':'transactions')){await gate;const older=url.searchParams.has('block_number');return r.fulfill({json:{items:older?[make(7000000,'c')]:[make(9000000,'a'),make(8000000,'d')],next_page_params:older?null:{block_number:8000000,index:50}}}).catch(()=>{});}
   return r.fulfill({json:{items:[],counters:[]}});
  });
  const selector=isBlocks?'.block-row .block-height a':'.tx-row .tx-primary a',read=()=>p.locator(selector).evaluateAll(a=>a.map(e=>e.getAttribute('href')));
  try{
   await p.goto(base+prefix+path,{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>document.querySelector('[data-live-head]')?.dataset.liveHead==='9000000');release();await p.locator(selector).first().waitFor();await p.waitForTimeout(150);
   const initial=await read(),expectedFirst=prefix+(isBlocks?'/block/'+(forked?hash('a'):'9000000'):'/tx/'+hash('b'));
   assert.equal(initial[0],expectedFirst,'The first indexed response must include the already observed live head, except in forked-block views');
   if(!isBlocks)assert(!initial.some(h=>h.endsWith(hash('a'))),'A transaction disproved by the observed canonical block is excluded');
   if(!forked){
    await p.locator('.ledger-top-pagination').first().getByRole('button',{name:'Next page',exact:true}).click();await p.waitForFunction(({selector,expected})=>document.querySelector(selector)?.getAttribute('href')===expected,{selector,expected:prefix+(isBlocks?'/block/7000000':'/tx/'+hash('c'))});
    socket.send(JSON.stringify(frame(2)));await p.waitForTimeout(100);assert.deepEqual(await read(),[prefix+(isBlocks?'/block/7000000':'/tx/'+hash('c'))],'Live rows must not leak into historical pagination');
    await p.locator('.ledger-top-pagination').first().locator('button').first().click();await p.waitForFunction(({selector,expected})=>document.querySelector(selector)?.getAttribute('href')===expected,{selector,expected:expectedFirst});
   }
   assert.deepEqual(errors,[]);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await p.screenshot({path:`${out}/${engine}-${chainId}-${forked?'forked':isBlocks?'blocks':'txs'}.png`});Object.assign(row,{initial,passed:true});
  }catch(e){Object.assign(row,{passed:false,error:e.stack,errors});}
  finally{release();await c.close();}
  results.push(row);console.log(JSON.stringify(row));await writeFile(out+'/results.json',JSON.stringify({base,apiMocked:true,physicalDevices:false,complete:false,results},null,2));
 }}finally{await browser.close();}
}
await writeFile(out+'/results.json',JSON.stringify({base,apiMocked:true,physicalDevices:false,complete:true,passed:results.every(r=>r.passed),results},null,2));if(results.some(r=>!r.passed))process.exitCode=1;
