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

// Execution can follow the sequencer while independent L1 derivation is stuck.
// Keep both signals: head reads still work, but overall health is degraded.
export function rollupReadiness(rollup, now = Date.now()) {
  const current = rollup?.current_l1?.number;
  const head = rollup?.head_l1?.number;
  const timestamp = rollup?.current_l1?.timestamp;
  const headTimestamp = rollup?.head_l1?.timestamp;
  const online = [current, head, timestamp, headTimestamp].every(value => Number.isSafeInteger(value) && value > 0);
  const lag = online ? Math.max(0, head - current) : null;
  const age = online ? Math.max(0, headTimestamp - timestamp) : null;
  const headAge = online ? Math.floor(now / 1000) - headTimestamp : null;
  const currentAge = online ? Math.floor(now / 1000) - timestamp : null;
  const hash = value => typeof value === 'string' && /^0x[\da-f]{64}$/i.test(value);
  // OP Node's perceived L1 head may lag the derivation cursor by one block.
  // Accept that only with an explicit parent link; a reset/fork is not proof
  // of readiness. Keep the raw observed heights instead of inventing a head.
  const adjacent = current === head + 1 && hash(rollup?.head_l1?.hash) &&
    hash(rollup?.current_l1?.hash) && hash(rollup?.current_l1?.parentHash) &&
    rollup.current_l1.parentHash.toLowerCase() === rollup.head_l1.hash.toLowerCase() &&
    rollup.current_l1.hash.toLowerCase() !== rollup.head_l1.hash.toLowerCase() && timestamp > headTimestamp;
  const sameBlock = current !== head || !hash(rollup?.current_l1?.hash) ||
    !hash(rollup?.head_l1?.hash) || rollup.current_l1.hash.toLowerCase() === rollup.head_l1.hash.toLowerCase();
  const coherent = online && sameBlock && ((current <= head && timestamp <= headTimestamp) || adjacent);
  // An L1 block spans roughly 12 seconds. Allow batching, skipped slots and
  // temporary API delay; thousands of unprocessed blocks must remain visible.
  return { online, synced: coherent && headAge >= -30 && headAge <= 1800 && currentAge >= -30 && age <= 1800 && lag <= 150, l1Block: current ?? null, l1Head: head ?? null, lag, ageSeconds: age };
}
