import {useLayoutEffect,useRef} from 'react';
import {RefreshCw} from 'lucide-react';

export function StatisticsRetry({label,pending,onRetry}:{label:string;pending:boolean;onRetry:()=>void}) {
  const button=useRef<HTMLButtonElement>(null);
  const restore=useRef(false);
  useLayoutEffect(()=>{
    if(!pending&&restore.current&&document.activeElement===document.body)button.current?.focus({preventScroll:true});
  },[pending]);
  useLayoutEffect(()=>()=>{
    if(document.activeElement!==button.current&&!(restore.current&&document.activeElement===document.body))return;
    queueMicrotask(()=>{if(document.activeElement===document.body)document.getElementById('main-content')?.focus({preventScroll:true});});
  },[]);
  return <button ref={button} className="statistics-retry" type="button" aria-label={label} title={label} disabled={pending} onClick={()=>{restore.current=document.activeElement===button.current;onRetry();}}><RefreshCw size={18} aria-hidden="true"/></button>;
}
