import {memo,useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {Database,History,RefreshCw,X} from 'lucide-react';
import {getDataFreshness,subscribeDataFreshness} from './api-request';
import {Info} from './Info';
import {message,type Locale} from './i18n';

function focusContent(){document.getElementById('main-content')?.focus({preventScroll:true});}
export default memo(function PageDataNotice({locale}:{locale:Locale}){
  const freshness=useSyncExternalStore(subscribeDataFreshness,getDataFreshness);
  const [restored,setRestored]=useState(false),focused=useRef(false);
  const t=(key:string)=>message(locale,key),visible=!!freshness||restored;
  useEffect(()=>{
    let path=location.pathname;
    const show=(event:PageTransitionEvent)=>{if(event.persisted)setRestored(true);};
    const navigate=()=>{if(location.pathname!==path)setRestored(false);path=location.pathname;};
    addEventListener('pageshow',show);addEventListener('popstate',navigate);
    return()=>{removeEventListener('pageshow',show);removeEventListener('popstate',navigate);};
  },[]);
  useEffect(()=>{if(!visible&&focused.current){focused.current=false;focusContent();}},[visible]);
  if(!visible)return null;
  const Icon=freshness?Database:History,refresh=t('restoredPageRefresh');
  return <aside className={`data-freshness page-data-notice${restored?' restored-page-notice':''}`} data-notice-kind={freshness?'cached':'restored'} role="status" onFocusCapture={()=>{focused.current=true;}} onBlurCapture={event=>{if(event.relatedTarget&&!event.currentTarget.contains(event.relatedTarget))focused.current=false;}}>
    <div className="data-notice-label"><Icon size={19} aria-hidden="true"/><div><strong>{t(freshness?'cachedDataTitle':'Saved view')}</strong>{freshness&&<time dateTime={freshness.fetchedAt} title={new Date(freshness.fetchedAt).toLocaleString(locale,{dateStyle:'full',timeStyle:'long'})}>{new Date(freshness.fetchedAt).toLocaleString(locale,{dateStyle:'short',timeStyle:'short'})}</time>}</div></div>
    <div className="data-notice-actions">
      <Info label={t('Data status details')}><span className="data-notice-details">{freshness&&<><span>{t('An indexed source is unavailable. Some values come from a saved snapshot.')}</span><span>{t('cachedDataDate')} <time dateTime={freshness.fetchedAt}>{new Date(freshness.fetchedAt).toLocaleString(locale,{dateStyle:'full',timeStyle:'long'})}</time></span></>}{restored&&<span>{t('Some saved values may have changed. Refresh to check the latest data.')}</span>}</span></Info>
      <button className="notice-action notice-refresh" type="button" onClick={()=>location.reload()} title={refresh} aria-label={refresh}><RefreshCw size={18} aria-hidden="true"/></button>
      {!freshness&&<button className="notice-action notice-dismiss" type="button" title={t('Dismiss message')} aria-label={t('Dismiss message')} onClick={()=>{setRestored(false);focused.current=true;}}><X size={18} aria-hidden="true"/></button>}
    </div>
  </aside>;
});
