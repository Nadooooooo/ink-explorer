import {useEffect,useState} from 'react';
import {observePageResource} from './page-resource';
import type {CurrentSnapshot} from './statistics-data';

type Reader<T>=(signal:AbortSignal)=>Promise<CurrentSnapshot<T>>;
type State<T>={
  reader?:Reader<T>;data?:T;signature?:string;expiresAt:number;
  current:boolean;pending:boolean;error:string;attempt:number;
  candidate?:CurrentSnapshot<T>;
};

/** Keep a ranked page stable; changed results are adopted through its refresh control. */
export function useRankedSnapshot<T>(reader:Reader<T>,interval=60000) {
  const [attempt,setAttempt]=useState(0);
  const [state,setState]=useState<State<T>>({expiresAt:0,current:false,pending:true,error:'',attempt:-1});
  useEffect(()=>{
    const update=(change:Partial<State<T>>)=>setState(previous=>({
      ...(previous.reader===reader?previous:{reader,expiresAt:0,current:false,pending:true,error:'',attempt:-1}),
      ...change,
    }));
    return observePageResource({
      interval,
      load:reader,
      expiresAt:snapshot=>snapshot.expiresAt,
      onStart:()=>update({pending:true}),
      onSuspend:()=>update({current:false,candidate:undefined,pending:false,error:''}),
      onError:error=>update({current:false,candidate:undefined,pending:false,error:error instanceof Error?error.message:'Data source unavailable'}),
      onValue:snapshot=>setState(previous=>{
        const signature=JSON.stringify(snapshot.data);
        if(previous.reader!==reader||!previous.data||previous.attempt!==attempt||previous.signature===signature)
          return {reader,data:snapshot.data,signature,expiresAt:snapshot.expiresAt,current:true,pending:false,error:'',attempt};
        return {...previous,candidate:snapshot,current:previous.current&&previous.expiresAt>Date.now(),pending:false,error:''};
      }),
    });
  },[reader,attempt,interval]);

  // A newer, buffered page must not extend the lifetime of values still on screen.
  useEffect(()=>{
    if(state.reader!==reader||!state.current)return;
    const timer=setTimeout(()=>setState(previous=>previous.reader===reader&&previous.expiresAt===state.expiresAt
      ? {...previous,current:false}:previous),Math.max(0,state.expiresAt-Date.now()));
    return()=>clearTimeout(timer);
  },[reader,state.reader,state.current,state.expiresAt]);

  const visible=state.reader===reader?state:{data:undefined,current:false,pending:true,error:'',candidate:undefined};
  const refresh=()=>{
    if(visible.candidate&&visible.candidate.expiresAt>Date.now()){
      setState(previous=>{
        if(previous.reader!==reader||!previous.candidate||previous.candidate.expiresAt<=Date.now())return previous;
        const snapshot=previous.candidate;
        return {...previous,data:snapshot.data,signature:JSON.stringify(snapshot.data),expiresAt:snapshot.expiresAt,current:true,candidate:undefined,error:''};
      });
    }else setAttempt(value=>value+1);
  };
  return {...visible,hasUpdates:!!visible.candidate,refresh};
}
