import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright-core';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4310',out=process.env.DETAIL_OUTPUT||'reports/detail-ergonomics/browser';await mkdir(out,{recursive:true});
const axe=await readFile('node_modules/axe-core/axe.min.js','utf8'),results=[];
const hash=n=>'0x'+n.toString(16).padStart(64,'0'),wallet='0x'+'a'.repeat(40),contract='0x4200000000000000000000000000000000000011',timestamp='2026-10-17T22:21:55Z';
const block={height:100,hash:hash(100),parent_hash:hash(99),type:'block',timestamp,transactions_count:3,size:4248,gas_limit:'30000000',gas_used:'607485',gas_used_percentage:2.02,base_fee_per_gas:'301',transaction_fees:'2965671458',miner:{hash:contract,name:'Proxy',is_contract:true,is_verified:true,proxy_type:'eip1967',implementations:[{name:'SequencerFeeVault',address_hash:wallet}]}};
const tx=n=>({hash:hash(1000+n),block_number:100,block_hash:block.hash,timestamp,status:'ok',method:'safeTransferFrom',from:{hash:wallet,is_contract:false},to:{hash:contract,name:'SequencerFeeVault',is_contract:true,is_verified:true},gas_used:'46230',gas_limit:'1000000',gas_price:'301',fee:{type:'actual',value:'2965671458'},value:'1000000000000000001',nonce:10,confirmations:3});
for(const[engine,launcher]of Object.entries({chromium,firefox,webkit})){
 const browser=await launcher.launch(engine==='chromium'?{args:['--no-sandbox']}:{});
 try{for(const prefix of['','/testnet'])for(const width of[320,768,1440]){
  const chainId=prefix?763373:57073,context=await browser.newContext({viewport:{width,height:1000},colorScheme:width===320?'light':'dark',bypassCSP:true}),page=await context.newPage(),row={engine,prefix,width,passed:false},errors=[],requests=[];
  page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));let socket,sequence=0,canonical=block.hash,window=true,pending=true;
  const frame=()=>({type:'snapshot',protocol:'ink-observer.live.v1',sequence:++sequence,sentAt:new Date().toISOString(),network:{chainId,expectedChainId:chainId,head:102,online:true,synced:true,stale:false,safeBlock:100,finalizedBlock:100},block:{...block,height:102,hash:hash(102)},blocks:window?[{...block,hash:canonical}]:[],transactions:[]});
  await context.route('**/api/live/config',r=>r.fulfill({json:{url:base.replace(/^http/,'ws')+prefix+'/api/live'}}));await context.route('**/api/live/snapshot',r=>r.fulfill({json:frame()}));await context.routeWebSocket(/\/api\/live$/,ws=>{socket=ws;ws.send(JSON.stringify(frame()));});
  await context.route(/\/api\/explorer\/blocks\/[^/?]+(?:\/transactions)?(?:\?|$)/,r=>{
   const url=new URL(r.request().url());requests.push(url.pathname+url.search);
   if(url.pathname.endsWith('/transactions')){
    if(pending)return r.fulfill({status:202,json:{code:'BLOCK_INDEXING',chainId,block:{number:'100',hash:block.hash},retryAfterMs:3000}});
    return r.fulfill({json:{items:url.search?[tx(3)]:[tx(1),tx(2)],next_page_params:url.search?null:{index:0,block_number:100}}});
   }
   return r.fulfill({json:block});
  });
  await context.route(/\/api\/explorer\/transactions\/0x[\da-f]{64}$/,r=>r.fulfill({json:tx(1)}));
  try{
   await page.clock.install();await page.goto(base+prefix+'/block/100?lang=fr',{waitUntil:'domcontentloaded'});await page.locator('.block-definitions').waitFor();await page.locator('[data-live-transport="websocket"]').waitFor({state:'attached'});
   assert(!requests.some(u=>u.includes('/transactions')),'Transactions must be requested when selected');
   const hashRow=await page.locator('.block-definitions .definition').first().boundingBox(),facts=await page.locator('.block-definitions').boundingBox();assert(hashRow.width>=facts.width-3,'Long identifiers need the full detail width');
   assert.equal(await page.locator('.detail-actions a').first().getAttribute('href'),prefix+'/block/'+block.parent_hash+'?lang=fr');
   assert.equal(await page.locator('.detail-actions a').last().getAttribute('aria-disabled'),null);
   canonical=hash(999);socket.send(JSON.stringify(frame()));await page.locator('.status.forked').waitFor();assert.equal(await page.locator('.detail-actions a').last().getAttribute('aria-disabled'),'true');
   window=false;socket.send(JSON.stringify(frame()));await page.clock.fastForward(100);assert.equal(await page.locator('.status.forked').count(),1);
   await page.locator('.forked-block-state button').click();await page.locator('.canonical-block-link').waitFor();assert((await page.locator('.canonical-block-link').getAttribute('href')).includes(hash(999)));await page.keyboard.press('Escape');
   await page.locator('.inline-section-navigation .tabs button').nth(1).click();await page.locator('.block-indexing[data-kind="transactions"]').waitFor();assert(requests.some(u=>u.includes('/'+block.hash+'/transactions')));assert(!requests.some(u=>/\/100\/transactions/.test(u)));
   pending=false;await page.clock.fastForward(3100);await page.locator('.block-transactions .tx-row').nth(1).waitFor();
   await page.locator('.pagination button').click();await page.locator('.block-transactions .tx-row').nth(2).waitFor();assert(requests.some(u=>u.includes('index=0')));
   const geometry=await page.locator('.block-transactions .tx-row').first().evaluate(el=>{const row=el.getBoundingClientRect(),method=el.querySelector('.method').getBoundingClientRect(),block=el.querySelector('.tx-block').getBoundingClientRect(),parties=[...el.querySelectorAll('.flow-party')].map(e=>e.getBoundingClientRect());return {width:row.width,viewport:innerWidth,methodBlockOverlap:Math.min(method.right,block.right)>Math.max(method.left,block.left)+1&&Math.min(method.bottom,block.bottom)>Math.max(method.top,block.top)+1,inside:parties.every(p=>p.right<=row.right+1&&p.left>=row.left-1)};});assert(!geometry.methodBlockOverlap&&geometry.inside);if(width>1000)assert(geometry.width>1000);
   await page.screenshot({path:`${out}/${engine}-${prefix?'sepolia':'mainnet'}-${width}-transactions.png`});
   await page.reload({waitUntil:'domcontentloaded'});await page.locator('.block-transactions .tx-row').nth(1).waitFor();assert.equal(new URL(page.url()).searchParams.get('tab'),'transactions');
   await page.locator('.inline-section-navigation .tabs button').first().click();await page.locator('.block-definitions').waitFor();window=true;canonical=block.hash;socket.send(JSON.stringify(frame()));await page.waitForFunction(()=>document.querySelector('.detail-header .status.ok')?.textContent.includes('Finalisé'));
   await page.screenshot({path:`${out}/${engine}-${prefix?'sepolia':'mainnet'}-${width}-block.png`});
   await page.goto(base+prefix+'/tx/'+tx(1).hash+'?lang=fr',{waitUntil:'domcontentloaded'});await page.locator('.transaction-definitions').waitFor();
   assert.equal(await page.locator('h1').innerText(),'Détails de la transaction');
   assert.equal((await page.locator('main').innerText()).split(tx(1).hash).length-1,1,'The full transaction hash is shown once');
   assert.equal(await page.locator('.transaction-definitions .detail-party .entity-mark').count(),2);
   for(const mark of await page.locator('.transaction-definitions .detail-party .entity-mark').all())assert(await mark.isVisible());
   assert.match(await page.locator('.transaction-definitions').innerText(),/1,000000000000000001/);
   await page.evaluate(axe);row.violations=await page.evaluate(async()=> (await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})));assert.deepEqual(row.violations,[]);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);
   await page.screenshot({path:`${out}/${engine}-${prefix?'sepolia':'mainnet'}-${width}-tx-detail.png`});Object.assign(row,{passed:true,geometry,requests,checks:['separate full-width ledger','hash-pinned transaction requests and pagination','indexing retry','open-block reorganization and canonical recovery','fork observation survives live window eviction','reload keeps selected tab','single transaction identifier','mobile account icons','exact values','accessibility']});
  }catch(e){row.error=e.stack;await page.screenshot({path:`${out}/failure-${engine}-${prefix?'sepolia':'mainnet'}-${width}.png`}).catch(()=>{});}finally{await context.close();}
  results.push(row);console.log(JSON.stringify(row));await writeFile(out+'/results.json',JSON.stringify({base,complete:false,results},null,2));
 }}finally{await browser.close();}
}
await writeFile(out+'/results.json',JSON.stringify({base,complete:true,passed:results.every(r=>r.passed),physicalDeviceTest:false,results},null,2));if(results.some(r=>!r.passed))process.exitCode=1;
