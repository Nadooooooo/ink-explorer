import {useEffect,useState} from 'react';
import {observePageResource} from './page-resource';
import type {CurrentSnapshot} from './statistics-data';

type Reader<T>=(signal:AbortSignal)=>Promise<CurrentSnapshot<T>>;
type State<T>={reader?:Reader<T>;data?:T;current:boolean;pending:boolean;error:string};

/** Retain identities and filters while masking mutable values until revalidated. */
export function useCurrentSnapshot<T>(reader:Reader<T>|undefined,interval=10000,initial?:()=>CurrentSnapshot<T>|undefined) {
  const seedState=():State<T>=>{
    const seed=reader?initial?.():undefined;
    return {reader,data:seed?.data,current:!!seed,pending:!!reader&&!seed,error:''};
  };
  const [state,setState]=useState<State<T>>(seedState);
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    if(!reader)return;
    const update=(change:Partial<State<T>>)=>setState(previous=>({
      ...(previous.reader===reader?previous:{reader,current:false,pending:true,error:''}),
      ...change,
    }));
    let first=attempt===0;
    return observePageResource({
      interval,
      load:signal=>{
        const seed=first?initial?.():undefined;first=false;
        return seed?Promise.resolve(seed):reader(signal);
      },
      expiresAt:snapshot=>snapshot.expiresAt,
      onStart:()=>update({pending:true}),
      onSuspend:()=>update({current:false,pending:false,error:''}),
      onValue:snapshot=>update({data:snapshot.data,current:true,pending:false,error:''}),
      onError:error=>update({current:false,pending:false,error:error instanceof Error?error.message:'Data source unavailable'}),
    });
  },[reader,attempt,interval,initial]);
  // Never paint a previous entity's values during the render before effects run.
  const visible=state.reader===reader?state:seedState();
  return{...visible,retry:()=>setAttempt(value=>value+1)};
}
