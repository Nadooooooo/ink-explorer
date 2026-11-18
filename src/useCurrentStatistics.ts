import {useEffect,useRef,useState} from 'react';
import {STATISTICS_INTERVAL,type CurrentSnapshot} from './statistics-data';
import {readCounters,readGasOracle} from './statistics-request';

type State<T>={data?:T;lastData?:T;pending:boolean;error:string};
function useCurrentSnapshot<T>(read:(signal:AbortSignal)=>Promise<CurrentSnapshot<T>>,t:(key:string)=>string) {
  const [state,setState]=useState<State<T>>({pending:true,error:''});
  const retry=useRef<()=>void>(()=>{});
  useEffect(()=>{
    let disposed=false,suspended=false,request:AbortController|undefined,generation=0,expiresAt=0;
    let interval:ReturnType<typeof setInterval>|undefined,expiry:ReturnType<typeof setTimeout>|undefined;
    const unavailable=(error='Data source unavailable',keepPending=false)=>setState(current=>({...current,data:undefined,pending:keepPending&&current.pending,error}));
    const clearTimers=()=>{clearInterval(interval);clearTimeout(expiry);interval=undefined;expiry=undefined;};
    const expire=()=>{if(expiresAt&&Date.now()>=expiresAt)unavailable('Data source unavailable',true);};
    const armExpiry=()=>{
      clearTimeout(expiry);expiry=undefined;
      if(expiresAt>Date.now())expiry=setTimeout(expire,expiresAt-Date.now());else expire();
    };
    const load=async()=>{
      if(disposed||suspended||document.hidden||request)return;
      expire();
      if(navigator.onLine===false){unavailable();return;}
      const controller=new AbortController(),current=++generation;request=controller;
      setState(previous=>({...previous,pending:true}));
      try{
        const snapshot=await read(controller.signal);
        if(disposed||current!==generation||controller.signal.aborted)return;
        if(snapshot.expiresAt<=Date.now())throw new Error('Data source unavailable');
        expiresAt=snapshot.expiresAt;
        setState({data:snapshot.data,lastData:snapshot.data,pending:false,error:''});armExpiry();
      }catch(error){
        if(!disposed&&current===generation&&!controller.signal.aborted){expiresAt=0;clearTimeout(expiry);unavailable(error instanceof Error?error.message:'Data source unavailable');}
      }finally{if(current===generation)request=undefined;}
    };
    const suspend=()=>{suspended=true;generation++;request?.abort();request=undefined;clearTimers();setState(current=>({...current,pending:false}));};
    const resume=()=>{
      if(disposed||document.hidden)return;
      suspended=false;expire();armExpiry();
      if(!interval)interval=setInterval(()=>void load(),STATISTICS_INTERVAL);
      void load();
    };
    const visibility=()=>document.hidden?suspend():resume();
    const offline=()=>{suspend();unavailable();};
    retry.current=resume;
    document.addEventListener('visibilitychange',visibility);
    window.addEventListener('pagehide',suspend);window.addEventListener('pageshow',resume);
    window.addEventListener('focus',resume);window.addEventListener('offline',offline);window.addEventListener('online',resume);
    resume();
    return()=>{
      disposed=true;generation++;request?.abort();clearTimers();retry.current=()=>{};
      document.removeEventListener('visibilitychange',visibility);
      window.removeEventListener('pagehide',suspend);window.removeEventListener('pageshow',resume);
      window.removeEventListener('focus',resume);window.removeEventListener('offline',offline);window.removeEventListener('online',resume);
    };
  },[read]);
  return {...state,error:state.error?t(state.error):'',retry:()=>retry.current()};
}
export const useStatisticsCounters=(t:(key:string)=>string)=>useCurrentSnapshot(readCounters,t);
export const useGasOracle=(t:(key:string)=>string)=>useCurrentSnapshot(readGasOracle,t);
