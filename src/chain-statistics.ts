type ChainFrame = {
  connected: boolean;
  sentAt?: string;
  network?: Record<string, any>;
  block?: Record<string, any>;
};

// A canonical chain includes genesis (height 0). This is a node observation,
// not the indexer's periodically calculated totalBlocks aggregate.
export function canonicalBlockCount(frame: ChainFrame | undefined, chainId: number): number | null {
  const network = frame?.network, block = frame?.block;
  if (!frame?.connected || network?.online !== true || network.synced !== true || network.stale === true || network.chainId !== chainId || network.expectedChainId !== chainId) return null;
  const height = block?.height;
  if (!Number.isSafeInteger(height) || height < 0 || !Number.isSafeInteger(height + 1) || network.head !== height || !/^0x[\da-f]{64}$/i.test(block?.hash || '')) return null;
  // Compare server timestamps so a user's incorrect device clock cannot alter
  // the result. The transport separately expires silent/disconnected feeds.
  const sent = Date.parse(frame.sentAt || ''), observed = Date.parse(block?.timestamp || '');
  if (!Number.isFinite(sent) || !Number.isFinite(observed) || sent - observed > 120_000 || observed - sent > 5_000) return null;
  return height + 1;
}
