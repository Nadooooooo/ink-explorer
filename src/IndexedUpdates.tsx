import {useContext,useEffect,useRef,useState} from 'react';
import {RefreshCw} from 'lucide-react';
import {requestJson,explorerRequestTimeout} from './api-request';
import {API} from './network';
import {createIndexedObserver,type IndexedUpdateState} from './indexed-updates';
import {IndexedHeadContext} from './IndexedHeadContext';

type Snapshot={items:any[];next_page_params?:unknown};
function useIndexedUpdates<T extends Snapshot>({scope,path,value,normalize,enabled}:{scope:string;path:string;value?:T;normalize:(value:any)=>T;enabled:boolean}){
  const head=useContext(IndexedHeadContext);
  const [state,setState]=useState<IndexedUpdateState<T>>({unavailable:false});
  const observer=useRef<ReturnType<typeof createIndexedObserver<T>>|undefined>(undefined);
  const latest=useRef({path,normalize,value,head});
  latest.current={path,normalize,value,head};
  const pageActive=useRef(true);
  useEffect(()=>{
    setState({unavailable:false});if(!enabled)return;
    const current=createIndexedObserver<T>({
      load:async signal=>latest.current.normalize(await requestJson(API+latest.current.path,{signal},explorerRequestTimeout(latest.current.path),'object',(_,__,headers)=>{
        if(headers.get('x-ink-data-status')==='stale')throw new Error('Data source unavailable');
      })),
      publish:setState,
    });
    observer.current=current;
    if(latest.current.value)current.baseline(latest.current.value);
    const resume=()=>current.observe(pageActive.current&&document.visibilityState!=='hidden'?latest.current.head:undefined);
    const hide=()=>{pageActive.current=false;current.suspend();};
    const show=()=>{pageActive.current=true;resume();};
    document.addEventListener('visibilitychange',resume);addEventListener('pagehide',hide);addEventListener('pageshow',show);resume();
    return()=>{current.dispose();observer.current=undefined;document.removeEventListener('visibilitychange',resume);removeEventListener('pagehide',hide);removeEventListener('pageshow',show);};
  },[scope,enabled]);
  useEffect(()=>{if(value)observer.current?.baseline(value);},[value]);
  useEffect(()=>{observer.current?.observe(pageActive.current&&document.visibilityState!=='hidden'?latest.current.head:undefined);},[head,scope,enabled]);
  return {available:enabled&&!!state.candidate,unavailable:enabled&&(!latest.current.head||state.unavailable),take:()=>observer.current?.take()};
}
export function IndexedUpdates<T extends Snapshot>(props:{scope:string;path:string;value?:T;normalize:(value:any)=>T;enabled:boolean;onApply:(value:T)=>void;t:(key:string)=>string}){
  const updates=useIndexedUpdates(props),{t}=props;
  // The reserved slot prevents an arriving update from moving the pagination.
  return <span className="indexed-update-slot">{updates.unavailable?<span className="data-unavailable" title={t('Updates unavailable')}>N/A</span>:updates.available?<button type="button" className="indexed-update-button" onClick={e=>{const value=updates.take();if(!value)return;const section=e.currentTarget.closest<HTMLElement>('.data-ledger,.directory-page');props.onApply(value);requestAnimationFrame(()=>{if(!section?.isConnected)return;const target=section.querySelector<HTMLElement>('.ledger-scroll,.user-operation-ledger,.contract-grid')||section;if(!target.hasAttribute('tabindex'))target.tabIndex=-1;target.focus({preventScroll:true});});}} aria-label={t('Show updates')} title={t('Show updates')}><RefreshCw size={19} aria-hidden="true"/></button>:null}</span>;
}
