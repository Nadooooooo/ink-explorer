import {useEffect,useRef,useState} from 'react';
import {observePageResource} from './page-resource';
import {emptyLedgerPage,readLedgerPage,updateLedgerPage,type LedgerAction,type LedgerContext,type LedgerPageState} from './ledger-page';

type Options=Omit<LedgerContext,'key'> & {url:string; enabled:boolean; refresh:boolean; get:(url:string,signal?:AbortSignal)=>Promise<unknown>};
export function useLedgerPage(options:Options) {
  const key=options.enabled?`${options.kind}:${options.streaming}:${options.url}`:'disabled';
  const context={...options,key};
  const latest=useRef(context);latest.current=context;
  const [state,setState]=useState<LedgerPageState>(()=>emptyLedgerPage(key));
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    if(!options.enabled)return;
    const update=(action:LedgerAction)=>{
      if(latest.current.key!==key)return;
      const context=latest.current;
      setState(previous=>updateLedgerPage(previous,action,context));
    };
    return observePageResource({
      interval:options.refresh?30000:undefined,
      once:!options.refresh,
      load:async signal=>readLedgerPage(await options.get(options.url,signal)),
      onStart:()=>update({type:'start'}),
      onValue:page=>update({type:'indexed',page}),
      onError:error=>update({type:'error',error:error instanceof Error?error.message:'Data source unavailable'}),
    });
  },[key,options.enabled,options.refresh,options.url,options.get,attempt]);
  useEffect(()=>{
    if(options.enabled)setState(previous=>updateLedgerPage(previous,{type:'stream'},latest.current));
  },[key,options.enabled,options.live?.sequence,options.live?.connected,options.holding]);
  const scoped=state.key===key?state:emptyLedgerPage(key);
  const data=scoped.visible;
  return {data,error:data?.items.length?'':scoped.error,indexError:scoped.error,indexPending:scoped.pending,
    hasUpdates:!!scoped.candidate,
    retry:()=>{if(!scoped.pending)setAttempt(value=>value+1);},
    accept:()=>setState(previous=>updateLedgerPage(previous,{type:'accept'},latest.current))};
}
