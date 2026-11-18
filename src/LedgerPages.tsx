import { cloneElement, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDownLeft, ArrowUpRight, CircleCheck, CircleX, Clock3, Coins, Download, Gauge } from 'lucide-react';
import { EntityMark } from './EntityMark';
import { LiveAge } from './LiveAge';
import { Info } from './Info';
import {seoDescriptions} from './seo-descriptions';
import { ExplorerLink } from './ExplorerLink';
import { LedgerScroll } from './LedgerViewport';
import LedgerSkeleton from './LedgerSkeleton';
import { IndexedUpdates } from './IndexedUpdates';
import { CopyableValue } from './CopyableValue';
import { CursorPagination, useCursorPages } from './CursorPagination';
import { formatChainAmount } from './explorer-data';
import { downloadCsv } from './activity-data';
import { isTestnet } from './network';
import { formatMessage, type Locale } from './i18n';
import { ledgerPaths, ledgerTitles, ledgerNumber, ledgerAggregate, ledgerCsv, normalizeLedger, ledgerInteger, type LedgerPage } from './ledger-data';
import type { ExplorerPageProps } from './ExplorerPages';

type Row=Record<string,any>;
type Column={key:string;label:string;cell:(row:Row,index:number)=>ReactNode};
const short=(value:string)=>`${value.slice(0,7)}…${value.slice(-5)}`;
const address=(value:any)=>typeof value==='string'?value:value?.hash;
const name=(value:Row)=>value?.ens_domain_name||value?.metadata?.tags?.find((tag:Row)=>tag.tagType==='name')?.name||value?.implementations?.find((item:Row)=>item.name)?.name||value?.name;
const validAddress=(value:any)=>/^0x[\da-f]{40}$/i.test(value||'');
const validHash=(value:any)=>/^0x[\da-f]{64}$/i.test(value||'');
const l1=isTestnet?'https://sepolia.etherscan.io':'https://etherscan.io';
function Age({value}:{value?:string}){return value&&Number.isFinite(+new Date(value))?<LiveAge timestamp={value}/>:<>N/A</>;}

