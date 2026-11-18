import {useEffect,useRef,useState} from "react";
import {ImageIcon} from "lucide-react";
import {thumbnailUrl} from "./media";
import {matchesNftIdentity,nftArtwork} from "./nft-artwork";

const cache=new Map<string,Promise<any>>();
const queue:Array<()=>void>=[];let active=0;
function pump(){while(active<2 && queue.length)queue.shift()!();}
function instance(key:string,get:(path:string)=>Promise<any>){
  let promise=cache.get(key);if(promise)return promise;
  promise=new Promise((resolve,reject)=>{queue.push(()=>{active++;get(key).then(resolve,reject).finally(()=>{active--;pump();});});pump();});
  cache.set(key,promise);promise.catch(()=>cache.delete(key));
  if(cache.size>200)cache.delete(cache.keys().next().value!);
  return promise;
}
export function NftThumbnail({address,id,record,get}:{address:string;id:string;record?:any;get:(path:string)=>Promise<any>}){
  const key=`${address?.toLowerCase()}:${id}`;
  const ref=useRef<HTMLSpanElement>(null),[resolved,setResolved]=useState<{key:string;value:any}>(),[failedSource,setFailedSource]=useState<string>(),[loadedSource,setLoadedSource]=useState<string>();
  const supplied=matchesNftIdentity(record,address,id) ? record : undefined;
  const source=nftArtwork(supplied) || nftArtwork(resolved?.key===key ? resolved.value : undefined);
  useEffect(()=>{
    if(source || !/^0x[\da-f]{40}$/i.test(address) || !/^\d+$/.test(id))return;
    let mounted=true;
    const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){observer.disconnect();instance(`/explorer/tokens/${address}/instances/${id}`,get).then(value=>{if(mounted && matchesNftIdentity(value,address,id))setResolved({key,value});}).catch(()=>{});}},{rootMargin:"100px"});
    if(ref.current)observer.observe(ref.current);
    return()=>{mounted=false;observer.disconnect();};
  },[address,id,key,source,get]);
  const available=source && failedSource!==source;
  return <span ref={ref} className="nft-thumbnail" aria-hidden="true">{(!available || loadedSource!==source) && <ImageIcon size={21}/>}{available && <img src={thumbnailUrl(source)} alt="" loading="lazy" decoding="async" style={{opacity:loadedSource===source ? 1 : 0}} onLoad={()=>setLoadedSource(source)} onError={()=>setFailedSource(source)}/>}</span>;
}
