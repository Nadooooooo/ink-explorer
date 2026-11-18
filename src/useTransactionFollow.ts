import {useEffect,useRef,useState} from 'react';
import {initialRecord} from './initial-record';
import {loadIndexedTransaction} from './transaction-indexing';
import {requestJson,waitForRequestRetry} from './api-request';
import {observePageResource} from './page-resource';
import {useNetworkObservation} from './useNetworkObservation';
import {currentConfirmations,followedTransaction,observeTransaction,transactionNeedsIndex,transactionNeedsReceipt,transactionIndexWitness,reinclusionReceipt,type TransactionFrame,type TransactionObservation} from './transaction-follow';

export function useTransactionFollow(id:string,chainId:number,api:string,live:TransactionFrame) {
  const initial=useRef(initialRecord('transaction',id,chainId));
  const [indexed,setIndexed]=useState<Record<string,any>|undefined>(()=>initial.current?.phase==='ready'?initial.current.data:undefined);
  const [error,setError]=useState('');
  const [indexing,setIndexing]=useState(initial.current?.phase==='indexing');
  const [observation,setObservation]=useState<TransactionObservation>();
  const [attempt,setAttempt]=useState(0);
  const network=useNetworkObservation(live,chainId);
  const frame={...live,network:network || undefined};
  const nextObservation=observeTransaction(id,indexed,frame,chainId,observation);
  useEffect(()=>setObservation(nextObservation),[nextObservation]);
  const latest=useRef({indexed,observation:nextObservation,frame});latest.current={indexed,observation:nextObservation,frame};
  useEffect(()=>{
    let first=true;
    return observePageResource({
      interval:5000,
      load:async signal=>{
        const current=latest.current;
        const seed=first && attempt===0?initialRecord('transaction',id,chainId):undefined;
        if(seed?.phase==='ready'){
          first=false;return seed.data;
        }
        first=false;
        if(current.observation && transactionNeedsReceipt(current.indexed,current.observation,current.frame,chainId)){
          const receipt=await requestJson(`${api}/contract-rpc`,{method:'POST',signal,headers:{'content-type':'application/json'},body:JSON.stringify({method:'eth_getTransactionReceipt',params:[id]})});
          const recovered=reinclusionReceipt(id,receipt,chainId,latest.current.frame,current.observation);
          if(recovered && !signal.aborted)setObservation({...recovered,indexWitness:transactionIndexWitness(current.indexed),receiptCheckedAt:Date.now()});
        }
        if(current.indexed && !transactionNeedsIndex(current.indexed,current.observation,current.frame,chainId))return current.indexed;
        return loadIndexedTransaction<Record<string,any>>({id,chainId,signal,
          onIndexing:()=>{if(!signal.aborted)setIndexing(true);},
          request:async (signal,timeout)=>{
            const url=`${api}/explorer/transactions/${id}`;
            await waitForRequestRetry(url,signal);
            let status=0;
            const value=await requestJson(url,{signal,headers:{accept:'application/vnd.ink.transaction-indexing+json, application/json'}},timeout,'object',(_,code)=>{status=code;});
            return {value,status};
          },
        });
      },
      onStart:()=>{},
      onValue:value=>{setIndexed(value);setIndexing(false);setError('');},
      onError:error=>setError(error instanceof Error?error.message:'Data source unavailable'),
    });
  },[id,chainId,api,attempt]);
  const tx=followedTransaction(indexed,nextObservation);
  const checking=transactionNeedsReceipt(indexed,nextObservation,frame,chainId);
  return {tx,indexed,error,indexing,replaced:nextObservation?.replaced===true,checking,
    confirmations:checking?null:currentConfirmations(tx,frame,chainId),retry:()=>setAttempt(value=>value+1)};
}
