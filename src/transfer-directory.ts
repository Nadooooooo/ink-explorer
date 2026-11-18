import { activityKeys, activityFilters, activityValidation, type ActivityFilters, type ActivityValidation } from './activity-data';
import { TOKEN_STANDARDS, tokenCursorQuery } from './token-data';
import { normalizeTransactionFilters, type TransactionFilterState } from './transaction-filters';

export function readTransferFilters(search: string): TransactionFilterState {
  const params = new URLSearchParams(search), filters = activityFilters(params);
  if (params.has('type')) filters.transaction_types = params.get('type') || '';
  return normalizeTransactionFilters(filters);
}
export function transferValidation(filters: ActivityFilters): ActivityValidation | null {
  if (filters.transaction_types && !TOKEN_STANDARDS.some(type => type === filters.transaction_types)) return { field:'transaction_types', message:'Invalid activity type' };
  return activityValidation({ ...filters, transaction_types: undefined });
}
export function transferRequest(filters: ActivityFilters, cursor = ''): string {
  const query = new URLSearchParams(cursor);
  for (const key of [...activityKeys, 'type', 'status']) query.delete(key);
  const advanced = Object.keys(filters).some(key => key !== 'transaction_types' && Boolean(filters[key as keyof ActivityFilters]));
  if (advanced) {
    for (const [key,value] of Object.entries(filters)) if (value) query.set(key, key === 'methods' ? value.toLowerCase() : value);
    if (filters.from_address_hashes_to_include && filters.to_address_hashes_to_include && !filters.address_relation) query.set('address_relation','and');
    query.set('transaction_types', filters.transaction_types || TOKEN_STANDARDS.join(','));
  } else if (filters.transaction_types) query.set('type', filters.transaction_types);
  return `/explorer/${advanced ? 'advanced-filters' : 'token-transfers'}${query.size ? `?${query}` : ''}`;
}
export function transferFilterUrl(url: URL, filters: ActivityFilters): string {
  for (const key of [...activityKeys,'type','status']) url.searchParams.delete(key);
  for (const [key,value] of Object.entries(filters)) if (value) url.searchParams.set(key === 'transaction_types' ? 'type' : key,value);
  return url.pathname + url.search;
}
export function normalizeTransfers(data: Record<string,any>, standard?: string) {
  if (!Array.isArray(data?.items)) throw new Error('invalidApiResponse');
  const items = data.items.map((row: Record<string,any>) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('invalidApiResponse');
    return { ...row, transaction_hash: row.transaction_hash || row.hash, log_index: row.log_index ?? row.token_transfer_index };
  });
  if (items.some((row: Record<string,any>) => !/^0x[\da-f]{64}$/i.test(row.transaction_hash || '') || !/^0x[\da-f]{40}$/i.test(row.token?.address_hash || '') || (standard && row.token?.type !== standard))) throw new Error('invalidApiResponse');
  return { ...data, items, next: tokenCursorQuery(data.next_page_params) };
}
