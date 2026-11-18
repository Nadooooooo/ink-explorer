import {createContext,useContext,useEffect,useMemo,useState} from 'react';
import {ArrowDownUp} from 'lucide-react';
import {Info} from './Info';
import {currentRollingStatistics,type RollingStatistics,type RollingFrame} from './rolling-statistics';
export const RollingStatisticsContext=createContext<RollingStatistics|null>(null);
export const rollingCountHelp='Transactions included in canonical blocks over the last 24 hours, including failed transactions and L1/system deposits. The window ends at the indicated block.';
export function useRollingStatistics(frame:RollingFrame,chainId:number){
  const data=useMemo(()=>currentRollingStatistics(frame,chainId),[frame,chainId]);
  const [expired,setExpired]=useState<RollingFrame>();
  useEffect(()=>{
    if(!data)return;
    const sent=Date.parse(frame.sentAt||'');
    const remaining=Math.min(Date.parse(data.sampledAt),Date.parse(data.window.to),Date.parse(frame.block?.timestamp))+5000-sent;
    const timer=setTimeout(()=>setExpired(frame),Math.max(0,remaining));
    return()=>clearTimeout(timer);
  },[frame,data]);
  return expired===frame?null:data;
}

export function RollingCount({t,variant='summary'}:{t:(key:string)=>string;variant?:'home'|'summary'|'statistics'}) {
  const data=useContext(RollingStatisticsContext),title=t('Transactions · 24h'),locale=document.documentElement.lang;
  const count=data?.transactions??null;
  const help=<>{t(rollingCountHelp)}{data&&<><br/>{new Date(data.window.from).toLocaleString(locale)} – {new Date(data.window.to).toLocaleString(locale)}<br/>#{data.window.fromBlock.toLocaleString(locale)} – #{data.window.toBlock.toLocaleString(locale)}</>}{!data&&<><br/>{t('Data source unavailable')}</>}</>;
  const value=<strong title={count===null?undefined:String(count)}><span>{count===null?'N/A':count.toLocaleString(locale)}</span></strong>;
  const top=variant==='statistics'?<div><span>{title}</span><Info label={title}>{help}</Info></div>:<div className="metric-top"><Info label={title} showLabel>{help}</Info>{variant==='home'&&<ArrowDownUp aria-hidden="true"/>}</div>;
  return variant==='statistics'?<article className="featured-counter" data-counter="newTxns24h" data-source="local-node">{top}{value}</article>:<div className="metric" data-counter="newTxns24h" data-source="local-node">{top}{value}</div>;
}
