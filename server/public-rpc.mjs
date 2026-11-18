import {isIP} from 'node:net';
import {nodeReadiness} from './node-readiness.mjs';
import {developerEndpoints,publicRpcMethods,publicRpcLimits as limits} from '../src/rpc-policy.ts';

const address=/^0x[\da-f]{40}$/i,hash=/^0x[\da-f]{64}$/i,quantity=/^0x(?:0|[1-9a-f][\da-f]{0,63})$/i,data=/^0x(?:[\da-f]{2})*$/i;
const fault=(code,message,extra)=>Object.assign(new Error(message),{code,rpcError:true,...(extra===undefined?{}:{data:extra})});
const isAddress=v=>typeof v==='string'&&address.test(v),isHash=v=>typeof v==='string'&&hash.test(v);
const invalid=()=>{throw fault(-32602,'Invalid RPC parameters');};
const block=v=>typeof v==='string'&&(['latest','earliest','safe','finalized','pending'].includes(v)||quantity.test(v));
const qty=v=>typeof v==='string'&&quantity.test(v);
const count=(p,min,max=min)=>{if(p.length<min||p.length>max)invalid();};
const isObject=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const validRequest=request=>isObject(request)&&request.jsonrpc==='2.0'&&typeof request.method==='string'&&(!('id'in request)||request.id===null||typeof request.id==='string'||typeof request.id==='number'&&Number.isSafeInteger(request.id));
function blockRef(v){
 if(block(v))return true;
 if(!isObject(v))return false;
 const keys=Object.keys(v);
 return keys.every(k=>['blockHash','blockNumber','requireCanonical'].includes(k))&&
  (isHash(v.blockHash)&&!('blockNumber'in v)&&(v.requireCanonical===undefined||typeof v.requireCanonical==='boolean')||qty(v.blockNumber)&&!('blockHash'in v)&&!('requireCanonical'in v));
}
function transaction(v){
 if(!isObject(v)||Object.keys(v).some(k=>!['to','from','data','input','value','gas','gasPrice','maxFeePerGas','maxPriorityFeePerGas','nonce','type','accessList'].includes(k)))invalid();
 for(const k of ['to','from'])if(v[k]!==undefined&&!isAddress(v[k]))invalid();
 for(const k of ['data','input'])if(v[k]!==undefined&&(typeof v[k]!=='string'||!data.test(v[k])||v[k].length>65536))invalid();
 if(v.data!==undefined&&v.input!==undefined&&v.data!==v.input)invalid();
 if(!v.to&&!v.data&&!v.input)invalid();
 for(const k of ['value','gas','gasPrice','maxFeePerGas','maxPriorityFeePerGas','nonce','type'])if(v[k]!==undefined&&!qty(v[k]))invalid();
 if(v.gas!==undefined&&BigInt(v.gas)>BigInt(limits.gas))throw fault(-32602,`Gas limit exceeds ${limits.gas}`);
 if(v.accessList!==undefined&&(!Array.isArray(v.accessList)||v.accessList.length>64||v.accessList.some(x=>!isObject(x)||Object.keys(x).some(k=>!['address','storageKeys'].includes(k))||!isAddress(x.address)||!Array.isArray(x.storageKeys)||x.storageKeys.length>64||x.storageKeys.some(k=>!isHash(k)))))invalid();
 return {...v,gas:v.gas??'0xe4e1c0'};
}
export function validatePublicRpc(method,params){
 if(!publicRpcMethods.includes(method))throw fault(-32601,'Method not available on this read-only RPC');
 if(!Array.isArray(params))invalid();
 const p=structuredClone(params);
 if(['eth_chainId','net_version','web3_clientVersion','eth_blockNumber','eth_syncing','eth_gasPrice','eth_maxPriorityFeePerGas'].includes(method)){count(p,0);return p;}
 if(['eth_getBalance','eth_getCode','eth_getTransactionCount'].includes(method)){count(p,2);if(!isAddress(p[0])||!blockRef(p[1]))invalid();}
 else if(method==='eth_getStorageAt'){count(p,3);if(!isAddress(p[0])||!qty(p[1])||!blockRef(p[2]))invalid();}
 else if(['eth_getBlockByNumber','eth_getBlockByHash'].includes(method)){count(p,2);if(!(method.endsWith('ByHash')?isHash(p[0]):block(p[0]))||typeof p[1]!=='boolean')invalid();}
 else if(['eth_getBlockTransactionCountByNumber','eth_getBlockTransactionCountByHash'].includes(method)){count(p,1);if(!(method.endsWith('ByHash')?isHash(p[0]):block(p[0])))invalid();}
 else if(['eth_getTransactionByHash','eth_getTransactionReceipt'].includes(method)){count(p,1);if(!isHash(p[0]))invalid();}
 else if(['eth_getTransactionByBlockHashAndIndex','eth_getTransactionByBlockNumberAndIndex'].includes(method)){count(p,2);if(!(method.includes('BlockHash')?isHash(p[0]):block(p[0]))||!qty(p[1]))invalid();}
 else if(method==='eth_call'||method==='eth_estimateGas'){count(p,method==='eth_call'?2:1,2);p[0]=transaction(p[0]);if(p.length===2&&!blockRef(p[1]))invalid();}
 else if(method==='eth_feeHistory'){count(p,2,3);if(!qty(p[0])||BigInt(p[0])<1n||BigInt(p[0])>1024n||!block(p[1]))invalid();if(p[2]!==undefined&&(!Array.isArray(p[2])||p[2].length>20||p[2].some((v,i)=>typeof v!=='number'||!Number.isFinite(v)||v<0||v>100||i>0&&v<p[2][i-1])))invalid();}
 else if(method==='eth_getLogs'){
  count(p,1);const f=p[0];if(!isObject(f)||Object.keys(f).some(k=>!['address','topics','fromBlock','toBlock','blockHash'].includes(k)))invalid();
  if(f.address!==undefined){const a=Array.isArray(f.address)?f.address:[f.address];if(!a.length||a.length>20||a.some(a=>!isAddress(a)))invalid();}
  if(f.topics!==undefined&&(!Array.isArray(f.topics)||f.topics.length>4||f.topics.some(x=>x!==null&&!(Array.isArray(x)?x.length<=20&&x.every(h=>isHash(h)):isHash(x)))))invalid();
  if(f.blockHash!==undefined){if(!isHash(f.blockHash)||f.fromBlock!==undefined||f.toBlock!==undefined)invalid();}
  else for(const k of ['fromBlock','toBlock'])if(f[k]!==undefined&&(!block(f[k])||f[k]==='pending'))invalid();
 }
 return p;
}

