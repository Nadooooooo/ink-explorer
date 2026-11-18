import {useEffect,useRef,useState} from 'react';
import {requestJson} from './api-request';
import {API} from './network';
import {nftArtwork} from './nft-artwork';
export {nftArtwork} from './nft-artwork';

const cache=new Map<string,Promise<any>>();
const queue:Array<()=>void>=[];let active=0;
function pump(){while(active<2&&queue.length)queue.shift()!();}
function recover(path:string) {
  let request=cache.get(path);if(request)return request;
  request=new Promise((resolve,reject)=>{queue.push(()=>{active++;requestJson(`${API}${path}`).then(resolve,reject).finally(()=>{active--;pump();});});pump();});
  cache.set(path,request);request.catch(()=>cache.delete(path));if(cache.size>200)cache.delete(cache.keys().next().value!);
  return request;
}
/** Resolve missing artwork only near the viewport, without delaying the holdings. */
export function useNftArtwork(item:any) {
  const ref=useRef<HTMLDivElement>(null),[recovered,setRecovered]=useState<{key:string;value:any}>();
  const address=item.token?.address_hash,id=String(item.id??item.token_id??''),key=`${API}:${address}:${id}`;
  const source=nftArtwork(item),artwork=source?item:recovered?.key===key?recovered.value:item;
  useEffect(()=>{
    if(source||!/^0x[\da-f]{40}$/i.test(address||'')||!/^\d+$/.test(id))return;
    let mounted=true;
    const observer=new IntersectionObserver(entries=>{
      if(entries.some(entry=>entry.isIntersecting)){
        observer.disconnect();recover(`/explorer/tokens/${address}/instances/${id}`).then(value=>{
          if(mounted&&String(value?.id)===id&&(!value?.token?.address_hash||value.token.address_hash.toLowerCase()===address.toLowerCase()))setRecovered({key,value});
        }).catch(()=>{if(mounted)setRecovered({key,value:{}});});
      }
    },{rootMargin:'200px'});
    if(ref.current)observer.observe(ref.current);
    return()=>{mounted=false;observer.disconnect();};
  },[source,address,id,key]);
  return {ref,source:nftArtwork(artwork),name:typeof artwork.metadata?.name==='string'?artwork.metadata.name:undefined,
    resolving:!source&&/^0x[\da-f]{40}$/i.test(address||'')&&/^\d+$/.test(id)&&recovered?.key!==key};
}
