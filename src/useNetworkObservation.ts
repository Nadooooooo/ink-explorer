import { useEffect, useState } from 'react';
import { currentNetworkObservation, networkObservationMaxAge, type NetworkObservationFrame } from './network-observation';

export function useNetworkObservation(frame: NetworkObservationFrame, chainId: number) {
  const [, invalidate] = useState(0);
  const observation = currentNetworkObservation(frame, chainId);
  useEffect(() => {
    if (!observation) return;
    const remaining = Date.parse(observation.sampledAt) + networkObservationMaxAge - Date.now();
    const timer = window.setTimeout(() => invalidate(value => value + 1), Math.max(1, remaining + 1));
    return () => clearTimeout(timer);
  }, [observation]);
  return observation;
}
