import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
import {renderPage} from '../server/page-document.mjs';
const base=process.env.BASE_URL||'http://127.0.0.1:4310',out=process.env.IDENTITY_OUTPUT||'reports/identity-controls/blocks';await mkdir(out,{recursive:true});const results=[];
const hash=n=>'0x'+n.toString(16).padStart(64,'0'),address='0x4200000000000000000000000000000000000011';
for(const[engine,launcher]of Object.entries({chromium,firefox,webkit})){
 const browser=await launcher.launch(engine==='chromium'?{args:['--no-sandbox']}:{});
 try{for(const prefix of['','/testnet'])for(const width of[320,1440]){
  const context=await browser.newContext({viewport:{width,height:1000},colorScheme:width===320?'light':'dark'}),page=await context.newPage(),row={engine,prefix,width,passed:false},errors=[];page.on('pageerror',e=>errors.push(e.message));
  let name='SequencerFeeVault',height=100,socket,sequence=0,indexHits=0,reorgHits=0;const indexUrls=[];
  if(process.env.EDGE_PRELOAD==='true')await context.route(url=>url.pathname===prefix+'/blocks',async route=>{
    const response=await route.fetch(),url=new URL(route.request().url());url.pathname='/blocks';
    const page=renderPage(Buffer.from(await response.body()),url,{origin:base,basePath:prefix});
    return route.fulfill({response,status:page.status,body:page.body});
  });
  const chainId=prefix?763373:57073,miner=()=>({hash:address,name:'Proxy',is_contract:true,is_verified:true,proxy_type:'eip1967',implementations:[{name,address_hash:'0x'+'b'.repeat(40)}]});
  const block=(n,h=hash(n),type='block')=>({height:n,hash:h,parent_hash:hash(n-1),type,timestamp:new Date().toISOString(),transactions_count:0,size:1234,gas_limit:'1000000',gas_used:'21000',miner:miner()});
  const forks=()=>[block(80,hash(8080),'reorg'),block(80,hash(8081),'reorg')];
  const frame=()=>({type:'snapshot',protocol:'ink-observer.live.v1',sequence:++sequence,sentAt:new Date().toISOString(),network:{chainId,expectedChainId:chainId,head:height,online:true,synced:true,stale:false,safeBlock:95,finalizedBlock:90},block:{...block(height),miner:address,_live:true},blocks:[{...block(height),miner:address,_live:true},{...block(100),miner:address,_live:true}],transactions:[]});
  await context.route('**/api/live/config',r=>r.fulfill({json:{url:base.replace(/^http/,'ws')+prefix+'/api/live'}}));await context.route('**/api/live/snapshot',r=>r.fulfill({json:frame()}));await context.routeWebSocket(/\/api\/live$/,ws=>{socket=ws;ws.send(JSON.stringify(frame()));});
  await context.route(/\/api\/explorer\/blocks(?:\?|$)/,r=>{indexUrls.push(r.request().url());const fork=new URL(r.request().url()).searchParams.get('type')==='reorg';if(fork)reorgHits++;else indexHits++;return r.fulfill({json:{items:fork?forks():[block(100),block(99)],next_page_params:null}});});
  await context.route(/\/api\/explorer\/blocks\/0x[\da-f]{64}(?:\/transactions)?$/,r=>r.fulfill({json:r.request().url().endsWith('/transactions')?{items:[],next_page_params:null}:forks().find(b=>r.request().url().endsWith(b.hash))}));
  try{
   await page.clock.install();await page.goto(base+prefix+'/blocks?lang=fr',{waitUntil:'domcontentloaded'});await page.locator('.block-beneficiary a').first().waitFor();await page.locator('[data-live-transport="websocket"]').waitFor({state:'attached'});
   height=101;socket.send(JSON.stringify(frame()));await page.locator('.block-height a[href*="/block/101"]').waitFor();
   assert.equal(await page.locator('.block-beneficiary a').first().innerText(),name);assert.equal(await page.locator('.block-beneficiary [data-contract-kind="verified-proxy"]').count(),3);
   assert.deepEqual([...new Set(indexUrls)],[base+prefix+'/api/explorer/blocks']);const beforeRefresh=indexHits;
   name='UpdatedFeeVault';await page.clock.fastForward(31000);await page.waitForFunction(()=>document.querySelector('.block-beneficiary a')?.textContent==='UpdatedFeeVault');assert(indexHits>beforeRefresh);
   await page.locator('.ledger-filters select').selectOption('reorg');await page.locator('.forked-block-hash').nth(1).waitFor();assert.equal(await page.locator('.block-row').count(),2);
   const hashBounds=await page.locator('.forked-block-hash .copyable').evaluateAll(es=>es.map(el=>{const b=el.getBoundingClientRect(),cell=el.closest('.block-height').getBoundingClientRect();return b.left>=cell.left-1&&b.right<=cell.right+1;}));assert(hashBounds.every(Boolean),'Fork hash copy area escapes its column');
   for(const b of forks())assert.equal(await page.locator(`.block-height a[href*="/block/${b.hash}"]`).count(),1);
   const geometry=await page.locator('.ledger-filters').evaluate(el=>{const select=el.querySelector('select').getBoundingClientRect(),help=el.querySelector('.block-kind-help').getBoundingClientRect();return {aligned:Math.abs((select.top+select.height/2)-(help.top+help.height/2))<2,inside:help.right<=innerWidth&&select.left>=0};});assert(geometry.aligned&&geometry.inside);
   name='ForkRefreshVault';await page.clock.fastForward(31000);await page.waitForFunction(()=>document.querySelector('.block-beneficiary a')?.textContent==='ForkRefreshVault');assert(reorgHits>=2);assert.equal(await page.locator('.block-row').count(),2);
   await page.locator('.block-height a').first().focus();height=102;socket.send(JSON.stringify(frame()));await page.waitForTimeout(100);assert.equal(await page.locator('.new-rows-button').count(),0);
   await page.screenshot({path:`${out}/${engine}-${prefix?'sepolia':'mainnet'}-${width}-forks.png`});
   await page.locator(`.block-height a[href*="/block/${hash(8080)}"]`).click();await page.waitForURL(u=>u.pathname===prefix+'/block/'+hash(8080));await page.locator('.status.forked').waitFor();
   assert.equal(await page.locator('.status.forked').textContent(),'Bloc réorganisé');assert.equal(await page.locator('.detail-header .status.ok').count(),0);await page.locator('.forked-block-state button').click();await page.locator('.info-floating').waitFor();assert.match(await page.locator('.info-floating').innerText(),/branche canonique/);
   assert.equal(await page.locator(`.definitions a[href*="/block/${hash(79)}"]`).count(),1);await page.keyboard.press('Escape');assert.equal(await page.locator('.info-floating').count(),0);assert(!await page.locator('.definitions').innerText().then(t=>t.includes('Frais d’exécution uniquement')));await page.locator('.definition-label-with-info button').click();await page.locator('.info-floating').waitFor();assert.match(await page.locator('.info-floating').innerText(),/frais de données L1/i);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);await page.screenshot({path:`${out}/${engine}-${prefix?'sepolia':'mainnet'}-${width}-detail.png`});
   const canonicalBeforeReload=indexHits;await page.goto(base+prefix+'/blocks?type=reorg&lang=fr',{waitUntil:'domcontentloaded'});await page.locator('.forked-block-hash').nth(1).waitFor();assert.equal(indexHits,canonicalBeforeReload,'The forked ledger must not preload canonical blocks');
   Object.assign(row,{passed:true,indexHits,reorgHits,indexUrls,edgePreload:process.env.EDGE_PRELOAD==='true',checks:['initial query consumes the matching preload','first refresh requests fresh data','forked initial page does not preload canonical records','new node blocks retain indexed beneficiary identity and verified-proxy icon','fresh index name updates the live rows','forks at equal height survive refresh','fork links target distinct hashes','canonical head notifications do not appear in fork view','fork detail never claims finality','mobile layout and explanatory disclosure']});
  }catch(e){row.error=e.stack;await page.screenshot({path:`${out}/failure-${engine}-${prefix?'sepolia':'mainnet'}-${width}.png`}).catch(()=>{});}finally{await context.close();}
  results.push(row);console.log(JSON.stringify(row));await writeFile(out+'/results.json',JSON.stringify({base,complete:false,results},null,2));
 }}finally{await browser.close();}
}
await writeFile(out+'/results.json',JSON.stringify({base,complete:true,passed:results.every(r=>r.passed),physicalDeviceTest:false,results},null,2));if(results.some(r=>!r.passed))process.exitCode=1;
