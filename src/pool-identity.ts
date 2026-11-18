const ADDRESS = /^0x[\da-f]{40}$/i;
const POOL_ID = /^0x(?:[\da-f]{40}|[\da-f]{64})$/i;
type Pool = Record<string, unknown>;

export function validPoolMarket(pool: unknown, id: string, chainId: number): pool is Pool {
  if (!POOL_ID.test(id) || !pool || typeof pool !== "object") return false;
  const market = pool as Pool;
  return typeof market.pool_id === "string" && market.pool_id.toLowerCase() === id.toLowerCase()
    && (market.chain_id == null || Number(market.chain_id) === chainId);
}

export function poolContractAddress(pool: Pool | undefined, id: string): string | undefined {
  // A singleton manager's activity/counters aggregate multiple markets. Never
  // label that activity as this pool's, or reinterpret bytes32 as an address.
  if (!pool || !ADDRESS.test(id) || pool.is_contract === false) return undefined;
  const address = pool.contract_address ?? id;
  return typeof address === "string" && ADDRESS.test(address) && address.toLowerCase() === id.toLowerCase() ? address : undefined;
}
