import assert from 'node:assert/strict';
import{chromium,firefox,webkit}from'playwright';
import{writeFile,mkdir}from'node:fs/promises';
const base=process.env.BASE_URL,out=process.env.LIVE_OUTPUT||'reports/arrival-seo/public-live';
assert(base?.startsWith('https://'),'Explicit public HTTPS URL required');await mkdir(out,{recursive:true});const results=[];
for(const[engine,launcher]of Object.entries({chromium,firefox,webkit})){
 const browser=await launcher.launch(engine==='chromium'?{args:['--no-sandbox']}:{});
 try{for(const[prefix,width,lang]of[['',390,'fr'],['/testnet',1440,'en']]){
  const context=await browser.newContext({viewport:{width,height:900},colorScheme:'light'}),page=await context.newPage(),errors=[],requestsFailed=[],frames=[],connections=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>requestsFailed.push({url:r.url(),error:r.failure()}));
  page.on('response',r=>{if(r.status()>=400)requestsFailed.push({url:r.url(),status:r.status()});});
  page.on('websocket',socket=>{const connection={url:socket.url(),closed:false};connections.push(connection);socket.on('close',()=>connection.closed=true);socket.on('framereceived',({payload})=>{try{const f=JSON.parse(String(payload));if(f.protocol==='ink-observer.live.v1')frames.push(f);}catch{}});});
  try{
   const started=Date.now();await page.goto(base+prefix+'/?lang='+lang,{waitUntil:'domcontentloaded'});
   await page.locator('#ink-startup').waitFor({state:'detached'});
   await page.waitForFunction(()=>Number(document.querySelector('[data-live-head]')?.getAttribute('data-live-head'))>0);
   const readyMs=Date.now()-started,first=Number(await page.locator('[data-live-head]').getAttribute('data-live-head'));
   await page.waitForFunction(first=>Number(document.querySelector('[data-live-head]')?.getAttribute('data-live-head'))>=first+2,first,{timeout:20000});
   const state=await page.evaluate(()=>({head:Number(document.querySelector('[data-live-head]').getAttribute('data-live-head')),transport:document.querySelector('[data-live-head]').getAttribute('data-live-transport'),utilization:document.querySelector('.utilization-readout strong')?.textContent,txHashes:[...document.querySelectorAll('.tx-row a[href*="/tx/"]')].map(a=>a.getAttribute('href').split('/tx/')[1]?.split('?')[0]),overflow:document.documentElement.scrollWidth>innerWidth+1,description:document.querySelector('meta[name=description]').content}));
   assert.equal(state.transport,'websocket');assert.equal(state.overflow,false);assert.deepEqual(errors,[]);assert.deepEqual(requestsFailed,[]);assert(state.txHashes.length>0);
   const frame=frames.findLast(f=>f.block?.height===state.head&&f.utilization);assert(frame,'Rendered head is present in received stream');
   assert.equal(frame.network.chainId,prefix?763373:57073);assert.equal(frame.network.synced,true);assert.equal(frame.network.stale,false);assert(Date.now()-Date.parse(frame.block.timestamp)<10000,'Head must be recent');
   const shown=Number(state.utilization.replace(/[^0-9,.]/g,'').replace(',','.'));assert(Math.abs(shown-frame.utilization.percentage)<0.011);
   const txs=frames.flatMap(f=>f.transactions||[]);assert(state.txHashes.some(hash=>txs.some(tx=>tx.hash===hash)),'Feed displays transactions received through the live stream');
   const rpcOrigin=`http://127.0.0.1:${prefix?8645:8545}`;
   const rpc=await(await fetch(rpcOrigin,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_getBlockByNumber',params:['0x'+state.head.toString(16),false]})})).json();
   assert.equal(rpc.result.hash,frame.block.hash,'Live head matches the local chain');
   const u=frame.utilization,batch=Array.from({length:u.toBlock-u.fromBlock+1},(_,i)=>({jsonrpc:'2.0',id:i,method:'eth_getBlockByNumber',params:['0x'+(u.fromBlock+i).toString(16),false]}));
   const blocks=await(await fetch(rpcOrigin,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(batch)})).json();assert.equal(blocks.length,u.blocks);
   const sum=key=>blocks.reduce((n,b)=>n+BigInt(b.result[key]),0n);
   assert.equal(sum('gasUsed').toString(),u.gasUsed);assert.equal(sum('gasLimit').toString(),u.gasLimit);assert.equal(u.percentage,Number(sum('gasUsed')*100000000n/sum('gasLimit'))/1000000,'The feed reports percent truncated to six decimal places');
   await page.screenshot({path:`${out}/${engine}-${prefix?'sepolia':'mainnet'}.png`});
   results.push({engine,prefix,width,lang,readyMs,firstHead:first,...state,sampleTime:frame.sentAt,blockHash:frame.block.hash,utilizationSource:u,receivedFrames:frames.length,connections:[...connections],passed:true});console.log('PASS',engine,prefix||'mainnet',first,'->',state.head,'gas',state.utilization);
  }catch(error){await writeFile(out+'/failure.json',JSON.stringify({engine,prefix,error:error.stack,errors,requestsFailed,connections},null,2));throw error;}
  finally{await context.close();}
 }}finally{await browser.close();}
}
await writeFile(out+'/results.json',JSON.stringify({base,mocked:false,physicalDeviceTest:false,results},null,2));
