import {useEffect,useRef,useState} from 'react';
import {requestJson,waitForRequestRetry} from './api-request';
import {addressBalanceHead,currentAddressBalance,normalizeAddressBalance,profileAddressBalance,type AddressBalance,type BalanceFrame} from './address-balance';

export function useAddressBalance(id:string,chainId:number,api:string,frame:BalanceFrame,profile:Record<string,any>|undefined,enabled=true) {
  const latest=useRef(frame);latest.current=frame;
  const profileRef=useRef(profile);profileRef.current=profile;
  const control=useRef<()=>void>(()=>{});
  const [state,setState]=useState<{id:string;data?:AddressBalance;error?:string}>(()=>({id,data:profileAddressBalance(profile,id,chainId)}));
  const [paused,setPaused]=useState(()=>document.hidden||navigator.onLine===false);
  const [,tick]=useState(0);
  useEffect(()=>{
    let disposed=false,suspended=document.hidden||navigator.onLine===false,offline=navigator.onLine===false;
    let data=profileAddressBalance(profileRef.current,id,chainId),request:AbortController|undefined;
    let lastKey='',lastStart=-Infinity,retryAt=0,failures=0,generation=0;
    setState({id,data});setPaused(suspended);
    const active=()=>enabled&&!disposed&&!suspended&&!offline&&!document.hidden&&navigator.onLine!==false;
    const cancel=()=>{generation++;request?.abort();request=undefined;lastKey='';};
    const notify=()=>{
      if(!active())return;
      const head=addressBalanceHead(latest.current,chainId);
      if(!head){if(!latest.current.initialPending)cancel();return;}
      const key=head.number+':'+head.hash;
      if(data?.block.hash.toLowerCase()===head.hash&&currentAddressBalance(data,latest.current,chainId)){lastKey=key;return;}
      if(request||Date.now()<retryAt||performance.now()-lastStart<250)return;
      if(lastKey===key&&data){try{normalizeAddressBalance(data,id,chainId);return;}catch{}}
      const controller=new AbortController(),epoch=++generation;request=controller;lastStart=performance.now();lastKey=key;
      const url=`${api}/address-balance/${id}`;
      void (async()=>{
        try{
          await waitForRequestRetry(url,controller.signal);
          const value=normalizeAddressBalance(await requestJson(url,{signal:controller.signal},6000),id,chainId);
          if(!active()||epoch!==generation||controller.signal.aborted)return;
          data=value;failures=0;retryAt=0;setState({id,data});
        }catch(error){
          if(!active()||epoch!==generation||controller.signal.aborted)return;
          data=undefined;retryAt=Date.now()+Math.min(1000*2**failures++,15000);
          setState({id,error:error instanceof Error?error.message:'Data source unavailable'});
        }finally{
          if(epoch===generation){request=undefined;notify();}
        }
      })();
    };
    const suspend=()=>{suspended=true;data=undefined;cancel();setState({id});setPaused(true);};
    const resume=()=>{if(disposed||document.hidden||offline||navigator.onLine===false)return;suspended=false;setPaused(false);notify();};
    const visibility=()=>document.hidden?suspend():resume();
    const goOffline=()=>{offline=true;suspend();};
    const goOnline=()=>{offline=false;resume();};
    control.current=notify;
    document.addEventListener('visibilitychange',visibility);
    window.addEventListener('pagehide',suspend);window.addEventListener('pageshow',resume);
    window.addEventListener('offline',goOffline);window.addEventListener('online',goOnline);
    // Expiry still applies when a socket stays open but stops delivering frames.
    const timer=setInterval(()=>{if(active()){tick(v=>v+1);notify();}},500);
    notify();
    return()=>{disposed=true;cancel();clearInterval(timer);control.current=()=>{};document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',suspend);window.removeEventListener('pageshow',resume);window.removeEventListener('offline',goOffline);window.removeEventListener('online',goOnline);};
  },[id,chainId,api,enabled]);
  useEffect(()=>control.current(),[frame]);
  const value=enabled&&!paused&&state.id===id?currentAddressBalance(state.data,frame,chainId):undefined;
  return {data:value,error:state.id===id?state.error:undefined};
}
