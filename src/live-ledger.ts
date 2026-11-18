type Row = Record<string, any>;
export type CanonicalObservation = { hash: string; height: number; canonicalHash: string };

// Remember a witnessed replacement after it leaves the short live window.
// A stale/disconnected feed cannot change the identity of an open block.
export function observeBlockCanonicality(block: Row | undefined, live: { connected: boolean; network?: Row; blocks?: Row[] }, previous?: CanonicalObservation): CanonicalObservation | undefined {
  const hash = typeof block?.hash === "string" ? block.hash.toLowerCase() : "";
  const height = Number(block?.height);
  if (!/^0x[\da-f]{64}$/.test(hash) || !Number.isSafeInteger(height) || height < 0) return undefined;
  const retained = previous?.hash === hash && previous.height === height ? previous : undefined;
  if (!isCurrentNetwork(live) || !Number.isSafeInteger(live.network?.expectedChainId) || live.network?.chainId !== live.network?.expectedChainId) return retained;
  const current = live.blocks?.find(row => Number(row.height) === height);
  const canonicalHash = typeof current?.hash === "string" ? current.hash.toLowerCase() : "";
  if (!/^0x[\da-f]{64}$/.test(canonicalHash)) return retained;
  return retained?.canonicalHash === canonicalHash ? retained : { hash, height, canonicalHash };
}

export function isCurrentNetwork(live?: { connected: boolean; network?: Row }): boolean {
  return live?.connected === true && live.network?.online === true && live.network.synced === true && live.network.stale !== true;
}
const equal=(a:Row | undefined,b:Row)=>a===b || !!a && !!b && Object.keys(a).length===Object.keys(b).length && Object.keys(a).every(key=>a[key]===b[key]);
const entityAddress=(value:any)=>{
  const hash=typeof value==='string' ? value : value?.hash;
  return typeof hash==='string' && /^0x[\da-f]{40}$/i.test(hash) ? hash.toLowerCase() : null;
};

// A raw RPC address adds no identity metadata. Merge enrichment only for the
// same account; explicit names/proxy lists can still be replaced by the index.
function mergeIdentity(previous:any,incoming:any) {
  const address=entityAddress(incoming);
  if(!address || address!==entityAddress(previous))return incoming;
  if(typeof incoming==='string')return previous;
  if(typeof previous==='string')return incoming;
  const fields=Object.fromEntries(Object.entries(incoming).filter(([key,value])=>value!==undefined && !(value===null && ['is_contract','is_verified'].includes(key))));
  const merged={...previous,...fields};
  return equal(previous,merged)?previous:merged;
}

// Index metadata complements node receipts. Unknown values never erase known
// contract names, while a canonical replacement removes the orphaned rows.
export function mergeLiveTransactions(current: Row[], incoming: Row[], blocks: Row[], limit = 50): Row[] {
  const canonical = new Map(blocks.map(block => [Number(block.height), block.hash]));
  const rows = new Map<string, Row>();
  for (const item of current) {
    if (!item.hash) continue;
    const hash = canonical.get(Number(item.block_number));
    if (hash && item.block_hash && hash !== item.block_hash) continue;
    // Recent upstream rows without a hash are verified against the node's full
    // transaction-hash set, including blocks with more than the visible limit.
    const block = blocks.find(b => Number(b.height) === Number(item.block_number));
    if (block?.transaction_hashes && !block.transaction_hashes.includes(item.hash)) continue;
    rows.set(item.hash, item);
  }
  for (const item of incoming) {
    const block=blocks.find(block=>Number(block.height)===Number(item.block_number));
    if(block && (item.block_hash && item.block_hash!==block.hash || block.transaction_hashes && !block.transaction_hashes.includes(item.hash))) continue;
    const previous = rows.get(item.hash);
    if (!previous) { rows.set(item.hash, item); continue; }
    const merged = { ...previous };
    for (const [key,value] of Object.entries(item)) if (value != null && !(Array.isArray(value) && !value.length)) merged[key] = value;
    for (const key of ["from", "to", "created_contract"]) if (item[key]) merged[key]=mergeIdentity(previous[key],item[key]);
    if (previous.method && /^0x|contract call|transfer$/.test(item.method || "")) merged.method = previous.method;
    rows.set(item.hash, previous && equal(previous,merged)?previous:merged);
  }
  return [...rows.values()].sort((a,b) => Number(b.block_number) - Number(a.block_number) || Number(b.position || 0) - Number(a.position || 0)).slice(0, limit);
}

export function mergeLiveBlocks(current: Row[], incoming: Row[], limit = 50): Row[] {
  const original = new Map(current.map(item => [Number(item.height), item]));
  const rows = new Map(original);
  const identities=new Map<string,Row>();
  // This map is scoped to the current page/chain and recent records. Newly
  // received blocks can use an indexed name for the same beneficiary.
  for(const block of [...current,...incoming]){
    const address=entityAddress(block.miner);
    if(address && typeof block.miner==='object')identities.set(address,mergeIdentity(identities.get(address),block.miner));
  }
  for (const item of incoming) {
    const previous = rows.get(Number(item.height));
    const merged=previous?.hash === item.hash ? {...previous,...Object.fromEntries(Object.entries(item).filter(([,value])=>value!=null))}:item;
    rows.set(Number(item.height),previous && equal(previous,merged)?previous:merged);
  }
  return [...rows.values()].sort((a,b) => Number(b.height) - Number(a.height)).slice(0,limit).map(block=>{
    const address=entityAddress(block.miner),known=address ? identities.get(address) : undefined;
    if(!known)return block;
    const miner=mergeIdentity(known,block.miner);
    const enriched=miner===block.miner ? block : {...block,miner};
    const previous=original.get(Number(block.height));
    return previous && equal(previous,enriched) ? previous : enriched;
  });
}

export function applyLiveFrame(previous: Row, frame: Row): {blocks:Row[];transactions:Row[]} {
  if (!frame.delta) return {blocks:frame.blocks || [],transactions:frame.transactions || []};
  const current = frame.reset ? {blocks:[],transactions:[]} : previous;
  const head = Number(frame.block?.height), first = Number(frame.window?.fromBlock);
  const blocks=mergeLiveBlocks(current.blocks || [],frame.blocks || [],30).filter(b=>b.height<=head && (!Number.isFinite(first) || b.height>=first));
  const transactions=mergeLiveTransactions(current.transactions || [],frame.transactions || [],blocks,150).filter(tx=>Number(tx.block_number)<=head && (!Number.isFinite(first) || Number(tx.block_number)>=first));
  return {blocks,transactions};
}
