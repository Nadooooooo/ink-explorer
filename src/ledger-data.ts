import { tokenCursorQuery } from './token-data';
export type LedgerPage='accounts'|'internal-txs'|'deposits'|'withdrawals';
export const ledgerPaths:Record<LedgerPage,string>={accounts:'addresses','internal-txs':'internal-transactions',deposits:'optimism/deposits',withdrawals:'optimism/withdrawals'};
export const ledgerTitles:Record<LedgerPage,string>={accounts:'Top accounts','internal-txs':'Internal transactions',deposits:'L1 → L2 deposits',withdrawals:'L2 → L1 withdrawals'};
export function ledgerInteger(value:unknown):bigint|undefined {
  if(typeof value==='number'&&(!Number.isSafeInteger(value)||value<0))return;
  if(!['string','number','bigint'].includes(typeof value)||!/^\d+$/.test(String(value)))return;
  return BigInt(String(value));
}
export function ledgerNumber(value:unknown,locale:string):string {const integer=ledgerInteger(value);return integer==null?'N/A':new Intl.NumberFormat(locale).format(integer);}
export function ledgerAggregate(items:Record<string,any>[],key:string,average=false):string|undefined {
  if(!items.length)return;
  const values=items.map(item=>ledgerInteger(item[key]));if(values.some(v=>v==null))return;
  const sum=values.reduce<bigint>((sum,v)=>sum+v!,0n),count=BigInt(items.length);
  return (average?(sum+count/2n)/count:sum).toString();
}
export function normalizeLedger(page:LedgerPage,data:Record<string,any>){
  if(!Array.isArray(data?.items))throw new Error('invalidApiResponse');
  const key=page==='accounts'?'hash':page==='internal-txs'?'transaction_hash':'l2_transaction_hash',pattern=page==='accounts'?/^0x[\da-f]{40}$/i:/^0x[\da-f]{64}$/i;
  if(data.items.some((item:any)=>!item||typeof item!=='object'||!pattern.test(item[key]||'')))throw new Error('invalidApiResponse');
  return {...data,items:data.items as Record<string,any>[],next:tokenCursorQuery(data.next_page_params)};
}
const address=(value:any)=>typeof value==='string'?value:value?.hash;
export function ledgerCsv(page:LedgerPage,items:Record<string,any>[],offset=0){
  const fields:Record<LedgerPage,string[]>={
    accounts:['rank','address','coin_balance_wei','transactions_count'],
    'internal-txs':['transaction_hash','index','type','success','error','block_number','timestamp','from','to','value_wei'],
    deposits:['l1_block_number','l2_transaction_hash','l1_block_timestamp','l1_transaction_hash','l1_transaction_origin','l2_transaction_gas_limit'],
    withdrawals:['msg_nonce','msg_nonce_raw','from','l2_transaction_hash','l2_timestamp','msg_target_address_hash','msg_value_wei','status','l1_transaction_hash'],
  };
  return {headers:fields[page],rows:items.map((item,i)=>fields[page].map(key=>key==='rank'?offset+i+1:key==='address'?item.hash:key.endsWith('_wei')?item[key.slice(0,-4)]:key==='from'||key==='to'?address(item[key]||(key==='to'?item.created_contract:undefined)):item[key]))};
}