export function createPublicRpc({localUrl,chainId,origin,basePath='',fetcher=fetch,now=Date.now,policy={},trustProxy=false}){
 const cap={...limits,...policy},urls=developerEndpoints(origin,basePath),rates=new Map();let active=0,globalRate={until:0,count:0},readiness=null,observedAt=0,check=null;
 const descriptor={service:'Ink Explorer',network:chainId===57073?'Ink Mainnet':'Ink Sepolia',chainId,transport:'HTTPS JSON-RPC 2.0',url:urls.rpc,readOnly:true,methods:[...publicRpcMethods],limits:cap,documentation:urls.documentation};
 const upstream=async(method,params,signal)=>{
  let response;
  try{
   response=await fetcher(localUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(8000)]):AbortSignal.timeout(5000)});
   if(!response.ok)throw fault(-32002,'RPC temporarily unavailable');
   if(Number(response.headers.get('content-length'))>cap.responseBytes){await response.body?.cancel();throw fault(-32005,'RPC response exceeds the public size limit');}
   let bytes=0;const chunks=[];
   for await(const chunk of response.body){bytes+=chunk.length;if(bytes>cap.responseBytes)throw fault(-32005,'RPC response exceeds the public size limit');chunks.push(chunk);}
   const j=JSON.parse(Buffer.concat(chunks).toString());
   if(j.jsonrpc!=='2.0'||j.id!==1||('result'in j)===('error'in j))throw fault(-32002,'Invalid RPC upstream response');
   if(j.error){if(!Number.isInteger(j.error.code)||typeof j.error.message!=='string')throw fault(-32002,'Invalid RPC upstream error');throw fault(j.error.code,j.error.message,j.error.data);}
   return j.result;
  }catch(e){if(e.rpcError)throw e;throw fault(-32002,'RPC temporarily unavailable');}
 };
 const ready=async()=>{
  if(readiness&&now()-observedAt<5000)return;
  if(!check)check=(async()=>{
   const [chain,sync,head]=await Promise.all([upstream('eth_chainId',[]),upstream('eth_syncing',[]),upstream('eth_getBlockByNumber',['latest',false])]);
   if(!nodeReadiness({chain,expectedChainId:chainId,sync,block:head,now:now()}).synced)throw fault(-32002,'RPC node is unavailable, syncing or on the wrong network');
   readiness=true;observedAt=now();
  })().finally(()=>{check=null;});
  await check;
 };
 const execute=async(request,signal)=>{
  const valid=validRequest(request);
  if(!valid)return {jsonrpc:'2.0',id:null,error:{code:-32600,message:'Invalid Request'}};
  const id=request.id,notification=!('id'in request);
  try{
   let params=validatePublicRpc(request.method,request.params===undefined?[]:request.params);
   await ready();signal.throwIfAborted();
   if(request.method==='eth_getLogs'&&!params[0].blockHash){
    const f=params[0],resolved=new Map();
    const height=async value=>{value??='latest';if(qty(value))return BigInt(value);if(value==='earliest')return 0n;if(!resolved.has(value)){const block=await upstream('eth_getBlockByNumber',[value,false],signal);if(!block?.number||!qty(block.number))throw fault(-32002,'RPC block unavailable');resolved.set(value,BigInt(block.number));}return resolved.get(value);};
    const from=await height(f.fromBlock),to=await height(f.toBlock);
    if(to<from||to-from+1n>BigInt(cap.logBlocks))throw fault(-32602,`Log ranges may include at most ${cap.logBlocks} blocks`);
    params=[{...f,fromBlock:'0x'+from.toString(16),toBlock:'0x'+to.toString(16)}];
   }
   const result=request.method==='web3_clientVersion'?'InkExplorer/1.0.0':request.method==='net_version'?String(chainId):await upstream(request.method,params,signal);
   return notification?null:{jsonrpc:'2.0',id,result};
  }catch(e){return notification?null:{jsonrpc:'2.0',id,error:{code:e.rpcError?e.code:-32002,message:e.rpcError?e.message:'RPC temporarily unavailable',...(e.data===undefined?{}:{data:e.data})}};}
 };
 return async(req,res)=>{
  const send=(status,body,extra={})=>{if(res.destroyed||res.writableEnded)return;const data=body===undefined?null:Buffer.from(JSON.stringify(body));res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-robots-tag':'noindex, nofollow','access-control-allow-origin':'*','access-control-expose-headers':'Retry-After','x-content-type-options':'nosniff',...(data?{'content-length':data.length}:{}),...extra});res.end(req.method==='HEAD'?undefined:data);};
  if(req.method==='OPTIONS')return send(204,undefined,{'access-control-allow-methods':'GET, HEAD, POST, OPTIONS','access-control-allow-headers':'Content-Type','access-control-max-age':'600'});
  if(req.method==='GET'||req.method==='HEAD')return send(200,descriptor);
  if(req.method!=='POST')return send(405,{error:'Use POST for JSON-RPC'},{allow:'GET, HEAD, POST, OPTIONS'});
  if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))return send(415,{jsonrpc:'2.0',id:null,error:{code:-32600,message:'Use Content-Type: application/json'}});
  if(Number(req.headers['content-length'])>cap.bodyBytes)return send(413,{jsonrpc:'2.0',id:null,error:{code:-32600,message:'RPC request too large'}},{connection:'close'});
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),cap.timeoutMs),aborted=()=>controller.abort();req.once('aborted',aborted);res.once('close',aborted);let acquired=false;
  try{
   const raw=await new Promise((resolve,reject)=>{
    const chunks=[];let size=0;
    const clean=()=>{req.off('data',data);req.off('end',end);req.off('error',failed);controller.signal.removeEventListener('abort',cancel);};
    const failed=e=>{clean();reject(e);};
    const data=chunk=>{size+=chunk.length;if(size>cap.bodyBytes){failed(Object.assign(fault(-32600,'RPC request too large'),{status:413}));req.resume();}else chunks.push(chunk);};
    const end=()=>{clean();resolve(Buffer.concat(chunks).toString());};
    const cancel=()=>failed(fault(-32002,'RPC request timed out'));
    req.on('data',data);req.once('end',end);req.once('error',failed);controller.signal.addEventListener('abort',cancel,{once:true});
    if(controller.signal.aborted)cancel();
   });
   let body;try{body=JSON.parse(raw);}catch{return send(400,{jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}});}
   const batch=Array.isArray(body),requests=batch?body:[body];
   if(batch&&!requests.length)return send(400,{jsonrpc:'2.0',id:null,error:{code:-32600,message:'Invalid Request'}});
   if(requests.length>cap.batch)return send(400,{jsonrpc:'2.0',id:null,error:{code:-32600,message:`Batch exceeds ${cap.batch} requests`}});
   const timestamp=now();for(const [key,v]of rates)if(v.until<=timestamp)rates.delete(key);
   const proxy=trustProxy&&['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
   const ip=proxy&&isIP(req.headers['cf-connecting-ip']||'')?req.headers['cf-connecting-ip']:req.socket.remoteAddress;
   const rate=rates.get(ip)||{until:timestamp+60000,count:0};if(globalRate.until<=timestamp)globalRate={until:timestamp+60000,count:0};
   if(active>=cap.concurrentRequests||rates.size>=1024&&!rates.has(ip)||rate.count+requests.length>cap.methodsPerMinute||globalRate.count+requests.length>cap.globalMethodsPerMinute)return send(429,requests.some(x=>!validRequest(x)||'id'in x)?{jsonrpc:'2.0',id:null,error:{code:-32005,message:'RPC rate limit exceeded'}}:undefined,{'retry-after':String(Math.max(1,Math.ceil((rate.until-timestamp)/1000)))});
   rate.count+=requests.length;rates.set(ip,rate);globalRate.count+=requests.length;active++;acquired=true;
   const responses=[];let responseBytes=2;
   for(const request of requests){
    const response=await execute(request,controller.signal);
    if(response){
     responseBytes+=Buffer.byteLength(JSON.stringify(response))+1;
     if(responseBytes>cap.responseBytes){
      const errors=requests.flatMap(item=>!validRequest(item)?[{jsonrpc:'2.0',id:null,error:{code:-32600,message:'Invalid Request'}}]:!('id'in item)?[]:[{jsonrpc:'2.0',id:item.id,error:{code:-32005,message:'RPC response exceeds the public size limit'}}]);
      return send(200,batch?errors:errors[0]);
     }
     responses.push(response);
    }
   }
   if(!responses.length)return send(204);
   return send(200,batch?responses:responses[0]);
  }catch(e){return send(e.status||503,{jsonrpc:'2.0',id:null,error:{code:e.status===413?-32600:-32002,message:e.status===413?'RPC request too large':'RPC temporarily unavailable'}},{'retry-after':'1',connection:'close'});}
  finally{clearTimeout(timer);req.off('aborted',aborted);res.off('close',aborted);if(acquired)active--;}
 };
}

export function apiDiscovery(origin,basePath=''){
 const urls=developerEndpoints(origin,basePath);return {service:'Ink Explorer public API',network:basePath?'Ink Sepolia':'Ink Mainnet',chainId:basePath?763373:57073,api:urls.api,rpc:urls.rpc,websocket:urls.websocket,documentation:urls.documentation,openapi:new URL('/assets/openapi.json',origin).href,example:urls.api+'/explorer/blocks'};
}
