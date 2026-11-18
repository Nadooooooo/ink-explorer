import {currentNetworkObservation, type NetworkObservationFrame} from './network-observation';
import {mergeLiveTransactions} from './live-ledger';

type Row = Record<string, any>;
export type TransactionFrame = NetworkObservationFrame & {blocks?: Row[]; transactions?: Row[]};
export type TransactionObservation = {id:string; height:number; blockHash:string; replaced:boolean; invalidated?:boolean; record:Row; indexWitness?:string; receiptCheckedAt?:number};
const hash = (value:unknown):value is string => typeof value==='string' && /^0x[\da-f]{64}$/i.test(value);
const height = (value:unknown):number|null => value!==null && value!==undefined && value!=='' && Number.isSafeInteger(Number(value)) && Number(value)>=0 ? Number(value) : null;
const sameHash = (a:unknown,b:unknown) => hash(a) && hash(b) && a.toLowerCase()===b.toLowerCase();
export function transactionNetwork(frame:TransactionFrame,chainId:number,now=Date.now()) {
  const network=currentNetworkObservation(frame,chainId,now);
  return network?.online===true && network.synced===true && network.stale!==true && height(network.head)!==null ? network : null;
}

/** Only a full canonical block's membership can move a receipt to another inclusion. */
export function observeTransaction(id:string,indexed:Row|undefined,frame:TransactionFrame,chainId:number,previous?:TransactionObservation,now=Date.now()):TransactionObservation|undefined {
  const retained=previous && sameHash(previous.id,id)?previous:undefined;
  if(!hash(id) || !transactionNetwork(frame,chainId,now))return retained;
  const blocks=(frame.blocks||[]).filter(block=>hash(block.hash) && height(block.height)!==null && Array.isArray(block.transaction_hashes));
  const included=blocks.find(block=>block.transaction_hashes.some((value:unknown)=>sameHash(value,id)));
  if(included){
    const incoming=frame.transactions?.find(row=>sameHash(row.hash,id) && sameHash(row.block_hash,included.hash) && height(row.block_number)===height(included.height));
    const same=retained && !retained.replaced && sameHash(retained.blockHash,included.hash);
    const basic={hash:id.toLowerCase(),block_number:Number(included.height),block_hash:included.hash,timestamp:included.timestamp,status:null,result:'confirmed'};
    // A header without receipts must not erase an already witnessed execution.
    const record=incoming ? mergeLiveTransactions(same?[retained.record]:[],[{...incoming,hash:id.toLowerCase()}],[included],1)[0] : same?retained.record:basic;
    if(same && retained.record===record)return retained;
    return {id,height:Number(included.height),blockHash:included.hash,replaced:false,invalidated:retained?.invalidated || !!retained && (!same || retained.replaced),record};
  }
  const knownHeight=retained?.height ?? height(indexed?.block_number);
  const current=blocks.find(block=>Number(block.height)===knownHeight);
  if(!current || knownHeight===null)return retained;
  // The full hash set excludes this transaction, even if the indexed record
  // omitted its block hash. Never resurrect that inclusion from a late reply.
  if(retained?.replaced)return retained;
  return {id,height:knownHeight,blockHash:retained?.blockHash || indexed?.block_hash || current.hash,replaced:true,record:retained?.record || indexed || {hash:id}};
}

const executionFields=['status','result','timestamp','gas_used','gas_price','fee','l1_fee','l1_gas_price','l1_gas_used','l1_fee_scalar','revert_reason','position','confirmations','token_transfers','created_contract','transaction_burnt_fee','priority_fee','base_fee_per_gas','historic_exchange_rate','confirmation_duration'];
export function followedTransaction(indexed:Row|undefined,observation?:TransactionObservation):Row|undefined {
  if(!observation)return indexed;
  const same=indexed && height(indexed.block_number)===observation.height && (!indexed.block_hash || sameHash(indexed.block_hash,observation.blockHash));
  let base={...indexed,hash:observation.id.toLowerCase()};
  if(!same || observation.replaced || observation.invalidated || indexed?.status==='pending')for(const key of executionFields)delete (base as Row)[key];
  if(observation.replaced)return {...base,block_number:null,block_hash:null,status:'pending',result:'pending'};
  const record:Row={...observation.record,hash:observation.id.toLowerCase()};
  const merged=mergeLiveTransactions([base],[record],[],1)[0];
  // Pending index values are never execution evidence, even when the index
  // has already assigned a height but the node has not supplied the receipt.
  if((!same || indexed?.status==='pending') && record.status==null){merged.status=null;merged.result='confirmed';}
  return merged;
}

