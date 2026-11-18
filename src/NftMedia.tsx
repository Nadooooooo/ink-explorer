import {useEffect,useState} from 'react';
import {ImageIcon} from 'lucide-react';
import {API} from './network';
import {requestJson} from './api-request';
import {mediaUrl,thumbnailUrl} from './media';

type Props={source?:string;name:string;t:(key:string)=>string};

// Changing artwork discards every state and pending callback from the old source.
export function NftMedia(props:Props) {
  return <NftMediaSource key={props.source||''} {...props}/>;
}

function NftMediaSource({source,name,t}:Props) {
  const inline=source?.startsWith('data:image/');
  const [type,setType]=useState<string|undefined>(inline?'image/':undefined);
  const [previewFailed,setPreviewFailed]=useState(false),[failed,setFailed]=useState(false);
  const [previewLoaded,setPreviewLoaded]=useState(false),[loaded,setLoaded]=useState(false);
  useEffect(()=>{
    if(!source||inline)return;
    const controller=new AbortController();
    requestJson<{type:string}>(`${API}/media?kind=info&url=${encodeURIComponent(source)}`,{signal:controller.signal})
      .then(value=>{if(!controller.signal.aborted)setType(typeof value?.type==='string'?value.type:'');})
      .catch(()=>{if(!controller.signal.aborted)setType('');});
    return()=>controller.abort();
  },[source,inline]);
  const video=type?.startsWith('video/'),original=type!==undefined;
  const playableVideo=video&&!failed,originalImage=original&&!video&&!failed;
  const visibleImage=loaded||previewLoaded&&!previewFailed;
  const unavailable=!source||failed&&(!!inline||previewFailed);
  return <div className="nft-media" aria-busy={!!source&&!unavailable&&!playableVideo&&!visibleImage}>
    {source&&!unavailable&&(playableVideo?
      <video controls playsInline preload="none" poster={previewFailed?undefined:thumbnailUrl(source)} src={mediaUrl(source)} aria-label={name} onError={()=>setFailed(true)}/>:
      <>
        {!inline&&!previewFailed&&(!loaded||failed)&&<img className={`nft-media-preview${previewLoaded?' is-ready':''}`} src={thumbnailUrl(source)} alt={originalImage?'':name} aria-hidden={originalImage||undefined}
          decoding="async" onLoad={()=>setPreviewLoaded(true)} onError={()=>setPreviewFailed(true)}/>}
        {originalImage&&<img className={`nft-media-original${loaded?' is-ready':''}`} src={mediaUrl(source)} alt={name}
          decoding="async" onLoad={()=>setLoaded(true)} onError={()=>{setLoaded(false);setFailed(true);}}/>}
      </>)}
    {(unavailable||!playableVideo&&!visibleImage)&&<div className="nft-placeholder"><ImageIcon aria-hidden="true"/><span>{t(unavailable?'mediaUnavailable':'loadingMedia')}</span></div>}
  </div>;
}
