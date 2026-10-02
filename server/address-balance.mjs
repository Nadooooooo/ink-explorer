import { nodeReadiness } from './node-readiness.mjs';

// Index balances near the unsafe tip can disagree with their advertised height.
// Bind the displayed balance to one canonical block hash and retain provenance.
export async function verifyAddressBalance(profile, { rpc, chainId, now = Date.now(), signal }) {
  const unavailable = () => ({ ...profile, balance_check: { status: 'unavailable' } });
  const height = profile?.block_number_balance_updated_at;
  if (!profile || !/^0x[\da-f]{40}$/i.test(profile.hash || '') ||
      !Number.isSafeInteger(height) || height < 0 || !/^\d+$/.test(String(profile.coin_balance ?? '')))
    return unavailable();
  try {
    const [chain, sync, head] = await Promise.all([
      rpc('eth_chainId', [], signal), rpc('eth_syncing', [], signal),
      rpc('eth_getBlockByNumber', ['latest', false], signal),
    ]);
    if (!nodeReadiness({chain, expectedChainId:chainId, sync, block:head, now}).synced || height > Number(head.number))
      return unavailable();
    const block = await rpc('eth_getBlockByNumber', ['0x'+height.toString(16), false], signal);
    if (!/^0x[\da-f]{64}$/i.test(block?.hash || '') || Number(block.number) !== height)
      return unavailable();
    const balance = await rpc('eth_getBalance', [profile.hash, {blockHash:block.hash, requireCanonical:true}], signal);
    if (!/^0x[\da-f]+$/i.test(balance || '')) return unavailable();
    const coin_balance = BigInt(balance).toString();
    return {...profile, coin_balance, balance_check:{
      status:BigInt(profile.coin_balance) === BigInt(balance) ? 'matched' : 'corrected',
      indexed_balance:String(profile.coin_balance), block_number:height, block_hash:block.hash,
      source:'local', checked_at:new Date(now).toISOString(),
    }};
  } catch { return unavailable(); }
}
