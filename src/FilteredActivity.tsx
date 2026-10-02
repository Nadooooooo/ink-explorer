import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Download, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { API, network } from './network';
import { requestJson, FILTER_TIMEOUT } from './api-request';
import { message, type Locale } from './i18n';
import { activityKeys, activityFilters, activityQuery, validateActivity, downloadCsv, activityCsvHeaders, activityCsvRows, type ActivityFilters } from './activity-data';
import './activity.css';

type Row=Record<string,any>;
function localDate(value?:string){if(!value)return '';const d=new Date(value);return Number.isNaN(+d)?'':new Date(+d-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}
export default function FilteredActivity({locale,renderRow}:{locale:Locale;renderRow:(item:Row)=>ReactNode}) {
  const t=(key:string)=>message(locale,key);
  const [draft,setDraft]=useState<ActivityFilters>(()=>activityFilters(new URLSearchParams(location.search)));
  const [applied,setApplied]=useState<ActivityFilters>(draft);
  const [cursor,setCursor]=useState<Row>({});
  const [data,setData]=useState<Row>();
  const [busy,setBusy]=useState(true), [error,setError]=useState(''), [formError,setFormError]=useState(''), [retry,setRetry]=useState(0);
  const query=activityQuery(applied,cursor);
  useEffect(()=>{
    const controller=new AbortController();
    setBusy(true);setError('');
    const invalid=validateActivity(applied);
    if(invalid){setBusy(false);setError(invalid);return;}
    requestJson(`${API}/explorer/advanced-filters?${query}`,{signal:controller.signal},FILTER_TIMEOUT)
      .then(value=>{if(!Array.isArray(value?.items))throw new Error(t('invalidApiResponse'));return value;})
      .then(value=>{if(!controller.signal.aborted)setData(value);})
      .catch(e=>{if(!controller.signal.aborted)setError(e.message);})
      .finally(()=>{if(!controller.signal.aborted)setBusy(false);});
    return ()=>controller.abort();
  },[query,retry]);
  const persist=(filters:ActivityFilters)=>{
    const url=new URL(location.href);url.searchParams.set('activity','filtered');
    for(const key of activityKeys){url.searchParams.delete(key);if(filters[key])url.searchParams.set(key,filters[key]!);}
    history.replaceState({},'',url.pathname+url.search);
  };
  const submit=(event:FormEvent)=>{
    event.preventDefault();const invalid=validateActivity(draft);setFormError(invalid);if(invalid)return;
    setData(undefined);setCursor({});setApplied({...draft});setRetry(value=>value+1);persist(draft);
  };
  const clear=()=>{setDraft({});setApplied({});setCursor({});setData(undefined);setFormError('');setRetry(value=>value+1);persist({});};
  const field=(key:keyof ActivityFilters,label:string,placeholder='',type='text')=><label><span>{t(label)}</span><input aria-label={t(label)} type={type} value={type==='datetime-local'?localDate(draft[key]):draft[key]||''} placeholder={placeholder} onChange={event=>setDraft(old=>({...old,[key]:type==='datetime-local' && event.target.value?new Date(event.target.value).toISOString():event.target.value}))} autoComplete="off" spellCheck={false}/></label>;
  return <section className="filtered-activity">
    <form className="activity-filter-form" onSubmit={submit}>
      <div className="activity-filter-grid">
        <label><span>{t('activityType')}</span><select aria-label={t('activityType')} value={draft.transaction_types||''} onChange={event=>setDraft(old=>({...old,transaction_types:event.target.value}))}>
          <option value="">{t('allTransactions')}</option><option value="COIN_TRANSFER">{t('nativeTransfer')}</option><option value="CONTRACT_INTERACTION">{t('contractCall')}</option><option value="CONTRACT_CREATION">{t('contractCreation')}</option><option>ERC-20</option><option>ERC-721</option><option>ERC-1155</option>
        </select></label>
        {field('methods','methodSelector','0xa9059cbb')}
        {field('from_address_hashes_to_include','from','0x…')}
        {field('to_address_hashes_to_include','to','0x…')}
        <label><span>{t('addressMatch')}</span><select aria-label={t('addressMatch')} value={draft.address_relation||'and'} onChange={event=>setDraft(old=>({...old,address_relation:event.target.value}))}><option value="and">{t('matchBoth')}</option><option value="or">{t('matchEither')}</option></select></label>
        {field('token_contract_address_hashes_to_include','tokenContract','0x…')}
        {field('age_from','dateFrom','','datetime-local')}{field('age_to','dateTo','','datetime-local')}
        {field('amount_from','minimumAmount','0.01')}{field('amount_to','maximumAmount','1')}
      </div>
      <p>{t('activityUnitsNote')}</p>
      {formError && <p role="alert">{t(formError)}</p>}
      <div className="activity-actions"><button type="submit" className="primary-action">{t('applyFilters')}</button><button type="button" onClick={clear}>{t('resetFilters')}</button></div>
    </form>
    <div className="table-shell" aria-busy={busy}>
      <div className="table-toolbar"><span>{busy?t('loadingRecords'):t('sourceIndex')} · {data?.items?.length??0}</span><button type="button" disabled={busy||!data?.items?.length||Boolean(error)} onClick={()=>downloadCsv(`ink-${network.chainId}-filtered-activity.csv`,activityCsvHeaders,activityCsvRows(data!.items))}><Download/> {t('exportPage')}</button></div>
      {error && <div className="activity-error" role="alert"><p>{t(error)}</p><button disabled={busy} onClick={()=>setRetry(value=>value+1)}><RefreshCw/>{t('retry')}</button></div>}
      {data?.items?.map((item:Row)=><div key={[item.hash,item.transaction_index,item.internal_transaction_index,item.token_transfer_index,item.token_transfer_batch_index].join(':')}>{renderRow({...item,transaction_hash:item.hash})}</div>)}
      {!busy && !error && !data?.items?.length && <div className="empty">{t('noRecords')}</div>}
      <div className="pagination"><button disabled={busy||!Object.keys(cursor).length} onClick={()=>setCursor({})}><ChevronLeft/>{t('newest')}</button><button disabled={busy||!data?.next_page_params} onClick={()=>setCursor(data!.next_page_params)}>{t('older')}<ChevronRight/></button></div>
    </div>
  </section>;
}
