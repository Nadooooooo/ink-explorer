export const activityKeys = ['transaction_types','methods','age_from','age_to','from_address_hashes_to_include','to_address_hashes_to_include','address_relation','amount_from','amount_to','token_contract_address_hashes_to_include'] as const;
export type ActivityFilters = Partial<Record<(typeof activityKeys)[number], string>>;
const address = /^0x[\da-f]{40}$/i;
const allowedTypes = ['COIN_TRANSFER','CONTRACT_INTERACTION','CONTRACT_CREATION','ERC-20','ERC-721','ERC-1155'];
const decimal = /^\d{1,78}(?:\.\d{1,78})?$/;
function compareAmounts(a: string, b: string) {
  const [aw, af=''] = a.split('.'), [bw, bf=''] = b.split('.');
  const places = Math.max(af.length, bf.length);
  const left = BigInt(aw + af.padEnd(places,'0'));
  const right = BigInt(bw + bf.padEnd(places,'0'));
  return left < right ? -1 : left > right ? 1 : 0;
}
export function activityFilters(params: URLSearchParams): ActivityFilters {
  return Object.fromEntries(activityKeys.flatMap(key=>params.get(key)?.trim() ? [[key,params.get(key)!.trim()]] : []));
}
export function validateActivity(filters: ActivityFilters) {
  if(filters.transaction_types && !allowedTypes.includes(filters.transaction_types))return 'Invalid activity type';
  if(filters.methods && !/^0x[\da-f]{8}$/i.test(filters.methods))return 'Use a four-byte method selector';
  for(const key of ['from_address_hashes_to_include','to_address_hashes_to_include','token_contract_address_hashes_to_include'] as const)
    if(filters[key] && !address.test(filters[key]))return 'Use a complete contract or wallet address';
  if(filters.address_relation && !['and','or'].includes(filters.address_relation))return 'Invalid address relation';
  for(const key of ['amount_from','amount_to'] as const)if(filters[key] && !decimal.test(filters[key]))return 'Use nonnegative decimal amounts';
  // Blockscout normalizes native values to ETH and token values by decimals.
  // Its query rejects zero upper bounds and equal bounds; expose that constraint.
  if(filters.amount_to && compareAmounts(filters.amount_to,'0')===0)return 'Maximum amount must be greater than zero';
  if(filters.amount_from && filters.amount_to && compareAmounts(filters.amount_from,filters.amount_to)>=0)return 'Maximum amount must exceed minimum';
  for(const key of ['age_from','age_to'] as const)if(filters[key] && !Number.isFinite(Date.parse(filters[key])))return 'Invalid date';
  if(filters.age_from && filters.age_to && Date.parse(filters.age_from)>Date.parse(filters.age_to))return 'Start date is after end date';
  return '';
}
export function activityQuery(filters: ActivityFilters, cursor?: Record<string, unknown>) {
  const query = new URLSearchParams(filters as Record<string,string>);
  if(filters.methods)query.set('methods',filters.methods.toLowerCase());
  if(filters.from_address_hashes_to_include && filters.to_address_hashes_to_include && !filters.address_relation)query.set('address_relation','and');
  for(const [key,value] of Object.entries(cursor || {}))query.set(key,value == null ? 'null' : String(value));
  return query.toString();
}
export function activityState(item: Record<string, unknown>): 'pending'|'confirmed'|'success'|'failed' {
  if(item.status === 'pending' || item.block_number == null)return 'pending';
  if(item.status === 'success' || item.status === 'ok')return 'success';
  if(item.status === 'awaiting_internal_transactions' || item.status == null)return 'confirmed';
  // API error states may carry a revert reason instead of the literal "error".
  return 'failed';
}
export function csvText(headers: string[], rows: unknown[][]) {
  const cell=(value:unknown)=>{
    let text=value == null ? '' : String(value);
    // Quoting alone does not neutralize spreadsheet formulas in third-party names.
    if(/^[\s]*[=+\-@]|^[\t\r\n]/.test(text))text="'"+text;
    return '"'+text.replaceAll('"','""')+'"';
  };
  return '\ufeff'+[headers,...rows].map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';
}
export function downloadCsv(name: string, headers: string[], rows: unknown[][]) {
  const url=URL.createObjectURL(new Blob([csvText(headers,rows)],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download=name;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function activityCsvRows(items: Record<string,any>[]) {
  return items.map(item=>[item.hash,item.type,item.status,item.block_number,item.timestamp,item.from?.hash,item.to?.hash || item.created_contract?.hash,item.method,item.total?.value ?? item.value,item.total?.decimals ?? item.token?.decimals ?? 18,item.token?.symbol || 'ETH',item.token?.address_hash,item.fee,item.transaction_index,item.internal_transaction_index,item.token_transfer_index,item.token_transfer_batch_index]);
}
export const activityCsvHeaders=['transaction_hash','type','status','block','timestamp','from','to','method','amount_base_units','decimals','asset','token_contract','fee_wei','transaction_index','internal_index','transfer_index','batch_index'];
