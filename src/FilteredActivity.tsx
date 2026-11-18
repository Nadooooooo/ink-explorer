import { useEffect, useState, type ReactNode } from 'react';
import { Download, Info, RefreshCw } from 'lucide-react';
import { API, network } from './network';
import { requestJson, FILTER_TIMEOUT } from './api-request';
import { message, formatMessage, type Locale } from './i18n';
import { activityQuery, validateActivity, downloadCsv, activityCsvHeaders, activityCsvRows, transactionActivityCsvRows, type ActivityFilters } from './activity-data';
import './activity.css';
import { LedgerViewport, LedgerPager } from './LedgerViewport';
import LedgerSkeleton from './LedgerSkeleton';

type Row=Record<string,any>;
export default function FilteredActivity({locale,renderRow,columns,filters,status='',parents=true}:{locale:Locale;renderRow:(item:Row)=>ReactNode;columns?:ReactNode;filters:ActivityFilters;status?:string;parents?:boolean}) {
  const t=(key:string)=>message(locale,key);
  const [cursor,setCursor]=useState<Row>({});
  const [cursorHistory,setCursorHistory]=useState<Row[]>([]);
  const [data,setData]=useState<Row>();
  const [busy,setBusy]=useState(true), [error,setError]=useState(''), [retry,setRetry]=useState(0);
  const query=activityQuery(filters,cursor)+(parents && status ? `&status=${encodeURIComponent(status)}` : '');
  const impossibleTokenStatus=parents&&status==='failed'&&/^ERC-(20|721|1155)$/.test(filters.transaction_types||'');
  useEffect(()=>{
    const controller=new AbortController();
    setBusy(true);setError('');setData(undefined);
    const invalid=validateActivity(filters);
    if(invalid){setBusy(false);setError(invalid);return;}
    if(impossibleTokenStatus){setData({items:[],next_page_params:null});setBusy(false);return;}
    requestJson(`${API}/${parents ? "v1/transactions" : "explorer/advanced-filters"}?${query}`,{signal:controller.signal},FILTER_TIMEOUT)
      .then(value=>{if(!Array.isArray(value?.items))throw new Error(t('invalidApiResponse'));return value;})
      .then(value=>{if(!controller.signal.aborted)setData(value);})
      .catch(e=>{if(!controller.signal.aborted)setError(e.message);})
      .finally(()=>{if(!controller.signal.aborted)setBusy(false);});
    return ()=>controller.abort();
  },[query,retry,impossibleTokenStatus]);
  const move=(next:Row)=>{setBusy(true);setData(undefined);setError('');setCursor(next);};
  const newest=()=>{if(busy||!cursorHistory.length)return;setCursorHistory([]);move({});};
  const previous=()=>{if(busy||!cursorHistory.length)return;const next=cursorHistory.at(-1)!;setCursorHistory(value=>value.slice(0,-1));move(next);};
  const older=()=>{if(busy||error||!data?.next_page_params)return;setCursorHistory(value=>[...value,cursor]);move(data.next_page_params);};
  const count=new Intl.NumberFormat(locale).format(data?.items?.length??0);
  const countLabel=busy?t('loadingRecords'):error?t('unavailable'):formatMessage(locale,'shown',{count});
  if(impossibleTokenStatus)return <section className="filtered-semantic-note" role="status"><span className="filtered-semantic-icon"><Info size={19} aria-hidden="true"/></span><p>{t('Failed transactions cannot emit token transfer events. Choose Contract interaction to find failed token calls.')}</p></section>;
  return <section className="filtered-activity">
    <div className="table-shell" aria-busy={busy}>
      <div className="table-toolbar">
        <span className="filtered-count"><span className="filtered-count-full">{countLabel}</span><span className="filtered-count-compact" aria-hidden="true">{busy?'…':error?'—':count}</span></span>
        <button type="button" className="filtered-export" aria-label={t('exportPage')} title={t('exportPage')} disabled={busy||!data?.items?.length||Boolean(error)} onClick={()=>downloadCsv(`ink-${network.chainId}-filtered-activity.csv`,activityCsvHeaders,parents ? transactionActivityCsvRows(data!.items) : activityCsvRows(data!.items))}><Download aria-hidden="true"/><span>CSV</span></button>
        <LedgerPager t={t} pending={busy} newest={!busy&&cursorHistory.length>0} previous={!busy&&cursorHistory.length>0} older={!busy&&!error&&Boolean(data?.next_page_params)} onNewest={newest} onPrevious={previous} onOlder={older}/>
      </div>
      {error && <div className="activity-error" role="alert"><p>{t(error)}</p><button disabled={busy} onClick={()=>setRetry(value=>value+1)}><RefreshCw/>{t('retry')}</button></div>}
      {busy && <LedgerSkeleton kind="transactions" label={t('loadingRecords')}/>}
      {!busy && <LedgerViewport kind="transactions" label={t('transactions')}>
      {!!data?.items?.length && columns}
      {data?.items?.map((item:Row)=><div key={[item.hash,item.transaction_index,item.internal_transaction_index,item.token_transfer_index,item.token_transfer_batch_index].join(':')}>{renderRow({...item,transaction_hash:item.hash})}</div>)}
      </LedgerViewport>}
      {!busy && !error && !data?.items?.length && <div className="empty">{t(data?.next_page_params ? 'No matching records on this page; continue to the next page.' : 'noRecords')}</div>}
      <div className="pagination ledger-pagination-footer"><span>{formatMessage(locale,'Page {page}',{page:new Intl.NumberFormat(locale).format(cursorHistory.length+1)})}</span><LedgerPager t={t} bottom pending={busy} newest={!busy&&cursorHistory.length>0} previous={!busy&&cursorHistory.length>0} older={!busy&&!error&&Boolean(data?.next_page_params)} onNewest={newest} onPrevious={previous} onOlder={older}/></div>
    </div>
  </section>;
}