export default function LedgerPages(props:ExplorerPageProps){
  const {t}=props,page=props.page as LedgerPage,locale=document.documentElement.lang as Locale;
  const [data,setData]=useState<Row>(),[error,setError]=useState(''),[retry,setRetry]=useState(0),[total,setTotal]=useState<unknown>(),[latest,setLatest]=useState<string>();
  const [navigation,setNavigation]=useState(0),[countRevision,setCountRevision]=useState(0),pages=useCursorPages(`${page}:${navigation}`),offsets=useRef(new Map<string,number>());
  const offset=offsets.current.get(pages.query)||0,path=`/explorer/${ledgerPaths[page]}`;
  const number=(value:unknown)=>ledgerNumber(value,locale);
  useEffect(()=>{const restore=()=>{if(location.pathname.endsWith('/'+page)){offsets.current.clear();setNavigation(n=>n+1);}};addEventListener('popstate',restore);return()=>removeEventListener('popstate',restore);},[page]);
  useEffect(()=>{
    const controller=new AbortController();setData(undefined);setError('');if(!pages.query)setLatest(undefined);
    props.get(path+pages.query,controller.signal).then(value=>{const next=normalizeLedger(page,value);if(controller.signal.aborted)return;setData(next);if(!pages.query)setLatest(next.items[0]?.l1_block_timestamp||next.items[0]?.l2_timestamp);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});
    return()=>controller.abort();
  },[page,pages.query,retry,navigation]);
  const bridge=page==='deposits'||page==='withdrawals';
  useEffect(()=>{
    if(!countRevision)setTotal(undefined);if(!bridge)return;const controller=new AbortController();props.get(path+'/count',controller.signal).then(value=>{if(!controller.signal.aborted)setTotal(typeof value==='object'?value?.count:value);}).catch(()=>{if(!controller.signal.aborted)setTotal(undefined);});return()=>controller.abort();
  },[page,retry,navigation,countRevision]);
  const items:Row[]=data?.items||[],pending=!data&&!error;
  const shown=data?formatMessage(locale,'shown',{count:number(items.length)}):'N/A';
  const applyUpdates=(next:Row)=>{setData(next);if(bridge){setLatest(next.items[0]?.l1_block_timestamp||next.items[0]?.l2_timestamp);setCountRevision(n=>n+1);}};
  const pager=<CursorPagination page={pages.page} previous={pages.previous} next={()=>{offsets.current.set(data!.next,offset+items.length);pages.next(data!.next_page_params);}} hasNext={!!data?.next&&data.next!==pages.query} pending={pending}/>;
  const identity=(value:any,layer1=false)=>{const hash=address(value),label=name(value);if(!validAddress(hash))return <>N/A</>;return <span className={`ledger-identity${label?' named':''}`}><EntityMark address={hash} entity={typeof value==='object'?value:undefined}/>{layer1?<CopyableValue value={hash} display={label||short(hash)} link={`${l1}/address/${hash}`} external t={t}/>:props.identity(hash,`/address/${hash}`,label||short(hash))}</span>;};
  const hash=(value:string,layer1=false)=>!validHash(value)?<>N/A</>:layer1?<CopyableValue value={value} display={short(value)} link={`${l1}/tx/${value}`} external t={t}/>:props.identity(value,`/tx/${value}`,short(value));
  const block=(value:unknown,layer1=false)=>ledgerInteger(value)==null?<>N/A</>:layer1?<a className="text-link" href={`${l1}/block/${value}`} target="_blank" rel="noreferrer">{number(value)}</a>:<ExplorerLink className="text-link" to={`/block/${value}`}>{number(value)}</ExplorerLink>;
  const amount=(value:unknown,precision=8)=>{const raw=ledgerInteger(value),exact=raw==null?'N/A':formatChainAmount(raw.toString(),18,locale);return <span className="ledger-amount"><strong title={exact} dir="ltr">{raw==null?'N/A':formatChainAmount(raw.toString(),18,locale,precision)}</strong>{raw!=null&&<small>ETH</small>}</span>;};
  const reference=(value:string,time?:string)=><div className="ledger-reference">{hash(value)}<small><Age value={time}/></small></div>;
  const status=(item:Row)=>{const text=typeof item.status==='string'&&item.status.trim()?item.status:'N/A',done=/^(relayed|finalized)$/i.test(text),failed=/^(failed|reverted)$/i.test(text),Icon=failed?CircleX:done?CircleCheck:Clock3;return <span className={`ledger-status${done?' completed':failed?' failed':''}`}><span>{text!=='N/A'&&<Icon size={17} aria-hidden="true"/>}{t(text)}</span>{validHash(item.l1_transaction_hash)&&<span className="ledger-l1-result"><small>{t('L1 transaction')}</small>{hash(item.l1_transaction_hash,true)}</span>}</span>;};
  let columns:Column[]=[];
  if(page==='accounts')columns=[
    {key:'rank',label:'Rank',cell:(_,i)=><span className="ledger-rank">#{number(offset+i+1)}</span>},
    {key:'address',label:'Address',cell:item=>identity(item)},
    {key:'value',label:'ETH balance',cell:item=>amount(item.coin_balance)},
    {key:'percentage',label:'Percentage',cell:()=> 'N/A'},
    {key:'count',label:'transactions',cell:item=>number(item.transactions_count)},
  ];
  if(page==='internal-txs')columns=[
    {key:'reference',label:'Parent transaction',cell:item=>reference(item.transaction_hash,item.timestamp)},
    {key:'method',label:'Type',cell:item=><div className="ledger-call"><span className={`internal-type${item.success===false?' failed':''}`}>{item.success===false&&<><CircleX size={17} aria-hidden="true"/><span>{t('Failed')}</span></>}<code>{item.type||'N/A'}</code></span></div>},
    {key:'block',label:'block',cell:item=>block(item.block_number)},
    {key:'from',label:'from',cell:item=>identity(item.from)},
    {key:'to',label:'to',cell:item=>identity(item.to||item.created_contract)},
    {key:'value',label:'Value (ETH)',cell:item=>amount(item.value)},
  ];
  if(page==='deposits')columns=[
    {key:'block',label:'L1 block',cell:item=>block(item.l1_block_number,true)},
    {key:'reference',label:'L2 transaction',cell:item=>reference(item.l2_transaction_hash,item.l1_block_timestamp)},
    {key:'l1',label:'L1 transaction',cell:item=>hash(item.l1_transaction_hash,true)},
    {key:'origin',label:'L1 origin',cell:item=>identity(item.l1_transaction_origin,true)},
    {key:'gas',label:'gasLimit',cell:item=>number(item.l2_transaction_gas_limit)},
  ];
  if(page==='withdrawals')columns=[
    {key:'nonce',label:'Message nonce',cell:item=><span title={item.msg_nonce_raw}>{number(item.msg_nonce)}</span>},
    {key:'reference',label:'L2 transaction',cell:item=>reference(item.l2_transaction_hash,item.l2_timestamp)},
    {key:'from',label:'from',cell:item=>identity(item.from)},
    {key:'target',label:'L1 target',cell:item=>identity(item.msg_target_address_hash,true)},
    {key:'value',label:'Value (ETH)',cell:item=>amount(item.msg_value)},
    {key:'status',label:'Status',cell:status},
  ];
  const aggregate=ledgerAggregate(items,page==='deposits'?'l2_transaction_gas_limit':'msg_value',page==='deposits');
  const exportPage=()=>{const csv=ledgerCsv(page,items,offset);downloadCsv(`ink-${page}.csv`,csv.headers,csv.rows);};
  return <div className={`ledger-page ledger-${page}`}>
    <div className="stats-heading"><div className="ledger-heading-title"><h1>{t(ledgerTitles[page]).replace(/\s*→\s*/g,'\u00a0→\u00a0')}</h1>{page==='accounts'&&<Info label={t('Percentage')}>{t("The indexed supply is the Ethereum supply, not Ink's native ETH balance. A verified Ink denominator is required for this percentage.")}</Info>}</div><button className="transfer-export" aria-label={t('exportPage')} title={t('exportPage')} disabled={pending||!!error||!items.length} onClick={exportPage}><Download size={19} aria-hidden="true"/></button></div>
    {seoDescriptions['/'+page]&&<p className="page-summary">{t(seoDescriptions['/'+page])}</p>}
    {bridge&&<section className="bridge-summary">
      <article>{page==='deposits'?<ArrowDownLeft aria-hidden="true"/>:<ArrowUpRight aria-hidden="true"/>}<div><span>{t(page==='deposits'?'Total deposits':'Total withdrawals')}</span><strong>{number(total)}</strong></div></article>
      <article><Clock3 aria-hidden="true"/><div><span>{t('Latest activity')}</span><strong><Age value={latest}/></strong></div></article>
      <article>{page==='deposits'?<Gauge aria-hidden="true"/>:<Coins aria-hidden="true"/>}<div><span>{t(page==='deposits'?'Average gas limit · this page':'Withdrawal value · this page')}</span><strong>{page==='deposits'?number(aggregate):amount(aggregate,4)}</strong></div></article>
    </section>}
    <section className="data-ledger ledger-catalogue" aria-busy={pending}>
      <div className="token-list-controls"><span className="ledger-row-count" title={shown}><span className="ledger-count-full">{shown}</span><span className="ledger-count-compact" aria-hidden="true">{data?number(items.length):'N/A'}</span></span><IndexedUpdates scope={`${page}:${navigation}:${pages.query}:${retry}`} path={path} value={data as (Row & {items:Row[]})|undefined} normalize={value=>normalizeLedger(page,value)} enabled={!!data&&!error&&!pages.query} onApply={applyUpdates} t={t}/>{pager}</div>
      {error?<div className="error-state" role="alert"><p>{t(error)}</p><button onClick={()=>setRetry(n=>n+1)}>{t('retry')}</button></div>:pending?<LedgerSkeleton kind="records" label={t('loadingRecords')}/>:!items.length?<div className="empty">{t('noRecords')}</div>:<LedgerScroll className="ledger-scroll" label={t(ledgerTitles[page])}>
        <table role="table"><colgroup>{columns.map(c=><col key={c.key} className={`ledger-col-${c.key}`}/>)}</colgroup><thead><tr>{columns.map(c=><th key={c.key} scope="col" className={`ledger-heading-${c.key}`}>{t(c.label)}</th>)}</tr></thead><tbody>{items.map((item,index)=><tr className="ledger-record" key={`${item.hash||item.transaction_hash||item.l2_transaction_hash}:${item.index??item.msg_nonce_raw??index}`}>{columns.map(c=><td key={c.key} className={`ledger-cell-${c.key}`}><span className="cell-label" aria-hidden="true">{t(c.label)}</span><div className="cell-value">{c.cell(item,index)}</div></td>)}</tr>)}</tbody></table>
      </LedgerScroll>}
      {items.length>0&&<div className="token-pagination-bottom">{cloneElement(pager,{bottom:true})}</div>}
    </section>
  </div>;
}
