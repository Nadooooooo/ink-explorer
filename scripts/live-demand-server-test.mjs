import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,cp,mkdir,symlink,rm,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {WebSocket} from 'ws';
const out=process.env.LIVE_DEMAND_OUTPUT||'reports/token-filter/live-demand';await mkdir(out,{recursive:true});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(fn,timeout=15000)=>{const end=Date.now()+timeout;while(Date.now()<end){if(await fn())return;await wait(100);}assert.fail('Condition timed out');};
const results=await Promise.all(['mainnet','sepolia'].map(async network=>{
 const temp=await mkdtemp(join(tmpdir(),'ink-live-demand-'));let reads=0,child,socket,log='';
 const upstream=createServer((req,res)=>{res.writeHead(200,{'content-type':'application/json'});if(req.url.startsWith('/addresses/')){reads++;res.end(JSON.stringify({hash:req.url.split('/').at(-1),name:'Local fixture contract',is_contract:true,is_verified:true}));}else res.end('{}');});
 await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
 try{
  await cp('server',join(temp,'server'),{recursive:true});await mkdir(join(temp,'src'));await mkdir(join(temp,'dist'));await cp('src',join(temp,'src'),{recursive:true});await cp('package.json',join(temp,'package.json'));await symlink(resolve('node_modules'),join(temp,'node_modules'));
  const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));const base='http://127.0.0.1:'+port,api='http://127.0.0.1:'+upstream.address().port;
  child=spawn(process.execPath,['--experimental-strip-types','server/server.mjs'],{cwd:temp,env:{...process.env,PORT:String(port),HOST:'127.0.0.1',INK_NETWORK:network,BLOCKSCOUT_API:api,BLOCKSCOUT_STATS_API:api},stdio:['ignore','pipe','pipe']});child.stdout.on('data',d=>log+=d);child.stderr.on('data',d=>log+=d);
  const status=async()=>{try{return await(await fetch(base+'/api/live/status')).json();}catch{return {};}};
  await until(async()=>Number((await status()).head)>0);const initial=(await status()).head;await wait(2200);assert.equal(reads,0,'No visitor: no optional indexer address calls');assert((await status()).head>initial,'Canonical local feed still advances while idle');
  const snapshot=await(await fetch(base+'/api/live/snapshot')).json();assert.equal(snapshot.network.chainId,network==='mainnet'?57073:763373);await until(()=>reads>0);await wait(31000);await wait(1200);const after=reads;await wait(2200);assert.equal(reads,after,'Snapshot demand expires and queued lookups stop');
  const frames=[];socket=new WebSocket(base.replace('http','ws')+'/api/live');socket.on('message',data=>frames.push(JSON.parse(data)));await until(()=>frames.some(x=>x.network?.chainId===(network==='mainnet'?57073:763373)));
  const before=(await status()).head;await until(async()=>Number((await status()).head)>before);await until(()=>frames.length>1);
  assert(frames.some(x=>x.transactions?.some(tx=>tx.to?.name==='Local fixture contract')),'Cached metadata survives idle period and is present in live frames');
  socket.close();await new Promise(r=>socket.once('close',r));socket=undefined;await wait(1500);const closed=reads;await wait(2200);assert.equal(reads,closed,'Disconnected visitor does not keep enrichment running');
  const row={network,passed:true,idleIndexReads:0,canonicalFeedAdvanced:true,snapshotDemandExpires:true,websocketFeedAndNamesVerified:true,finalReads:reads};console.log(JSON.stringify(row));return row;
 }finally{socket?.terminate();if(child&&child.exitCode===null){child.kill('SIGTERM');await new Promise(r=>child.once('close',r));}upstream.closeAllConnections();await new Promise(r=>upstream.close(r));await writeFile(out+'/'+network+'-server.log',log);await rm(temp,{recursive:true,force:true});}
}));
await writeFile(out+'/results.json',JSON.stringify({passed:true,realLocalNodes:true,upstreamAddressFixture:true,results},null,2));
