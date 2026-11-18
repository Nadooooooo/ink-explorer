import {nodeReadiness} from './node-readiness.mjs';

const addressPattern=/^0x[\da-f]{40}$/i,hashPattern=/^0x[\da-f]{64}$/i;
const quantity=value=>typeof value==='string' && /^0x[\da-f]{1,64}$/i.test(value);
export class AddressBalanceBusy extends Error {}

/** Read immutable state by canonical hash; share work, never cache a latest tag. */
export function createCurrentAddressBalance({rpc,chainId,now=Date.now,limit=16,deadline=3000}) {
  const pending=new Map(),balances=new Map();
  let headPending;
  const head=()=>{
    if(headPending)return headPending;
    const startedAt=now(),signal=AbortSignal.timeout(deadline);
    headPending=Promise.all([
      rpc('eth_chainId',[],signal),rpc('eth_syncing',[],signal),rpc('eth_getBlockByNumber',['latest',false],signal),
    ]).then(([chain,sync,block])=>{
      if(!nodeReadiness({chain,expectedChainId:chainId,sync,block,now:now()}).synced || !hashPattern.test(block?.hash||'') || !quantity(block.number) || !quantity(block.timestamp) || !Number.isSafeInteger(Number(block.number)))throw new Error('Data source unavailable');
      return {number:Number(block.number),hash:block.hash.toLowerCase(),timestamp:Number(block.timestamp),observedAt:startedAt};
    }).finally(()=>{headPending=undefined;});
    return headPending;
  };
  return async address=>{
    if(typeof address!=='string'||!addressPattern.test(address))throw new Error('Invalid address');
    address=address.toLowerCase();
    if(pending.has(address))return pending.get(address);
    if(pending.size>=limit)throw new AddressBalanceBusy('Data source unavailable');
    const task=(async()=>{
      const block=await head(),key=address+':'+block.hash;
      for(const [key,value]of balances)if(now()-value.at>=30000)balances.delete(key);
      let value=balances.get(key)?.value;
      if(value===undefined){
        const remaining=deadline-(now()-block.observedAt);
        if(remaining<=0)throw new Error('Data source unavailable');
        const result=await rpc('eth_getBalance',[address,{blockHash:block.hash,requireCanonical:true}],AbortSignal.timeout(Math.ceil(remaining)));
        if(!quantity(result))throw new Error('Data source unavailable');
        value=BigInt(result).toString();
        balances.set(key,{at:now(),value});
        if(balances.size>1000)balances.delete(balances.keys().next().value);
      }
      // A slow response cannot give an old observation a new timestamp.
      if(now()-block.observedAt>=15000 || now()-block.timestamp*1000>=15000 || block.timestamp*1000-now()>1000)throw new Error('Data source unavailable');
      return {schema:1,chainId,address,balance:value,block:{number:block.number,hash:block.hash,timestamp:block.timestamp},observedAt:new Date(block.observedAt).toISOString(),source:'local'};
    })();
    pending.set(address,task);
    try{return await task;}finally{if(pending.get(address)===task)pending.delete(address);}
  };
}