export function currentConfirmations(tx:Row|undefined,frame:TransactionFrame,chainId:number,now=Date.now()):number|null {
  const network=transactionNetwork(frame,chainId,now),included=height(tx?.block_number);
  if(!network || included===null || included>Number(network.head))return null;
  return Number(network.head)-included;
}

export function transactionNeedsIndex(indexed:Row|undefined,observation:TransactionObservation|undefined,frame:TransactionFrame,chainId:number):boolean {
  if(!indexed || observation?.replaced || indexed.status==='pending' || height(indexed.block_number)===null || indexed.is_pending_update===true)return true;
  if(observation && (height(indexed.block_number)!==observation.height || indexed.block_hash && !sameHash(indexed.block_hash,observation.blockHash)))return true;
  const network=transactionNetwork(frame,chainId);
  // Historical complete records do not need a request for every new head.
  return !network || height(network.finalizedBlock)===null || Number(indexed.block_number)>Number(network.finalizedBlock);
}

export const transactionIndexWitness=(indexed:Row|undefined)=>`${height(indexed?.block_number)}:${hash(indexed?.block_hash)?indexed.block_hash.toLowerCase():''}`;
export function transactionNeedsReceipt(indexed:Row|undefined,observation:TransactionObservation|undefined,frame:TransactionFrame,chainId:number,now=Date.now()):boolean {
  if(!observation)return false;
  if(observation.replaced)return true;
  const indexedHeight=height(indexed?.block_number);
  const conflict=indexedHeight!==null && (indexedHeight!==observation.height || hash(indexed?.block_hash) && !sameHash(indexed.block_hash,observation.blockHash));
  if(!conflict)return false;
  // A lagging index cannot override membership witnessed in a current block.
  if(transactionNetwork(frame,chainId,now) && frame.blocks?.some(block=>Number(block.height)===observation.height && sameHash(block.hash,observation.blockHash) && block.transaction_hashes?.some((id:unknown)=>sameHash(id,observation.id))))return false;
  // A receipt may confirm that the index is still behind. Bound that witness;
  // a fresh contradictory record must not stay masked forever after resume.
  return observation.indexWitness!==transactionIndexWitness(indexed) || !observation.receiptCheckedAt || now-observation.receiptCheckedAt>=15000;
}

// A page can miss the replacement while hidden. The bounded live window then
// cannot establish reinclusion; ask the existing read-only receipt RPC instead.
export function reinclusionReceipt(id:string,value:Row,chainId:number,frame:TransactionFrame,previous:TransactionObservation):TransactionObservation|undefined {
  const receipt=value?.result;
  if(value?.chainId!==chainId || value.error || !receipt || !sameHash(receipt.transactionHash,id) || !hash(receipt.blockHash) || !/^0x[\da-f]+$/i.test(receipt.blockNumber || ''))return;
  const included=height(Number(BigInt(receipt.blockNumber)));
  const same= sameHash(previous.blockHash,receipt.blockHash);
  if(included===null || previous.replaced && same)return;
  const block=frame.blocks?.find(row=>Number(row.height)===included);
  if(block && (!sameHash(block.hash,receipt.blockHash) || !Array.isArray(block.transaction_hashes) || !block.transaction_hashes.some((value:unknown)=>sameHash(value,id))))return;
  const quantity=(value:unknown)=>typeof value==='string' && /^0x[\da-f]+$/i.test(value)?BigInt(value).toString():null;
  const gas=quantity(receipt.gasUsed),price=quantity(receipt.effectiveGasPrice),l1=quantity(receipt.l1Fee),operator=quantity(receipt.operatorFee);
  const operatorKnown=operator!==null || (quantity(receipt.operatorFeeScalar)??'0')==='0' && (quantity(receipt.operatorFeeConstant)??'0')==='0';
  const fee=gas!==null && price!==null && operatorKnown && (l1!==null || receipt.type==='0x7e') ? {type:'actual',value:String(BigInt(gas)*BigInt(price)+BigInt(l1||'0')+BigInt(operator||'0'))} : null;
  return {id,height:included,blockHash:receipt.blockHash,replaced:false,invalidated:previous.invalidated || !same,record:{...(same?previous.record:{}),hash:id,block_hash:receipt.blockHash,block_number:included,
    status:receipt.status==='0x1'?'ok':receipt.status==='0x0'?'error':null,result:receipt.status==='0x1'?'success':receipt.status==='0x0'?'execution reverted':'confirmed',
    gas_used:gas,gas_price:price,l1_fee:l1,fee,timestamp:block?.timestamp || (same?previous.record.timestamp:null)}};
}
