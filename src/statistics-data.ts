import {counterTitle} from './counter-titles';

export const STATISTICS_INTERVAL=30_000;
// Bounds the age of the source response, not the indexer's internal aggregation.
// Allow one 30 s polling interval, the 20 s deadline, and the API's 15 s cache.
export const STATISTICS_MAX_AGE=90_000;
export type Counter={id:string;title:string;description:string;units?:string;value:string|number|null};
export type Counters={counters:Counter[]};
export type GasEstimate={gwei:number|null;seconds:number|null};
export type GasOracle={updatedAt:string;estimates:Record<'slow'|'average'|'fast',GasEstimate>};
export type CurrentSnapshot<T>={data:T;expiresAt:number};
const object=(value:unknown):value is Record<string,any>=>!!value&&typeof value==='object'&&!Array.isArray(value);

export function statisticNumber(value:unknown):number|null {
  if(typeof value!=='number'&&typeof value!=='string')return null;
  if(typeof value==='string'&&!/^\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(value))return null;
  const number=Number(value);
  if(number===0&&/[1-9]/.test(String(value).split(/[eE]/)[0]))return null;
  return Number.isFinite(number)&&number>=0?number:null;
}

export function normalizeCounters(value:unknown):Counters {
  if(!object(value)||!Array.isArray(value.counters)||!value.counters.length)throw new Error('invalidApiResponse');
  const seen=new Set<string>();
  const counters=value.counters.map((row:unknown)=>{
    if(!object(row)||typeof row.id!=='string'||!row.id||seen.has(row.id)||typeof row.title!=='string'||!row.title||typeof row.description!=='string'||(row.units!=null&&typeof row.units!=='string'))throw new Error('invalidApiResponse');
    seen.add(row.id);
    const numeric=statisticNumber(row.value),valid=numeric!==null&&(!!row.units||Number.isInteger(numeric));
    return {id:row.id,title:counterTitle(row.id,row.title),description:row.description,units:row.units??undefined,value:valid?row.value:null} as Counter;
  });
  return {counters};
}

export function normalizeGasOracle(value:unknown):GasOracle {
  if(!object(value)||!object(value.gas_prices)||typeof value.gas_price_updated_at!=='string'||!Number.isFinite(Date.parse(value.gas_price_updated_at)))throw new Error('invalidApiResponse');
  const estimates=Object.fromEntries((['slow','average','fast'] as const).map(speed=>{
    const raw=value.gas_prices[speed];
    const hasWei=object(raw)&&raw.wei!=null;
    const price=hasWei&&!/^\d+$/.test(String(raw.wei))?null:object(raw)?statisticNumber(hasWei?raw.wei:raw.price):statisticNumber(raw);
    const time=object(raw)?statisticNumber(raw.time):null;
    return [speed,{gwei:price===null?null:object(raw)&&raw.wei!=null?price/1e9:price,seconds:time===null?null:time/1000}];
  })) as GasOracle['estimates'];
  return {updatedAt:value.gas_price_updated_at,estimates};
}

export function snapshotExpiry(headers:Headers,now:number,updatedAt?:string):number {
  const fetched=Date.parse(headers.get('x-ink-data-fetched-at')||'');
  const server=Date.parse(headers.get('date')||'');
  const reference=Number.isFinite(server)?server:now;
  if(headers.get('x-ink-data-status')!=='fresh'||!Number.isFinite(fetched))throw new Error('Data source unavailable');
  const stamps=updatedAt?[fetched,Date.parse(updatedAt)]:[fetched];
  if(stamps.some(stamp=>!Number.isFinite(stamp)||stamp-reference>5000||reference-stamp>=STATISTICS_MAX_AGE))throw new Error('Data source unavailable');
  return now+STATISTICS_MAX_AGE-Math.max(0,...stamps.map(stamp=>reference-stamp));
}
