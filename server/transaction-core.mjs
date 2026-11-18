import {nodeReadiness} from './node-readiness.mjs';

const hash = value => typeof value === 'string' && /^0x[\da-f]{64}$/i.test(value);
const address = value => typeof value === 'string' && /^0x[\da-f]{40}$/i.test(value);
const same = (a,b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
const quantity = value => {
  if (typeof value !== 'string' || !/^0x(?:0|[1-9a-f][\da-f]*)$/i.test(value) || value.length > 66) return null;
  return BigInt(value);
};
const integer = value => { const n=quantity(value); return n!==null && n<=BigInt(Number.MAX_SAFE_INTEGER) ? Number(n) : null; };
const blockIdentity = block => {
  const number=integer(block?.number),timestamp=integer(block?.timestamp);
  return hash(block?.hash) && number!==null && timestamp!==null ? {number,timestamp,hash:block.hash.toLowerCase()} : null;
};

async function rpcBody(response,signal) {
  const limit=2*1024*1024;
  if(!response.ok || Number(response.headers.get('content-length'))>limit) { await response.body?.cancel(); throw Error('Invalid local RPC response'); }
  const reader=response.body?.getReader();if(!reader)throw Error('Missing local RPC body');
  const chunks=[];let size=0;
  const abort=()=>void reader.cancel().catch(()=>{});signal.addEventListener('abort',abort,{once:true});
  try {
    for(;;){signal.throwIfAborted();const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw Error('Local RPC response too large');chunks.push(value);}
    signal.throwIfAborted();return JSON.parse(Buffer.concat(chunks,size).toString('utf8'));
  } finally {signal.removeEventListener('abort',abort);await reader.cancel().catch(()=>{});}
}

// These amounts are exact receipt values. Unknown OP fee components and
// post-execution refunds leave the total unavailable instead of estimating it.
function feeFromReceipt(receipt,gas,price,type) {
  const fields=['l1Fee','operatorFee','operatorFeeScalar','operatorFeeConstant','opGasRefund'];
  for(const key of fields)if(receipt[key]!=null && quantity(receipt[key])===null)throw Error('Malformed receipt fee');
  const l1=quantity(receipt.l1Fee),operator=quantity(receipt.operatorFee);
  const scalar=quantity(receipt.operatorFeeScalar)??0n,constant=quantity(receipt.operatorFeeConstant)??0n;
  const refund=quantity(receipt.opGasRefund)??0n,deposit=type===126n;
  if(deposit && (price!==0n || (l1??0n)!==0n || (operator??0n)!==0n))throw Error('Unexpected deposit fee');
  if(refund>0n || !deposit && (l1===null || operator===null && (scalar>0n || constant>0n)))return null;
  const execution=gas*price;
  return {type:'actual',value:String(execution+(l1??0n)+(operator??0n)),execution:String(execution),l1:l1===null?null:String(l1),operator:operator===null?null:String(operator)};
}

// Any age is usable only while the node retains its matching receipt. A fresh
// head and two canonical membership reads are required even for old records.
// Pruned receipts leave the index authoritative; inclusion alone is not success.
// Results are never cached; only concurrent reads of the same identity share
// a job. Every new request must witness canonical membership again.
export function createTransactionCore({chainId,localUrl,fetcher=fetch,now=Date.now,timeoutMs=1200,maxInflight=16}) {
  const inflight=new Map();
  const read=async id=>{
    const controller=new AbortController();
    const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(timeoutMs)]);
    const call=async(method,params=[])=>{
      const response=await fetcher(localUrl,{method:'POST',redirect:'error',headers:{'content-type':'application/json'},signal,body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
      const body=await rpcBody(response,signal);
      if(body?.jsonrpc!=='2.0'||body.id!==1||body.error||!Object.hasOwn(body,'result'))throw Error('Malformed local RPC envelope');
      return body.result;
    };
    try {
      const [chain,sync,latest,tx,receipt]=await Promise.all([
        call('eth_chainId'),call('eth_syncing'),call('eth_getBlockByNumber',['latest',false]),
        call('eth_getTransactionByHash',[id]),call('eth_getTransactionReceipt',[id]),
      ]);
      const head=blockIdentity(latest),included=integer(tx?.blockNumber),position=integer(tx?.transactionIndex);
      if(quantity(chain)!==BigInt(chainId)||!head||!nodeReadiness({chain,expectedChainId:chainId,sync,block:latest,now:now()}).synced ||
        !same(tx?.hash,id)||!hash(tx.blockHash)||included===null||position===null||included>head.number ||
        tx.chainId!=null&&quantity(tx.chainId)!==BigInt(chainId))return null;
      const block=await call('eth_getBlockByNumber',[tx.blockNumber,false]),identity=blockIdentity(block);
      if(!identity||identity.number!==included||!same(identity.hash,tx.blockHash)||identity.timestamp>head.timestamp ||
        included===head.number&&!same(identity.hash,head.hash)||!Array.isArray(block.transactions)||!same(block.transactions[position],id) ||
        block.transactions.some(value=>!hash(value))||new Set(block.transactions.map(value=>value.toLowerCase())).size!==block.transactions.length)return null;
      const age=Math.floor(now()/1000)-identity.timestamp;
      if(age< -30 || !same(receipt?.transactionHash,id)||!same(receipt.blockHash,identity.hash)||
        integer(receipt.blockNumber)!==included||integer(receipt.transactionIndex)!==position ||
        !address(tx.from)||!same(receipt.from,tx.from)||tx.to!==null&&(!address(tx.to)||!same(receipt.to,tx.to))||tx.to===null&&receipt.to!==null)return null;
      const value=quantity(tx.value),nonce=quantity(tx.nonce),limit=quantity(tx.gas),gas=quantity(receipt.gasUsed),price=quantity(receipt.effectiveGasPrice),status=quantity(receipt.status),type=quantity(receipt.type??tx.type);
      if([value,nonce,limit,gas,price,type].some(v=>v===null)||gas>limit||status!==0n&&status!==1n ||
        tx.type!=null&&quantity(tx.type)!==type ||typeof tx.input!=='string'||!/^0x(?:[\da-f]{2})*$/i.test(tx.input)||tx.input.length>262146 ||
        receipt.contractAddress!=null&&(!address(receipt.contractAddress)||tx.to!==null||status!==1n)||
        tx.to===null&&status===1n&&!address(receipt.contractAddress))return null;
      const fee=feeFromReceipt(receipt,gas,price,type);
      // A branch can change while the transaction and receipt are being read.
      const checked=blockIdentity(await call('eth_getBlockByNumber',[tx.blockNumber,false]));
      const observedAt=now(),currentAge=Math.floor(observedAt/1000)-identity.timestamp;
      if(!checked||checked.hash!==identity.hash||checked.number!==included||checked.timestamp!==identity.timestamp ||
        currentAge< -30||!nodeReadiness({chain,expectedChainId:chainId,sync,block:latest,now:observedAt}).synced)return null;
      return {
        hash:id,chainId,block_number:included,block_hash:identity.hash,timestamp:new Date(identity.timestamp*1000).toISOString(),position,
        from:{hash:tx.from.toLowerCase()},to:tx.to===null?null:{hash:tx.to.toLowerCase()},
        created_contract:receipt.contractAddress?{hash:receipt.contractAddress.toLowerCase(),is_contract:true}:null,
        value:String(value),nonce:String(nonce),gas_limit:String(limit),gas_used:String(gas),gas_price:String(price),
        l1_fee:receipt.l1Fee==null?null:String(quantity(receipt.l1Fee)),
        l1_gas_price:quantity(receipt.l1GasPrice)?.toString()??null,l1_gas_used:quantity(receipt.l1GasUsed)?.toString()??null,
        status:status===1n?'ok':'error',result:status===1n?'success':'execution reverted',fee,
        method:tx.input.length>=10?tx.input.slice(0,10):null,raw_input:tx.input,
        is_pending_update:true,
        _ink_node_observation:{schema:1,chainId,observedAt:new Date(observedAt).toISOString(),block:{number:included,hash:identity.hash}},
      };
    } catch { return null; }
    finally {controller.abort();}
  };
  return async id=>{
    if(!hash(id))return null;id=id.toLowerCase();
    if(inflight.has(id))return inflight.get(id);
    if(inflight.size>=maxInflight)return null;
    const job=read(id);inflight.set(id,job);
    try{return await job;}finally{if(inflight.get(id)===job)inflight.delete(id);}
  };
}

// Warm index responses avoid all extra RPC work. A slower index continues in
// the background to populate its normal cache; core records never enter it.
export async function firstTransactionResponse({indexed,core,preferIndex=()=>true,startDelayMs=100}) {
  const indexJob=Promise.resolve().then(indexed).then(value=>({kind:'indexed',value}),error=>({kind:'error',error}));
  let coreJob,timer,release;
  const startCore=()=>coreJob??=Promise.resolve().then(core).catch(()=>null);
  const delayed=new Promise(resolve=>{release=resolve;timer=setTimeout(()=>resolve(true),startDelayMs);})
    .then(start=>start?startCore():null).then(value=>value?{kind:'core',value}:indexJob);
  try {
    const first=await Promise.race([indexJob,delayed]);
    if(first.kind==='core'||first.kind==='indexed'&&preferIndex(first.value))return first;
    clearTimeout(timer);release(false);
    const value=await startCore();
    if(value)return {kind:'core',value};
    if(first.kind==='error')throw first.error;
    return first;
  } finally {clearTimeout(timer);release(false);}
}
