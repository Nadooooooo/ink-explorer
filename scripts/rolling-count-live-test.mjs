import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
import {DatabaseSync} from 'node:sqlite';
import {access,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
const base=process.env.BASE_URL||'http://127.0.0.1:4214',out=process.env.ROLLING_LIVE_OUTPUT||'reports/rolling-metrics/live-local',results=[];
// Frontend releases can move independently of the persistent collectors.
const databaseDirectory=resolve(process.env.INK_ROLLING_DATA_DIR||'data/rolling-metrics');
for(const chainId of [57073,763373])await access(join(databaseDirectory,`${chainId}.sqlite`)).catch(()=>{throw new Error(`Missing read-only rolling database for ${chainId}; set INK_ROLLING_DATA_DIR to the active collector directory (${databaseDirectory})`);});
await mkdir(out,{recursive:true});
for(const engine of [chromium,firefox,webkit]){
 const browser=await engine.launch(engine===chromium?{args:['--no-sandbox']}:{});
 try{for(const [prefix,chainId,width,locale] of [['',57073,390,'fr'],['/testnet',763373,1440,'ar']])for(const path of ['/','/txs','/stats']){
  const c=await browser.newContext({viewport:{width,height:900}}),p=await c.newPage(),frames=[],errors=[];p.on('pageerror',e=>errors.push(e.message));
  p.on('websocket',ws=>ws.on('framereceived',({payload})=>{try{const f=JSON.parse(String(payload));if(f.rolling24h)frames.push(f);}catch{}}));
  const row={engine:engine.name(),prefix,chainId,width,path};
  try{
   await p.goto(base+prefix+path+'?lang='+locale,{waitUntil:'domcontentloaded'});
   await p.waitForFunction(()=>/^\d+$/.test(document.querySelector('[data-counter="newTxns24h"] strong')?.title||''));
   const first=Number(await p.locator('[data-live-head]').getAttribute('data-live-head'));
   await p.waitForFunction(first=>Number(document.querySelector('[data-live-head]')?.getAttribute('data-live-head'))>=first+2,first,{timeout:20000});
   const visible=await p.locator('[data-counter="newTxns24h"] strong').getAttribute('title'),f=frames.findLast(f=>String(f.rolling24h?.transactions)===visible);
   assert(f,'Rendered counter matches an actual WebSocket observation');assert.equal(f.rolling24h.chainId,chainId);assert(Date.now()-Date.parse(f.rolling24h.window.to)<5000);
   const w=f.rolling24h.window,db=new DatabaseSync(join(databaseDirectory,`${chainId}.sqlite`),{readOnly:true});
   const count=db.prepare('SELECT count(*) blocks,sum(transactions) total FROM blocks WHERE height BETWEEN ? AND ?').get(w.fromBlock,w.toBlock);db.close();
   assert.equal(count.blocks,w.blocks);assert.equal(count.total,Number(visible));
   const r=await fetch(`http://127.0.0.1:${prefix?8645:8545}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_getBlockByNumber',params:['0x'+w.toBlock.toString(16),false]})});const rpc=await r.json();assert.equal(rpc.result.hash,w.toBlockHash);
   assert.deepEqual(errors,[]);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   await p.screenshot({path:`${out}/${engine.name()}-${chainId}-${path.slice(1)||'home'}.png`});Object.assign(row,{firstHead:first,count:visible,window:w,sourceMatched:true,passed:true});
  }catch(e){row.passed=false;row.error=e.stack;}finally{await c.close();}
  results.push(row);console.log(JSON.stringify(row));await writeFile(out+'/results.json',JSON.stringify({base,complete:false,results},null,2));
 }}finally{await browser.close();}
}
await writeFile(out+'/results.json',JSON.stringify({base,databaseDirectory,mocked:false,complete:true,passed:results.every(r=>r.passed),results},null,2));if(results.some(r=>!r.passed))process.exitCode=1;
