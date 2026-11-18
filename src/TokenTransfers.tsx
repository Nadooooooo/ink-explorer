import { cloneElement, useEffect, useState } from 'react';
import { LedgerScroll } from './LedgerViewport';
import { IndexedUpdates } from './IndexedUpdates';
import { Download } from 'lucide-react';
import { TransactionFilters } from './TransactionFilters';
import { normalizeTransactionFilters } from './transaction-filters';
import { downloadCsv } from './activity-data';
import { readTransferFilters, transferValidation, transferRequest, transferFilterUrl, normalizeTransfers } from './transfer-directory';
import { CursorPagination, useCursorPages } from './CursorPagination';
import { EntityMark } from './EntityMark';
import { TokenMark } from './TokenMark';
import { TransferNfts } from './TransferNfts';
import { transferNfts } from './transfer-data';
import { LiveAge } from './LiveAge';
import { ExplorerLink } from './ExplorerLink';
import { formatChainAmount } from './explorer-data';
import { tokenFiatValue, tokenUsd } from './token-data';
import {UsdValue} from './UsdValue';
import { formatMessage, type Locale } from './i18n';
import type { ExplorerPageProps } from './ExplorerPages';

type Row=Record<string,any>;
const address=(value:any)=>typeof value==='string'?value:value?.hash;
const short=(value:string)=>`${value.slice(0,7)}…${value.slice(-5)}`;
const name=(value:Row)=>value?.ens_domain_name || value?.metadata?.tags?.find((tag:Row)=>tag.tagType==='name')?.name || value?.implementations?.find((item:Row)=>item.name)?.name || value?.name;

