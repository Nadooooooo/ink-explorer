import {requestJson} from './api-request';
import {API} from './network';
import {normalizeCounters,normalizeGasOracle,snapshotExpiry,type CurrentSnapshot} from './statistics-data';

async function readSnapshot<T>(path:string,normalize:(value:unknown)=>T,signal:AbortSignal,updatedAt?:(value:T)=>string):Promise<CurrentSnapshot<T>> {
  let snapshot:CurrentSnapshot<T>|undefined;
  const started=performance.now();
  await requestJson(`${API}${path}`,{signal},undefined,'object',(value,_status,headers)=>{
    const data=normalize(value);
    snapshot={data,expiresAt:snapshotExpiry(headers,Date.now(),updatedAt?.(data))-Math.max(0,performance.now()-started)};
  });
  return snapshot!;
}
export const readCounters=(signal:AbortSignal)=>readSnapshot('/stats/counters',normalizeCounters,signal);
export const readGasOracle=(signal:AbortSignal)=>readSnapshot('/explorer/stats?gas_oracle=updated',normalizeGasOracle,signal,value=>value.updatedAt);

// Current chart and overview snapshots use the same source-age boundary as counters.
export const readCurrentJson=<T=any>(path:string,signal:AbortSignal)=>readSnapshot<T>(path,value=>value as T,signal);
