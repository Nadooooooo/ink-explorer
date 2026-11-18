import {validRecordArrival,type RecordArrival,type RecordKind} from './record-arrival';
import {normalizeAddressProfile} from './address-data';
import {normalizeTokenProfile} from './token-data';
import {STATISTICS_MAX_AGE,type CurrentSnapshot} from './statistics-data';
let snapshot:unknown;
let read=false;
export function initialRecord(kind:RecordKind,id:string,chainId:number):RecordArrival|undefined {
  // Parse once per document. Each read checks the requested record, chain and
  // the age of the embedded observation.
  if(!read){read=true;try{snapshot=JSON.parse(document.getElementById('ink-initial-record')?.textContent||'null');}catch{snapshot=null;}}
  return validRecordArrival(snapshot,kind,id,chainId)?snapshot:undefined;
}

/** The document is a short-lived first observation, never a reusable profile cache. */
export function initialProfile(kind:'address'|'token',id:string,chainId:number):CurrentSnapshot<Record<string,any>>|undefined {
  if(document.hidden||navigator.onLine===false)return;
  const seed=initialRecord(kind,id,chainId);
  if(seed?.phase!=='ready'||!seed.sourceAt)return;
  try{return {data:(kind==='address'?normalizeAddressProfile:normalizeTokenProfile)(seed.data,id,chainId),expiresAt:Date.parse(seed.sourceAt)+STATISTICS_MAX_AGE};}catch{return;}
}
