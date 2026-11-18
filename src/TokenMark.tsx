import { useState } from 'react';
import { Coins } from 'lucide-react';
import { logoUrl } from './media';
export function TokenMark({token,eager=false}:{token:Record<string,any>;eager?:boolean}) {
  const [failedUrl,setFailedUrl]=useState<string>();
  return <span className="token-logo" aria-hidden="true">{token.icon_url&&failedUrl!==token.icon_url ? <img src={logoUrl(token.icon_url)} alt="" loading={eager?'eager':'lazy'} decoding="async" onError={()=>setFailedUrl(token.icon_url)}/> : <Coins size={24}/>}</span>;
}
