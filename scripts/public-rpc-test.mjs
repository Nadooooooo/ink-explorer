import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {createPublicRpc,validatePublicRpc,apiDiscovery} from '../server/public-rpc.mjs';
import {publicRpcMethods} from '../src/rpc-policy.ts';
const addr='0x'+'1'.repeat(40),hash='0x'+'a'.repeat(64),clock=Date.now();
const head={number:'0x10000',timestamp:'0x'+Math.floor(clock/1000).toString(16)};
const request=(method='eth_chainId',id=1,params=[])=>({jsonrpc:'2.0',id,method,params});
async function fixture(options={}){
 const calls=[];let chain='0xdef1',sync=false,block=head;
 const fetcher=async(url,init)=>{const j=JSON.parse(init.body);calls.push(j);const value=options.reply?await options.reply(j,init):undefined;if(value instanceof Response)return value;return Response.json({jsonrpc:'2.0',id:1,result:value??({eth_chainId:chain,eth_syncing:sync,eth_getBlockByNumber:block,eth_getBalance:'0x123',eth_blockNumber:block.number}[j.method]??'0x0')});};
 const handler=createPublicRpc({localUrl:'http://private-node.invalid',chainId:57073,origin:'https://inkexplorer.xyz',fetcher,now:()=>clock,...options});
 const server=http.createServer((req,res)=>handler(req,res));server.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
 return {base,calls,server,setChain:v=>{chain=v;},setSync:v=>{sync=v;},setHead:v=>{block=v;},async post(body,headers={}){const r=await fetch(base,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});return {status:r.status,headers:r.headers,body:r.status===204?null:await r.json()};},async close(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}
async function using(options,fn){const f=await fixture(options);try{await fn(f);}finally{await f.close();}}
test('standard ids, results and same-network readiness; public URLs contain no node address',()=>using({},async f=>{
 for(const id of [0,12,'client-7',null])assert.deepEqual((await f.post(request('eth_chainId',id))).body,{jsonrpc:'2.0',id,result:'0xdef1'});
 assert.equal(f.calls.filter(x=>x.method==='eth_syncing').length,1);
 const r=await fetch(f.base),j=await r.json();assert.equal(j.url,'https://inkexplorer.xyz/api/rpc');assert.deepEqual(j.methods,[...publicRpcMethods]);assert.equal(JSON.stringify(j).includes('private-node'),false);assert.match(r.headers.get('x-robots-tag'),/noindex/);
 assert.equal(apiDiscovery('https://inkexplorer.xyz','/testnet').rpc,'https://inkexplorer.xyz/testnet/api/rpc');
}));
test('read calls and SDK methods return exact envelopes',()=>using({},async f=>{
 assert.equal((await f.post(request('eth_getBalance','balance',[addr,'latest']))).body.result,'0x123');
 assert.equal((await f.post(request('net_version',1))).body.result,'57073');
 assert.equal((await f.post(request('web3_clientVersion',1))).body.result,'InkExplorer/1.0.0');
}));
test('batch responses match ids and omit notifications; notification-only HTTP body is empty',()=>using({},async f=>{
 const j=[request('eth_chainId','first'),{jsonrpc:'2.0',method:'eth_blockNumber',params:[]},request('eth_getBalance',2,[addr,'latest']),null];const r=await f.post(j);
 assert.deepEqual(r.body.map(v=>v.id),['first',2,null]);assert.equal(r.body[3],undefined);assert.equal(r.body[2].error.code,-32600);
 const n=await f.post([{jsonrpc:'2.0',method:'eth_chainId'},{jsonrpc:'2.0',method:'admin_peers'}]);assert.equal(n.status,204);assert.equal(n.body,null);
}));
test('invalid JSON, invalid requests, invalid params and unsupported methods have JSON-RPC errors',()=>using({},async f=>{
 const r=await fetch(f.base,{method:'POST',headers:{'content-type':'application/json'},body:'{' });assert.equal((await r.json()).error.code,-32700);
 for(const body of [null,1,{},[],{...request(),id:{}},{...request(),jsonrpc:'1.0'}])assert.equal((await f.post(body)).body.error.code,-32600);
 assert.equal((await f.post({...request(),params:null})).body.error.code,-32602);
 for(const method of ['eth_sendRawTransaction','eth_sendTransaction','personal_unlockAccount','admin_peers','debug_traceTransaction','engine_newPayloadV3','txpool_content'])assert.equal((await f.post(request(method,'blocked'))).body.error.code,-32601);
 assert.equal(f.calls.some(c=>c.method.startsWith('admin_')||c.method==='eth_sendRawTransaction'),false);
}));
test('wrong-network, syncing and stale nodes are refused before forwarding the requested call',async()=>{
 for(const setup of [f=>f.setChain('0xba5ed'),f=>f.setSync({currentBlock:'0x1'}),f=>f.setHead({...head,timestamp:'0x1'})])await using({},async f=>{setup(f);const r=await f.post(request('eth_getBalance','unavailable',[addr,'latest']));assert.equal(r.body.id,'unavailable');assert.equal(r.body.error.code,-32002);assert(!f.calls.some(c=>c.method==='eth_getBalance'));});
});
test('execution reverts preserve error code and data with the original client id',()=>using({reply:j=>j.method==='eth_call'?Response.json({jsonrpc:'2.0',id:1,error:{code:3,message:'execution reverted',data:'0x1234'}}):undefined},async f=>{
 const r=await f.post(request('eth_call','revert',[{to:addr,data:'0x'},'latest']));assert.deepEqual(r.body,{jsonrpc:'2.0',id:'revert',error:{code:3,message:'execution reverted',data:'0x1234'}});
}));
test('bounded logs pin tags and reject excessive ranges before getLogs reaches the node',()=>using({},async f=>{
 let r=await f.post(request('eth_getLogs',1,[{fromBlock:'0x1',toBlock:'latest'}]));assert.equal(r.body.error.code,-32602);assert(!f.calls.some(c=>c.method==='eth_getLogs'));
 r=await f.post(request('eth_getLogs',2,[{address:addr,fromBlock:'latest',toBlock:'latest',topics:[hash]}]));assert.equal(r.body.id,2);const c=f.calls.find(c=>c.method==='eth_getLogs');assert.equal(c.params[0].fromBlock,head.number);assert.equal(c.params[0].toBlock,head.number);
}));
test('validators cover every advertised method and do not mutate caller transactions',()=>{
 const tx={to:addr,data:'0x'};assert.equal(validatePublicRpc('eth_call',[tx,'latest'])[0].gas,'0xe4e1c0');assert.equal(tx.gas,undefined);
 const examples={eth_getBalance:[addr,'latest'],eth_getCode:[addr,{blockHash:hash,requireCanonical:true}],eth_getTransactionCount:[addr,'0x0'],eth_getStorageAt:[addr,'0x0','latest'],eth_getBlockByNumber:['latest',false],eth_getBlockByHash:[hash,true],eth_getBlockTransactionCountByNumber:['latest'],eth_getBlockTransactionCountByHash:[hash],eth_getTransactionByHash:[hash],eth_getTransactionReceipt:[hash],eth_getTransactionByBlockHashAndIndex:[hash,'0x0'],eth_getTransactionByBlockNumberAndIndex:['latest','0x0'],eth_call:[tx,'latest'],eth_estimateGas:[tx],eth_feeHistory:['0xa','latest',[0,50,100]],eth_getLogs:[{blockHash:hash,address:[addr],topics:[null,[hash]]}]};
 for(const method of publicRpcMethods)assert.doesNotThrow(()=>validatePublicRpc(method,examples[method]??[]),method);
 for(const [m,p]of [['eth_getBalance',[{},'latest']],['eth_getBalance',[addr,'0x01']],['eth_call',[{to:addr,gas:'0xffffff'},'latest']],['eth_call',[{to:addr,unknown:1},'latest']],['eth_call',[{to:addr,data:'0x0'},'latest']],['eth_feeHistory',['0x401','latest',[]]],['eth_feeHistory',['0xa','latest',[80,10]]],['eth_getLogs',[{blockHash:hash,fromBlock:'latest'}]],['eth_getLogs',[{topics:[hash,hash,hash,hash,hash]}]]])assert.throws(()=>validatePublicRpc(m,p),e=>e.code===-32602,JSON.stringify([m,p]));
});
test('public CORS preflight, discovery, HEAD, methods and content type',()=>using({},async f=>{
 const r=await fetch(f.base,{method:'OPTIONS',headers:{origin:'https://dapp.example','access-control-request-method':'POST','access-control-request-headers':'content-type'}});assert.equal(r.status,204);assert.equal(r.headers.get('access-control-allow-origin'),'*');assert.match(r.headers.get('access-control-allow-methods'),/POST/);
 const h=await fetch(f.base,{method:'HEAD'});assert.equal(h.status,200);assert.equal(await h.text(),'');assert(Number(h.headers.get('content-length'))>0);
 assert.equal((await fetch(f.base,{method:'DELETE'})).status,405);
 assert.equal((await fetch(f.base,{method:'POST',body:'{}'})).status,415);
 assert.equal((await f.post(request(),{origin:'https://dapp.example'})).headers.get('access-control-allow-origin'),'*');
}));
test('batch and body bounds reject work before any upstream call',()=>using({policy:{batch:2,bodyBytes:500}},async f=>{
 assert.equal((await f.post([request(),request(),request()])).body.error.code,-32600);
 assert.equal((await f.post({padding:'x'.repeat(600)})).status,413);assert.equal(f.calls.length,0);
}));
test('per-IP budget counts methods, ignores untrusted forwarded identity and releases concurrency',()=>using({policy:{methodsPerMinute:2}},async f=>{
 assert.equal((await f.post([request(),request()],{'cf-connecting-ip':'1.1.1.1'})).status,200);
 const r=await f.post(request(),{'cf-connecting-ip':'2.2.2.2'});assert.equal(r.status,429);assert(Number(r.headers.get('retry-after'))>0);
}));
test('a trusted loopback proxy can supply distinct validated client IPs',()=>using({trustProxy:true,policy:{methodsPerMinute:1}},async f=>{
 assert.equal((await f.post(request(),{'cf-connecting-ip':'1.1.1.1'})).status,200);assert.equal((await f.post(request(),{'cf-connecting-ip':'2.2.2.2'})).status,200);
}));
test('oversized upstream streams are canceled and invalid response IDs are rejected',async()=>{
 for(const reply of [j=>j.method==='eth_getBalance'?new Response('x'.repeat(1100)):undefined,j=>j.method==='eth_getBalance'?Response.json({jsonrpc:'2.0',id:7,result:'0x1'}):undefined])await using({policy:{responseBytes:1024},reply},async f=>{const r=await f.post(request('eth_getBalance','size',[addr,'latest']));assert.equal(r.body.id,'size');assert([-32005,-32002].includes(r.body.error.code));});
});
test('an incomplete request body times out without retaining the server concurrency slot',()=>using({policy:{timeoutMs:40,concurrentRequests:1}},async f=>{
 const result=await new Promise((resolve,reject)=>{const req=http.request(f.base,{method:'POST',headers:{'content-type':'application/json','content-length':'100'}},res=>{const chunks=[];res.on('data',x=>chunks.push(x));res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(Buffer.concat(chunks))}));});req.on('error',reject);req.write('{');});assert.equal(result.status,503);assert.equal(result.body.error.code,-32002);assert.equal((await f.post(request())).status,200);
}));
test('global method budget covers distinct client IPs',()=>using({trustProxy:true,policy:{globalMethodsPerMinute:2}},async f=>{
 assert.equal((await f.post(request(),{'cf-connecting-ip':'1.1.1.1'})).status,200);assert.equal((await f.post(request(),{'cf-connecting-ip':'2.2.2.2'})).status,200);assert.equal((await f.post(request(),{'cf-connecting-ip':'3.3.3.3'})).status,429);
}));
test('concurrency backpressure releases the slot after the held node call completes',async()=>{
 let release,started;const held=new Promise(r=>{release=r;}),entered=new Promise(r=>{started=r;});
 await using({policy:{concurrentRequests:1},reply:async j=>{if(j.method==='eth_getBalance'){started();await held;return '0x1';}}},async f=>{
  const first=f.post(request('eth_getBalance',1,[addr,'latest']));await entered;assert.equal((await f.post(request())).status,429);release();assert.equal((await first).body.result,'0x1');assert.equal((await f.post(request())).status,200);
 });
});
test('a combined batch response is bounded while preserving all response IDs',()=>using({policy:{responseBytes:600},reply:j=>j.method==='eth_getBalance'?'x'.repeat(350):undefined},async f=>{
 const r=await f.post([request('eth_getBalance','a',[addr,'latest']),request('eth_getBalance','b',[addr,'latest'])]);assert.deepEqual(r.body.map(x=>x.id),['a','b']);assert(r.body.every(x=>x.error.code===-32005));assert(Buffer.byteLength(JSON.stringify(r.body))<600);
}));
test('readiness expiry rechecks the chain and an unavailable observation can recover',async()=>{
 let current=clock;await using({now:()=>current},async f=>{assert.equal((await f.post(request())).body.result,'0xdef1');f.setChain('0xba5ed');current+=5001;const r=await f.post(request('eth_getBalance',2,[addr,'latest']));assert.equal(r.body.error.code,-32002);assert(!f.calls.some(x=>x.method==='eth_getBalance'));f.setChain('0xdef1');assert.equal((await f.post(request('eth_getBalance',3,[addr,'latest']))).body.result,'0x123');});
});
test('rate-limited notifications do not receive a JSON-RPC response body',()=>using({policy:{methodsPerMinute:1}},async f=>{
 const notification={jsonrpc:'2.0',method:'eth_chainId'};assert.equal((await f.post(notification)).status,204);const r=await fetch(f.base,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(notification)});assert.equal(r.status,429);assert.equal(await r.text(),'');
}));
