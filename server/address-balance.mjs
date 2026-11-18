import {createCurrentAddressBalance} from './current-address-balance.mjs';

// Profile metadata comes from the index; its ETH balance comes from a current
// canonical head, even if the index last recorded a change much earlier.
export async function verifyAddressBalance(profile, { rpc, chainId, now = Date.now(), signal, currentBalance }) {
  const unavailable = () => ({ ...profile, coin_balance:null,block_number_balance_updated_at:null,balance_check: { status: 'unavailable',indexed_balance:profile?.coin_balance ?? null,indexed_block_number:profile?.block_number_balance_updated_at ?? null } });
  if (!profile || !/^0x[\da-f]{40}$/i.test(profile.hash || ''))
    return unavailable();
  try {
    signal?.throwIfAborted();
    const observation=await (currentBalance || createCurrentAddressBalance({rpc,chainId,now:()=>now}))(profile.hash);
    signal?.throwIfAborted();
    const coin_balance=observation.balance;
    return {...profile, coin_balance, block_number_balance_updated_at:observation.block.number, balance_check:{
      status:String(profile.coin_balance)===coin_balance ? 'matched' : 'corrected',scope:'head',
      indexed_balance:profile.coin_balance ?? null,indexed_block_number:profile.block_number_balance_updated_at ?? null,
      block_number:observation.block.number,block_hash:observation.block.hash,block_timestamp:observation.block.timestamp,
      source:observation.source,checked_at:observation.observedAt,
    }};
  } catch { return unavailable(); }
}
