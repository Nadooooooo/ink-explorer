import { activityFilters, type ActivityFilters } from './activity-data';

export type TransactionFilterState = { filters: ActivityFilters; status: string };
export function normalizeTransactionFilters(filters: ActivityFilters, status = ''): TransactionFilterState {
  const clean = activityFilters(new URLSearchParams(Object.entries(filters).filter((entry): entry is [string,string] => typeof entry[1] === 'string')));
  if (!clean.from_address_hashes_to_include || !clean.to_address_hashes_to_include) delete clean.address_relation;
  return { filters: clean, status: status.trim() };
}
export function readTransactionFilters(search: string): TransactionFilterState {
  const params = new URLSearchParams(search);
  return normalizeTransactionFilters(activityFilters(params), params.get('status') || '');
}
export function transactionFilterCount({ filters, status }: TransactionFilterState): number {
  return Object.entries(filters).filter(([key, value]) => key !== 'address_relation' && Boolean(value)).length + Number(Boolean(status));
}
