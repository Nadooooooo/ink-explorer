import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,firefox,webkit} from 'playwright';
const base=process.env.BASE_URL||'https://inkexplorer.xyz',out=process.env.TX_FOLLOW_LIVE_OUTPUT||'reports/transaction-follow/real';await mkdir(out,{recursive:true});
const headers=process.env.INK_RELEASE_VERSION?{'Cloudflare-Workers-Version-Overrides':`inkexplorer="${process.env.INK_RELEASE_VERSION}"`}:{},results=[];
async function rpc(port,method,params){const r=await fetch('http://127.0.0.1:'+port,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:1,jsonrpc:'2.0',method,params}),signal:AbortSignal.timeout(10000)});assert.equal(r.status,200);const data=await r.json();assert(!data.error);return data.result;}
for(const[engine,launcher]of Object.entries({chromium,firefox,webkit})){
 const browser=await launcher.launch(engine==='chromium'?{args:['--no-sandbox']}:{});
 try{for(const[prefix,chainId,port,width]of[['',57073,8545,320],['/testnet',763373,8645,1440]]){
  const head=Number(BigInt(await rpc(port,'eth_blockNumber',[]))),height=head-1600,block=await rpc(port,'eth_getBlockByNumber',['0x'+height.toString(16),false]),hash=block.transactions[0],receipt=await rpc(port,'eth_getTransactionReceipt',[hash]);assert.equal(receipt.blockHash,block.hash);
  const c=await browser.newContext({viewport:{width,height:1000},extraHTTPHeaders:headers}),p=await c.newPage(),errors=[],frames=[],row={engine,chainId,width,hash,height};let documents=0,indexReads=0;p.setDefaultTimeout(20000);
  p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(r.isNavigationRequest()&&r.frame()===p.mainFrame())documents++;if(new URL(r.url()).pathname===prefix+'/api/explorer/transactions/'+hash)indexReads++;});p.on('websocket',s=>s.on('framereceived',event=>{try{const value=JSON.parse(event.payload);if(value.network?.chainId===chainId)frames.push({transport:'websocket',head:value.network.head,sampledAt:value.network.sampledAt,at:Date.now()});}catch{}}));
  p.on('response',async response=>{if(new URL(response.url()).pathname!==prefix+'/api/live/snapshot'||response.status()!==200)return;try{const value=await response.json();if(value.network?.chainId===chainId)frames.push({transport:'snapshot',head:value.network.head,sampledAt:value.network.sampledAt,at:Date.now()});}catch{}});
  try{
   const response=await p.goto(base+prefix+'/tx/'+hash+'?lang=en');row.version=response.headers()['x-ink-version'];row.initialStatus=response.status();assert([200,503].includes(row.initialStatus));if(process.env.EXPECTED_VERSION)assert.equal(row.version,process.env.EXPECTED_VERSION);
   await p.locator('.transaction-definitions').waitFor();await p.waitForFunction(()=>/^[\d,]+ confirmations$/.test(document.querySelector('[data-transaction-confirmations]')?.textContent||''));
   const count=async()=>Number((await p.locator('[data-transaction-confirmations]').innerText()).replace(/\D/g,''));row.first=await count();
   await p.waitForFunction(n=>Number(document.querySelector('[data-transaction-confirmations]')?.textContent.replace(/\D/g,''))>n,row.first);for(let attempt=0;attempt<40 && (frames.length<2 || !frames.some(f=>f.transport==='websocket'));attempt++)await p.waitForTimeout(100);row.last=await count();assert(row.last>row.first);
   const actualHead=Number(BigInt(await rpc(port,'eth_blockNumber',[])));assert(row.last<=actualHead-height);assert(actualHead-height-row.last<15);assert(frames.length>=2,'Two actual network observations are required');assert(frames.some(f=>f.transport==='websocket'),'A real WebSocket frame is required');assert(frames.some(f=>f.head-height===row.last));
   assert.equal((await p.locator('.transaction-detail-header .status').textContent()).trim(),receipt.status==='0x1'?'Success':'Failed');assert.equal(documents,1);assert.deepEqual(errors,[]);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   Object.assign(row,{passed:true,indexReads,documents,rpcHead:actualHead,frames});await p.screenshot({path:`${out}/${engine}-${chainId}.png`});
  }catch(e){Object.assign(row,{passed:false,error:e.stack,errors,indexReads,documents,frames});await p.screenshot({path:`${out}/${engine}-${chainId}-failure.png`}).catch(()=>{});}finally{await c.close();}
  results.push(row);console.log(JSON.stringify(row));await writeFile(out+'/results.json',JSON.stringify({base,apiMocked:false,documentMocked:false,rpcCompared:true,complete:false,results},null,2));
 }}finally{await browser.close();}
}
await writeFile(out+'/results.json',JSON.stringify({base,apiMocked:false,documentMocked:false,rpcCompared:true,physicalDevices:false,complete:true,passed:results.every(r=>r.passed),results},null,2));if(results.some(r=>!r.passed))process.exitCode=1;
