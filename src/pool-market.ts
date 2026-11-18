import {network} from './network';
import {readCurrentJson} from './statistics-request';
import {statisticNumber,type CurrentSnapshot} from './statistics-data';
import {validPoolMarket} from './pool-identity';

export type PoolMarket=Record<string,any>;
const object=(value:unknown):value is Record<string,any>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const numericFields=['liquidity','volume_usd_24h','fee','base_token_market_cap_usd','base_token_fully_diluted_valuation_usd','quote_token_market_cap_usd','quote_token_fully_diluted_valuation_usd'];
export function normalizePoolMarket(value:unknown,id:string):PoolMarket {
  if(!validPoolMarket(value,id,network.chainId))throw new Error('invalidApiResponse');
  const result={...value};
  for(const field of numericFields)if(statisticNumber(result[field])===null)result[field]=null;
  return result;
}

export async function readPoolCatalogue(signal:AbortSignal):Promise<CurrentSnapshot<{items:PoolMarket[]}>> {
  const items=new Map<string,PoolMarket>(),seenCursors=new Set<string>();
  let query='page_size=100',expiresAt=Infinity;
  for(let page=0;page<100;page++){
    const snapshot=await readCurrentJson(`/contract-info/pools?${query}`,signal),data=snapshot.data;
    expiresAt=Math.min(expiresAt,snapshot.expiresAt);
    if(!object(data)||!Array.isArray(data.items))throw new Error('invalidApiResponse');
    for(const item of data.items){
      const pool=normalizePoolMarket(item,item?.pool_id);
      items.set(pool.pool_id.toLowerCase(),pool);
    }
    if(data.next_page_params==null)return{data:{items:[...items.values()]},expiresAt};
    if(!object(data.next_page_params)||!Object.keys(data.next_page_params).length)throw new Error('invalidApiResponse');
    const params=new URLSearchParams();
    for(const [key,value]of Object.entries(data.next_page_params)){
      if(!['string','number'].includes(typeof value))throw new Error('invalidApiResponse');
      params.set(key,String(value));
    }
    params.sort();query=params.toString();
    if(seenCursors.has(query))throw new Error('Pool catalogue returned a repeated cursor');
    seenCursors.add(query);
  }
  throw new Error('Pool catalogue exceeded the safe pagination limit');
}

export async function readPoolMarket(id:string,signal:AbortSignal) {
  const snapshot=await readCurrentJson(`/contract-info/pools/${id}`,signal);
  return{...snapshot,data:normalizePoolMarket(snapshot.data,id)};
}

export async function readPoolContract(address:string,signal:AbortSignal) {
  const [account,counters,transactions]=await Promise.all([
    readCurrentJson(`/explorer/addresses/${address}`,signal),
    readCurrentJson(`/explorer/addresses/${address}/counters`,signal),
    readCurrentJson(`/explorer/addresses/${address}/transactions`,signal),
  ]);
  if(!object(account.data)||typeof account.data.hash!=='string'||account.data.hash.toLowerCase()!==address.toLowerCase()
    ||!object(counters.data)||!object(transactions.data)||!Array.isArray(transactions.data.items))
    throw new Error('invalidApiResponse');
  const counts={...counters.data};
  for(const field of ['transactions_count','token_transfers_count']){
    const number=statisticNumber(counts[field]);
    if(number===null||!Number.isInteger(number))counts[field]=null;
  }
  return{data:{address:account.data,counters:counts,transactions:transactions.data},
    expiresAt:Math.min(account.expiresAt,counters.expiresAt,transactions.expiresAt)};
}
