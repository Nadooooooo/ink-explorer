import assert from 'node:assert/strict';
import {chromium,firefox,webkit}from'playwright-core';
import {mkdir,writeFile}from'node:fs/promises';
const base=process.env.BASE_URL,out=process.env.LEDGER_LIVE_OUTPUT||'reports/ledger-arrival/live';
assert(base?.startsWith('https://'),'An explicit public HTTPS origin is required');await mkdir(out,{recursive:true});const results=[];
for(const[engine,launcher]of Object.entries({chromium,firefox,webkit})){
 const browser=await launcher.launch(engine==='chromium'?{args:['--no-sandbox']}:{});
 try{for(const[prefix,chainId,width]of[['',57073,390],['/testnet',763373,1440]])for(const path of ['/blocks','/txs']){
  const c=await browser.newContext({viewport:{width,height:1000}}),p=await c.newPage(),frames=[],errors=[],assetFailures=[],row={engine,prefix,chainId,width,path};
  p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=400&&['script','stylesheet','font'].includes(r.request().resourceType()))assetFailures.push({url:r.url(),status:r.status()});});
  p.on('websocket',s=>s.on('framereceived',({payload})=>{try{const f=JSON.parse(String(payload));if(f.protocol==='ink-observer.live.v1')frames.push(f);}catch{}}));
  try{
   const response=await p.goto(base+prefix+path+'?lang=en',{waitUntil:'domcontentloaded'});row.version=response.headers()['x-ink-version'];if(process.env.EXPECTED_VERSION)assert.equal(row.version,process.env.EXPECTED_VERSION,'The tested document must be the activated candidate');
   const isBlock=path==='/blocks',link=p.locator(isBlock?'.block-row .block-height a':'.tx-row .tx-primary a').first();await link.waitFor();await p.locator('.table-shell').hover();
   const href=await link.getAttribute('href'),id=href.split(isBlock?'/block/':'/tx/')[1]?.split('?')[0];assert(id);
   const find=()=>frames.flatMap(f=>isBlock?[...(f.blocks||[]),...(f.block?[f.block]:[])]:f.transactions||[]).find(x=>isBlock?String(x.height)===id:x.hash===id);
   for(let i=0;i<40&&!find();i++)await p.waitForTimeout(100);
   const observed=find();assert(observed,'First displayed record must occur in the real stream');assert(Date.now()-Date.parse(observed.timestamp)<30000,'First record must be recent');
   const responseRpc=await fetch(`http://127.0.0.1:${prefix?8645:8545}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:isBlock?'eth_getBlockByNumber':'eth_getTransactionByHash',params:isBlock?['0x'+Number(id).toString(16),false]:[id]})});const rpc=await responseRpc.json();assert.equal(rpc.result.hash,observed.hash);
   if(!isBlock){assert.equal(rpc.result.blockHash,observed.block_hash);assert.equal(Number(BigInt(rpc.result.blockNumber)),Number(observed.block_number));}
   assert(frames.some(f=>f.network?.chainId===chainId&&f.network.synced));assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);assert.deepEqual(assetFailures,[]);
   await p.screenshot({path:`${out}/${engine}-${chainId}-${isBlock?'blocks':'txs'}.png`});Object.assign(row,{href,hash:observed.hash,timestamp:observed.timestamp,receivedFrames:frames.length,passed:true});
  }catch(e){Object.assign(row,{passed:false,error:e.stack,errors,assetFailures});}
  finally{await c.close();}
  results.push(row);console.log(JSON.stringify(row));await writeFile(out+'/results.json',JSON.stringify({base,apiMocked:false,physicalDevices:false,complete:false,results},null,2));
 }}finally{await browser.close();}
}
await writeFile(out+'/results.json',JSON.stringify({base,apiMocked:false,physicalDevices:false,complete:true,passed:results.every(r=>r.passed),results},null,2));if(results.some(r=>!r.passed))process.exitCode=1;
