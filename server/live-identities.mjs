// Shared metadata for the recent feed; lookup is optional enrichment and never
// blocks a canonical block or receipt. No runtime image URLs enter live frames.
export function createLiveIdentities({get,onChange,maxEntries=2000,enabled=()=>true}) {
  const known=new Map(),pending=new Set(),queue=[];
  let active=0,closed=false;
  const clearQueue=()=>{for(const hash of queue)pending.delete(hash);queue.length=0;};
  const pick=record=>({hash:record.hash,name:record.name,ens_domain_name:record.ens_domain_name,is_contract:record.is_contract,is_verified:record.is_verified,proxy_type:record.proxy_type,implementations:record.implementations?.map(item=>({address_hash:item.address_hash,name:item.name})),metadata:record.metadata ? {tags:record.metadata.tags?.filter(tag=>tag.tagType==="name").map(tag=>({name:tag.name,tagType:tag.tagType}))} : undefined});
  function remember(record) {
    if(!record?.hash || record.is_contract==null)return;
    const key=record.hash.toLowerCase();known.delete(key);known.set(key,{at:Date.now(),value:pick(record)});
    while(known.size>maxEntries)known.delete(known.keys().next().value);
  }
  const work=async()=>{
    if(!enabled()){clearQueue();return;}
    if(closed || active>=2 || !queue.length)return;
    const hash=queue.shift();active++;
    try {const record=await get(hash);remember(record);onChange();}
    catch {known.delete(hash);known.set(hash,{at:Date.now()-240000,value:{hash}});while(known.size>maxEntries)known.delete(known.keys().next().value);}
    finally {pending.delete(hash);active--;if(queue.length){const timer=setTimeout(work,500);timer.unref?.();}}
  };
  function request(hash) {
    if(!/^0x[\da-f]{40}$/i.test(hash || ""))return;
    const key=hash.toLowerCase();if(pending.has(key) || Date.now()-(known.get(key)?.at || 0)<300000 || queue.length>=100)return;
    pending.add(key);queue.push(key);void work();
  }
  const enrich=record=>record?.hash ? {...record,...known.get(record.hash.toLowerCase())?.value,hash:record.hash} : record;
  return {
    seed(records) {for(const record of records || []){remember(record.from);remember(record.to);remember(record.created_contract);}},
    apply(snapshot) {const transactions=snapshot.transactions.map(item=>({...item,from:enrich(item.from),to:enrich(item.to),created_contract:enrich(item.created_contract)}));if(enabled()){for(const item of transactions.slice(0,25)){request(item.to?.hash);request(item.created_contract?.hash);}}else clearQueue();return {...snapshot,transactions};},
    close(){closed=true;clearQueue();},
  };
}
