import { useEffect, useRef, useState } from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';
import { ExplorerLink } from './ExplorerLink';
import { copyText } from './clipboard';
export function CopyableValue({value,display,link,external=false,t}:{value:string;display?:string;link?:string;external?:boolean;t:(key:string)=>string}) {
  const [done,setDone]=useState(false),[failed,setFailed]=useState(false),manualCopy=useRef<HTMLInputElement>(null);
  const timeout=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),generation=useRef(0);
  useEffect(()=>{generation.current++;setDone(false);setFailed(false);return()=>{generation.current++;clearTimeout(timeout.current);};},[value]);
  useEffect(()=>{if(failed){manualCopy.current?.focus({preventScroll:true});manualCopy.current?.select();}},[failed]);
  const text=display||(value?(value.length<=14?value:`${value.slice(0,7)}…${value.slice(-5)}`):'—');
  return <span className={`copyable${failed?' copyable-failed':''}`}>
    {link ? external ? <a className="text-link mono" href={link} title={value} target="_blank" rel="noreferrer">{text}<ExternalLink size={12} aria-hidden="true"/></a> : <ExplorerLink className="text-link mono" title={value} to={link}>{text}</ExplorerLink> : <span className="mono">{text}</span>}
    <button className={`copy-button${done?' copied':''}`} aria-label={done?t('copied'):t('copy')} title={done?t('copied'):t('copy')} onClick={async()=>{
      const request=generation.current,copied=await copyText(value);if(request!==generation.current)return;clearTimeout(timeout.current);setDone(copied);setFailed(!copied);if(copied)timeout.current=setTimeout(()=>setDone(false),1000);
    }}>{done?<Check size={13}/>:<Copy size={13}/>}</button>
    {failed&&<span className="copy-fallback"><span role="status">{t('copyFailed')}</span><input ref={manualCopy} value={value} readOnly aria-label={t('copyValue')} onFocus={event=>event.currentTarget.select()}/></span>}
  </span>;
}