export default function TokenTransfers(props:ExplorerPageProps & {locale:Locale}) {
  const {t,locale,get}=props;
  const [state,setState]=useState(()=>readTransferFilters(location.search)),[navigation,setNavigation]=useState(0),[retry,setRetry]=useState(0);
  const [data,setData]=useState<Row>(),[error,setError]=useState('');
  const pages=useCursorPages(JSON.stringify([state.filters,navigation])),path=transferRequest(state.filters,pages.query),invalid=transferValidation(state.filters);
  useEffect(()=>{
    const restore=()=>{if(!location.pathname.endsWith('/token-transfers'))return;setState(readTransferFilters(location.search));setNavigation(n=>n+1);};
    addEventListener('popstate',restore);return()=>removeEventListener('popstate',restore);
  },[]);
  useEffect(()=>{history.replaceState({},'',transferFilterUrl(new URL(location.href),state.filters));},[state]);
  useEffect(()=>{
    const controller=new AbortController();setData(undefined);setError('');
    if(invalid){setError(invalid.message);return()=>controller.abort();}
    get(path,controller.signal).then(value=>{const next=normalizeTransfers(value,state.filters.transaction_types);if(!controller.signal.aborted)setData(next);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});
    return()=>controller.abort();
  },[path,retry,invalid?.message,navigation]);
  const items:Row[]=data?.items||[],pending=!data&&!error;
  const pager=<CursorPagination page={pages.page} previous={pages.previous} next={()=>pages.next(data!.next_page_params)} hasNext={!!data?.next&&data.next!==pages.query} pending={pending}/>;
  const identity=(value:any)=>{
    const hash=address(value),label=name(value);if(!/^0x[\da-f]{40}$/i.test(hash||''))return <span>N/A</span>;
    return <span className={`transfer-address${label?' named':''}`}><EntityMark address={hash} entity={typeof value==='object'?value:undefined}/>{props.identity(hash,`/address/${hash}`,label||short(hash))}</span>;
  };
  const exportPage=()=>downloadCsv('ink-token-transfers.csv',[
    'transaction_hash','timestamp','block','method','from','to','token_contract','token_symbol','token_standard','amount_base_units','decimals','nft_ids','nft_quantities','log_index','batch_index',
  ],items.map(item=>{const nfts=transferNfts(item);return [item.transaction_hash,item.timestamp,item.block_number,item.method,address(item.from),address(item.to),item.token.address_hash,item.token.symbol,item.token.type,item.total?.value,item.total?.decimals??item.token.decimals,nfts.length?JSON.stringify(nfts.map(n=>n.id)):'',nfts.length?JSON.stringify(nfts.map(n=>n.quantity??null)):'',item.log_index,item.token_transfer_batch_index];}));
  return <div className="transfer-directory">
    <div className="stats-heading"><h1>{t('Token transfers')}</h1><button className="transfer-export" aria-label={t('exportPage')} title={t('exportPage')} disabled={pending||!!error||!items.length} onClick={exportPage}><Download size={19} aria-hidden="true"/></button></div>
    <TransactionFilters locale={locale} kind="transfers" value={state} onApply={value=>{setState(normalizeTransactionFilters(value.filters));pages.reset();}}/>
    <section className="data-ledger transfer-ledger" aria-busy={pending}>
      <div className="token-list-controls"><span className="transfer-count"><span className="transfer-count-full">{data?formatMessage(locale,'shown',{count:new Intl.NumberFormat(locale).format(items.length)}):pending?'…':'N/A'}</span><span className="transfer-count-compact" aria-hidden="true">{data?new Intl.NumberFormat(locale).format(items.length):pending?'…':'—'}</span></span><IndexedUpdates scope={`${path}:${navigation}:${retry}`} path={path} value={data as (Row & {items:Row[]})|undefined} normalize={value=>normalizeTransfers(value,state.filters.transaction_types)} enabled={!!data&&!error&&!pages.query} onApply={setData} t={t}/>{pager}</div>
      {error?<div className="error-state" role="alert"><p>{t(error)}</p>{!invalid&&<button onClick={()=>setRetry(n=>n+1)}>{t('retry')}</button>}</div>:pending?<div className="transfer-loading" role="status" aria-label={t('loadingRecords')}>{Array.from({length:8},(_,index)=><div className="transfer-loading-card" aria-hidden="true" key={index}><span className="transfer-loading-line short"/><span className="transfer-loading-line medium"/><span className="transfer-loading-line long"/><span className="transfer-loading-line medium"/></div>)}</div>:!items.length?<div className="empty">{t('noRecords')}</div>:<LedgerScroll className="ledger-scroll" label={t('Token transfers')}>
        <table role="table"><colgroup>{['transaction','method','block','from','to','asset','value'].map(key=><col key={key} className={`transfer-col-${key}`}/>)}</colgroup><thead><tr><th scope="col">{t('transactionHash')}</th><th scope="col">{t('method')}</th><th scope="col">{t('block')}</th><th scope="col">{t('from')}</th><th scope="col">{t('to')}</th><th scope="col">{t('Token')}</th><th scope="col">{t('Amount')}</th></tr></thead>
          <tbody>{items.map((item,index)=>{
            const nfts=transferNfts(item),decimals=item.total?.decimals??item.token.decimals,raw=item.total?.value,fiat=tokenFiatValue(raw,decimals,item.token.exchange_rate),quantity=formatChainAmount(raw,decimals??0,locale,8);
            return <tr className={nfts.length?'transfer-record transfer-record-nft':'transfer-record'} key={`${item.transaction_hash}:${item.log_index??index}:${item.token_transfer_batch_index??index}`}>
              <td className="transfer-transaction"><div className="cell-value">{props.identity(item.transaction_hash,`/tx/${item.transaction_hash}`,short(item.transaction_hash))}<small><LiveAge timestamp={item.timestamp}/></small></div></td>
              <td className="transfer-method"><div className="cell-value"><span className="method" title={item.method}>{item.method||'N/A'}</span></div></td>
              <td className="transfer-block"><span className="cell-label" aria-hidden="true">{t('block')}</span><div className="cell-value">{item.block_number!=null?<ExplorerLink className="text-link" to={`/block/${item.block_number}`}>{new Intl.NumberFormat(locale).format(item.block_number)}</ExplorerLink>:'N/A'}</div></td>
              <td className="transfer-from"><span className="cell-label" aria-hidden="true">{t('from')}</span><div className="cell-value">{identity(item.from)}</div></td>
              <td className="transfer-to"><span className="cell-label" aria-hidden="true">{t('to')}</span><div className="cell-value">{identity(item.to)}</div></td>
              <td className="transfer-asset"><div className="cell-value"><TokenMark token={item.token}/><div><ExplorerLink className="text-link" to={`/token/${item.token.address_hash}`} title={item.token.name||item.token.symbol}>{item.token.symbol||item.token.name||short(item.token.address_hash)}</ExplorerLink><small>{item.token.type}</small></div></div></td>
              <td className="transfer-value"><div className="cell-value">{nfts.length?<TransferNfts item={item} get={get} locale={locale} t={t}/>:<span className="token-amount"><strong title={formatChainAmount(raw,decimals??0,locale)}><bdi dir="ltr">{quantity==='—'?'N/A':quantity}</bdi></strong><small>{decimals==null?t('base units'):item.token.symbol}</small>{item.token.exchange_rate!=null&&<small className="transfer-fiat" title={tokenUsd(fiat,locale)}><UsdValue value={fiat} locale={locale} mode="cap"/></small>}</span>}</div></td>
            </tr>;
          })}</tbody>
        </table>
      </LedgerScroll>}
      {items.length>0&&<div className="token-pagination-bottom">{cloneElement(pager,{bottom:true})}</div>}
    </section>
  </div>;
}
