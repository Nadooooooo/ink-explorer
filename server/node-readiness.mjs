// A reachable RPC reporting eth_syncing=false may still be stranded on an old
// head. Both the status page and contract reads must reject that stale state.
export function nodeReadiness({ chain, expectedChainId, sync, block, now = Date.now() }) {
  const number = value => value == null || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
  const head = number(block?.number);
  const timestamp = number(block?.timestamp);
  const blockAgeSeconds = timestamp === null ? null : Math.floor(now / 1000) - timestamp;
  const online = head !== null && number(chain) === expectedChainId;
  const fresh = blockAgeSeconds !== null && blockAgeSeconds >= -30 && blockAgeSeconds <= 120;
  const stale = online && sync === false && head > 0 && !fresh;
  return { online, synced: online && sync === false && head > 0 && fresh, stale, head, blockAgeSeconds };
}
