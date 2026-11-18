import {currentNetworkObservation,type NetworkObservationFrame} from './network-observation';

type Row=Record<string,any>;
export type AddressBalance={schema:1;chainId:number;address:string;balance:string;block:{number:number;hash:string;timestamp:number};observedAt:string;source:'local'};
export type BalanceFrame=NetworkObservationFrame & {block?:Row;blocks?:Row[];initialPending?:boolean};
export const balanceMaxAge=15000;
const hash=(value:unknown):value is string=>typeof value==='string'&&/^0x[\da-f]{64}$/i.test(value);

export function normalizeAddressBalance(value:unknown,id:string,chainId:number,now=Date.now()):AddressBalance {
  const d=value as AddressBalance;
  if(!d||d.schema!==1||d.chainId!==chainId||d.source!=='local'||!/^0x[\da-f]{40}$/i.test(d.address)||d.address.toLowerCase()!==id.toLowerCase()||typeof d.balance!=='string'||!/^\d{1,78}$/.test(d.balance)||BigInt(d.balance)>2n**256n-1n||!Number.isSafeInteger(d.block?.number)||d.block.number<0||!hash(d.block.hash)||!Number.isSafeInteger(d.block.timestamp))throw new Error('invalidApiResponse');
  const observed=Date.parse(d.observedAt),blockTime=d.block.timestamp*1000;
  if(!Number.isFinite(observed)||observed>now+1000||blockTime>now+1000||now-observed>=balanceMaxAge||now-blockTime>=balanceMaxAge)throw new Error('Data source unavailable');
  return d;
}

export function profileAddressBalance(profile:Row|undefined,id:string,chainId:number,now=Date.now()):AddressBalance|undefined {
  const c=profile?.balance_check;
  if(!c||c.scope!=='head'||!['matched','corrected'].includes(c.status))return;
  try{return normalizeAddressBalance({schema:1,chainId,address:profile?.hash,balance:profile?.coin_balance,block:{number:c.block_number,hash:c.block_hash,timestamp:c.block_timestamp},observedAt:c.checked_at,source:c.source},id,chainId,now);}catch{return;}
}

export function addressBalanceHead(frame:BalanceFrame,chainId:number,now=Date.now()) {
  const n=currentNetworkObservation(frame,chainId,now),b=frame.block;
  if(!n?.online||!n.synced||n.stale||!b||!Number.isSafeInteger(b.height)||b.height!==Number(n.head)||!hash(b.hash))return;
  return {number:b.height,hash:b.hash.toLowerCase()};
}

export function currentAddressBalance(value:AddressBalance|undefined,frame:BalanceFrame,chainId:number,now=Date.now()):AddressBalance|undefined {
  if(!value)return;
  try{normalizeAddressBalance(value,value.address,chainId,now);}catch{return;}
  // A server-verified first observation can bridge the initial socket setup.
  // After that, a disconnected stream cannot establish canonical membership.
  if(frame.initialPending)return value;
  const head=addressBalanceHead(frame,chainId,now);
  if(!head||value.block.number>head.number)return;
  const block=value.block.number===head.number?frame.block:frame.blocks?.find(b=>b.height===value.block.number);
  if(block&&hash(block.hash)&&block.hash.toLowerCase()===value.block.hash.toLowerCase())return value;
}
