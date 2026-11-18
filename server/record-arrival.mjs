import {recordRoute,recordSourceMaxAge,validRecordData,validRecordIndexing,recordOverview} from '../src/record-arrival.ts';
import {message} from '../src/i18n.ts';

export const RECORD_DOCUMENT_TIMEOUT=2500;
export const PROFILE_DOCUMENT_TIMEOUT=4000;
const MAX_BYTES=512*1024;
export const escapeRecordHtml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const serializeRecord=value=>JSON.stringify(value).replace(/[<>&\u2028\u2029]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));
async function readBounded(response,signal){
  if(Number(response.headers.get('content-length'))>MAX_BYTES)throw new Error('Record too large');
  const reader=response.body?.getReader();if(!reader)throw new Error('No record body');
  const chunks=[];let length=0;
  const abort=()=>void reader.cancel().catch(()=>{});signal.addEventListener('abort',abort,{once:true});
  try{for(;;){signal.throwIfAborted();const {done,value}=await reader.read();signal.throwIfAborted();if(done)break;length+=value.byteLength;if(length>MAX_BYTES)throw new Error('Record too large');chunks.push(value);}
    const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return JSON.parse(new TextDecoder().decode(bytes));
  }finally{signal.removeEventListener('abort',abort);await reader.cancel().catch(()=>{});}
}
export async function loadRecordArrival(route,env,{fetcher=fetch,timeout}={}){
  const record=recordRoute(route.pathname);if(!record)return null;
  const basePath=route.basePath||'',chainId=basePath?763373:57073;
  const result={schema:1,...record,chainId,issuedAt:Date.now(),phase:'unavailable'};
  if(!env.API_ORIGIN||!env.ORIGIN_TOKEN)return result;
  const deadline=timeout??(['address','token'].includes(record.kind)?PROFILE_DOCUMENT_TIMEOUT:RECORD_DOCUMENT_TIMEOUT);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),deadline);
  try{
    const endpoint={block:'blocks',transaction:'transactions',address:'addresses',token:'tokens'}[record.kind];
    const accept=record.kind==='block'?'application/vnd.ink.indexing+json, application/json':record.kind==='transaction'?'application/vnd.ink.transaction-indexing+json, application/json':'application/json';
    // Workers supports manual/follow only. Never follow an authenticated
    // origin redirect; the status allowlist below rejects every 3xx response.
    const response=await fetcher(env.API_ORIGIN+basePath+'/api/explorer/'+endpoint+'/'+record.id,{headers:{'x-ink-origin-token':env.ORIGIN_TOKEN,accept},redirect:'manual',signal:controller.signal});
    if(![200,202].includes(response.status)){await response.body?.cancel();return result;}
    const value=await readBounded(response,controller.signal);
    if(response.status===202&&validRecordIndexing(record.kind,record.id,chainId,value))return {...result,issuedAt:Date.now(),phase:'indexing',data:value};
    if(response.status!==200||response.headers.get('x-ink-data-status')!=='fresh'||!validRecordData(record.kind,record.id,value,chainId))return result;
    const sourceAt=response.headers.get('x-ink-data-fetched-at');
    if(!sourceAt||!Number.isFinite(Date.parse(sourceAt))||Date.parse(sourceAt)>Date.now()+1000||Date.now()-Date.parse(sourceAt)>=recordSourceMaxAge(record.kind))return result;
    return {...result,issuedAt:Date.now(),sourceAt,phase:'ready',data:value};
  }catch{return result;}finally{clearTimeout(timer);controller.abort();}
}
export function renderRecordArrival(arrival,language,basePath=''){
  const t=key=>message(language,key),model=recordOverview(arrival,language,t,basePath),e=escapeRecordHtml;
  const header=`<section class="detail-header record-arrival-header"><div><h1>${e(model.title)}</h1></div>${model.identifier?`<p class="mono"><bdi dir="ltr">${e(model.identifier)}</bdi></p>`:''}</section>`;
  const rows=model.rows.map(row=>`<div class="definition wide"><dt>${e(row.label)}</dt><dd${row.identifier?' class="mono"':''}>${row.href?`<a class="text-link" href="${e(row.href)}">`:''}<bdi${row.identifier?' dir="ltr"':''}>${e(row.value)}</bdi>${row.href?'</a>':''}</dd></div>`).join('');
  const label=arrival.phase==='indexing'?t(arrival.kind==='block'?'blockIndexingTitle':'Transaction indexing in progress'):t('Data source unavailable');
  return `<div class="record-arrival" data-record-kind="${arrival.kind}" data-record-phase="${arrival.phase}">${header}${rows?`<dl class="definitions standalone">${rows}</dl>${model.sourceAt?`<p class="record-observation">${e(t('Observation'))} · ${e(model.sourceAt)}</p>`:''}`:`<p class="record-arrival-status" role="status">${e(label)}</p>`}</div>`;
}
export function fillRecordShell(snapshot,arrival,language,basePath=''){
  const marker='<main id="main-content" tabindex="-1" data-record-shell=""></main>';
  if(typeof snapshot?.html!=='string'||!snapshot.html.includes(marker)||snapshot.kind!==arrival.kind||snapshot.language!==language||snapshot.network!==(basePath?'sepolia':'mainnet')||!Array.isArray(snapshot.styles))return null;
  return {html:snapshot.html.replace(marker,()=>`<main id="main-content" tabindex="-1" data-initial-record="${arrival.kind}">${renderRecordArrival(arrival,language,basePath)}</main>`),styles:snapshot.styles};
}
