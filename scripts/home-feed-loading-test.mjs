import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright-core';
import {WebSocketServer} from 'ws';
import {mkdir,writeFile} from 'node:fs/promises';

const base=process.env.BASE_URL||'http://127.0.0.1:4311',out=process.env.HOME_LAYOUT_OUTPUT||'reports/home-layout/loading';
const baseline=process.env.HOME_LAYOUT_BASELINE==='1',locale=process.env.HOME_LAYOUT_LOCALE||'fr',results=[];
const hash=n=>'0x'+n.toString(16).padStart(64,'0'),address=n=>'0x'+n.toString(16).padStart(40,'0');
await mkdir(out,{recursive:true});
for(const engine of(process.env.HOME_LAYOUT_ENGINES||'chromium,firefox,webkit').split(',')){
 const browser=await({chromium,firefox,webkit})[engine].launch(engine==='chromium'?{args:['--no-sandbox']}:{});
 try{for(const prefix of['','/testnet'])for(const width of(process.env.HOME_LAYOUT_WIDTHS||'320,768,1440').split(',').map(Number))for(const mode of['success','error']){
  const context=await browser.newContext({viewport:{width,height:1000},hasTouch:true,bypassCSP:true,colorScheme:width===768?'dark':'light'}),page=await context.newPage(),server=new WebSocketServer({host:'127.0.0.1',port:0}),chainId=prefix?763373:57073;
  await new Promise(resolve=>server.once('listening',resolve));let populated=false,sequence=0,overviewMode='held',release;
  const gate=new Promise(resolve=>release=resolve);
  const block=n=>({height:n,hash:hash(n+1000),miner:{hash:address(1)},timestamp:new Date().toISOString(),transactions_count:1,gas_used:'10',gas_limit:'100',size:100,transaction_hashes:[hash(n)]});
  const tx=n=>({hash:hash(n),block_number:n,block_hash:hash(n+1000),timestamp:new Date().toISOString(),status:'ok',from:{hash:address(1)},to:{hash:address(2)},value:'0',fee:{value:'0'},method:'transfer',transaction_types:['coin_transfer']});
  const frame=()=>({type:'snapshot',protocol:'ink-observer.live.v1',sequence:sequence++,sentAt:new Date().toISOString(),network:{chainId,expectedChainId:chainId,head:100,online:true,synced:true,stale:false},block:populated?block(100):null,blocks:populated?[block(100)]:[],transactions:populated?[tx(100)]:[],utilization:{percentage:10}});
  server.on('connection',socket=>socket.send(JSON.stringify(frame())));
  await page.route('**/api/live/config',r=>r.fulfill({json:{url:`ws://127.0.0.1:${server.address().port}${prefix}/api/live`}}));
  await page.route('**/api/live/snapshot',r=>r.fulfill({json:frame()}));
  await page.route('**/api/stats/counters',r=>r.fulfill({headers:{date:new Date().toUTCString(),'x-ink-data-status':'fresh','x-ink-data-fetched-at':new Date().toISOString()},json:{counters:[{id:'newTxns24h',title:'Transactions',description:'Last 24 hours',value:'150'},{id:'totalAddresses',title:'Addresses',description:'Total addresses',value:'200'}]}}));
  await page.route('**/api/overview',async r=>{
   if(overviewMode==='held')await gate;
   if(overviewMode==='error')return r.fulfill({status:503,json:{error:'Data source unavailable'}}).catch(()=>{});
   return r.fulfill({json:{stats:{total_addresses:'200'},blocks:Array.from({length:6},(_,i)=>block(100-i)),transactions:Array.from({length:6},(_,i)=>tx(100-i)),chart:[{date:'2026-10-16',transactions_count:20},{date:'2026-10-17',transactions_count:22}]}}).catch(()=>{});
  });
  await page.addInitScript(()=>{
   window.feedClicks=[];
   document.addEventListener('click',event=>{const link=event.target.closest?.('.live-columns .tx-primary a');if(link){window.feedClicks.push(link.getAttribute('href'));event.preventDefault();}},true);
  });
  const row={engine,prefix,width,mode,locale,baseline,nativeTouch:engine==='chromium',passed:false};
  try{
   await page.goto(base+prefix+'/?lang='+locale,{waitUntil:'domcontentloaded'});
   await page.locator('.home-chart-slot .loading').waitFor();await page.locator('.home-feed-state').nth(1).waitFor();
   await page.waitForFunction(()=>document.querySelector('.home-overview .metric:nth-child(2)>strong')?.textContent!=='N/A');
   await page.evaluate(()=>document.fonts.ready);
   const blocksPanel=page.locator('.home-activity-panel').first(),txPanel=page.locator('.home-activity-panel').last();
   const documentTop=locator=>locator.evaluate(el=>el.getBoundingClientRect().top+scrollY);
   const emptyTop=await documentTop(txPanel);
   if(!baseline&&process.env.HOME_LAYOUT_A11Y_LOADING==='1'){
    assert.equal(await page.locator('.home-block-placeholder').count(),6);
    assert.equal(await page.locator('.home-block-placeholder :is(a,button,input)').count(),0);
    row.loadingAnnouncement=await blocksPanel.locator('.home-feed-state').ariaSnapshot();assert(row.loadingAnnouncement.includes('status'));
    await page.addScriptTag({path:'node_modules/axe-core/axe.min.js'});
    row.loadingViolations=await page.evaluate(async()=>(await axe.run('.home-block-feed',{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})));assert.deepEqual(row.loadingViolations,[]);
   }
   if(process.env.HOME_LAYOUT_CAPTURE==='1')await blocksPanel.screenshot({path:`${out}/${engine}-${prefix?'sepolia':'mainnet'}-${width}-${mode}-${locale}-empty.png`});
   populated=true;for(const socket of server.clients)socket.send(JSON.stringify(frame()));
   const link=page.locator('.compact-tx-row .tx-primary .text-link').first();await link.waitFor();
   await page.locator('.compact-block-row').waitFor({state:'attached'});const firstTop=await documentTop(txPanel);row.emptyToFirstShift=firstTop-emptyTop;
   if(!baseline)assert(Math.abs(row.emptyToFirstShift)<=1,'The first block shifted the transaction panel');
   if(process.env.HOME_LAYOUT_CAPTURE==='1')await blocksPanel.screenshot({path:`${out}/${engine}-${prefix?'sepolia':'mainnet'}-${width}-${mode}-${locale}-partial.png`});
   await link.scrollIntoViewIfNeeded();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const before=await link.boundingBox(),beforeTop=await documentTop(link);let cdp;
   if(engine==='chromium'){cdp=await context.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:before.x+before.width/2,y:before.y+before.height/2}]});}
   else await link.dispatchEvent('pointerdown',{pointerType:'touch',pointerId:1,isPrimary:true,bubbles:true});
   overviewMode=mode;release();
   if(mode==='error')await page.locator('.home-chart-slot button').waitFor();else await page.locator('.interactive-chart[data-points="2"]').waitFor();
   const after=await link.boundingBox();row.responseShift={x:after.x-before.x,y:after.y-before.y,document:await documentTop(link)-beforeTop};
   row.blocksAfterResponse=await blocksPanel.locator('.compact-block-row').count();
   if(!baseline)assert(Math.abs(row.responseShift.x)<=1&&Math.abs(row.responseShift.y)<=1&&Math.abs(row.responseShift.document)<=1,'The overview response moved the pressed transaction');
   if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   else {await link.dispatchEvent('pointerup',{pointerType:'touch',pointerId:1,isPrimary:true,bubbles:true});await link.evaluate(el=>el.click());}
   const expected=prefix+'/tx/'+hash(100)+(locale==='en'?'':'?lang='+locale);
   if(!baseline){await page.waitForFunction(()=>window.feedClicks.length>0);assert.equal(await page.evaluate(()=>window.feedClicks.at(-1)),expected);}
   row.destination=await page.evaluate(()=>window.feedClicks.at(-1));
   if(mode==='error'){
    overviewMode='success';await page.locator('.home-chart-slot button').click();await page.locator('.interactive-chart[data-points="2"]').waitFor();
    row.retryPanelShift=await documentTop(txPanel)-firstTop;if(!baseline)assert(Math.abs(row.retryPanelShift)<=1,'Retry shifted the transaction panel');
   }
   const update=txPanel.locator('.home-feed-update button');if(await update.count())await update.click();
   await blocksPanel.locator('.compact-block-row').nth(5).waitFor({state:'attached'});await txPanel.locator('.compact-tx-row').nth(5).waitFor();
   if(!baseline){assert.equal(await page.locator('.home-block-placeholder').count(),0);await page.addScriptTag({path:'node_modules/axe-core/axe.min.js'});row.violations=await page.evaluate(async()=>(await axe.run('.live-columns',{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})));assert.deepEqual(row.violations,[]);}
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   if(await page.locator('#home-tab-blocks').count())await page.locator('#home-tab-blocks').click();
   await blocksPanel.scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/${engine}-${prefix?'sepolia':'mainnet'}-${width}-${mode}-${locale}.png`});row.passed=true;
  }catch(error){row.error=error.stack;await page.screenshot({path:`${out}/failure-${engine}-${prefix?'sepolia':'mainnet'}-${width}-${mode}-${locale}.png`}).catch(()=>{});}
  finally{release();await context.close();for(const socket of server.clients)socket.terminate();await new Promise(resolve=>server.close(resolve));}
  results.push(row);console.log(JSON.stringify(row));await writeFile(out+'/results.json',JSON.stringify({base,baseline,complete:false,results},null,2));
 }}finally{await browser.close();}
}
await writeFile(out+'/results.json',JSON.stringify({base,baseline,complete:true,passed:results.every(r=>r.passed),results},null,2));if(results.some(r=>!r.passed))process.exitCode=1;
