type Row = Record<string, any>;
export type NetworkObservationFrame = { connected: boolean; network?: Row };
export const networkObservationMaxAge = 15000;

// A recent report that the node is behind is still a valid health observation.
// A lost transport or an undated report cannot establish its current health.
export function currentNetworkObservation(frame: NetworkObservationFrame, chainId: number, now = Date.now()): Row | null {
  const value = frame.network;
  if (!frame.connected || !value || value.expectedChainId !== chainId) return null;
  if (value.chainId !== chainId && !(value.chainId == null && value.online === false)) return null;
  if (typeof value.sampledAt !== 'string') return null;
  const sampled = Date.parse(value.sampledAt);
  if (!Number.isFinite(sampled) || sampled > now + 30000 || now - sampled > networkObservationMaxAge) return null;
  return value;
}
