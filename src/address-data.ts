const object = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const addressPattern = /^0x[\da-f]{40}$/i;

/** Counts and balances never pass through Number, including when they are zero. */
export function accountInteger(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'bigint' &&
      !(typeof value === 'number' && Number.isSafeInteger(value))) return;
  return /^\d+$/.test(String(value)) ? String(value) : undefined;
}

function checkChain(value: Record<string, any>, chainId: number) {
  if (value.chain_id != null && String(value.chain_id) !== String(chainId))
    throw new Error('invalidApiResponse');
}

export function normalizeAddressProfile(value: unknown, address: string, chainId: number): Record<string, any> {
  if (!object(value) || typeof value.hash !== 'string' || !addressPattern.test(value.hash) ||
      value.hash.toLowerCase() !== address.toLowerCase()) throw new Error('invalidApiResponse');
  checkChain(value, chainId);
  return {...value, coin_balance: accountInteger(value.coin_balance),
    block_number_balance_updated_at: accountInteger(value.block_number_balance_updated_at)};
}

export function normalizeAddressCounters(value: unknown, chainId: number) {
  if (!object(value)) throw new Error('invalidApiResponse');
  checkChain(value, chainId);
  return Object.fromEntries(['transactions_count', 'token_transfers_count', 'gas_usage_count', 'validations_count']
    .map(field => [field, accountInteger(value[field])]));
}

/** This endpoint is an unpaginated inventory, not the paginated Assets tab. */
export function normalizeAddressAssetCount(value: unknown, chainId: number): number {
  if (object(value)) {
    checkChain(value, chainId);
    if (value.next_page_params != null) throw new Error('invalidApiResponse');
  }
  const items = Array.isArray(value) ? value : object(value) ? value.items : undefined;
  if (!Array.isArray(items)) throw new Error('invalidApiResponse');
  const seen = new Set<string>();
  for (const item of items) {
    if (!object(item) || !object(item.token) || typeof item.token.address_hash !== 'string' ||
        !addressPattern.test(item.token.address_hash) || accountInteger(item.value) == null)
      throw new Error('invalidApiResponse');
    checkChain(item.token, chainId);
    const tokenId = item.token_id == null ? '' : accountInteger(item.token_id);
    if (tokenId == null) throw new Error('invalidApiResponse');
    const key = item.token.address_hash.toLowerCase() + ':' + (tokenId === '' ? '' : BigInt(tokenId));
    if (seen.has(key)) throw new Error('invalidApiResponse');
    seen.add(key);
  }
  return items.length;
}
