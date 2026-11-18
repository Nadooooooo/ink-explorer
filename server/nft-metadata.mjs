import {Interface} from 'ethers';
import {createPublicResourceReader} from './media-cache.mjs';

const abi=new Interface(['function tokenURI(uint256) view returns (string)','function uri(uint256) view returns (string)']);
const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
export function createNftMetadataReader({rpc,readResource=createPublicResourceReader()}) {
  const cache=new Map(),pending=new Map();
  return async(contract,id,type)=>{
    if(!/^0x[\da-f]{40}$/i.test(contract)||!/^\d+$/.test(id)||BigInt(id)>=2n**256n)throw Error('Invalid NFT identity');
    const key=contract.toLowerCase()+':'+BigInt(id),cached=cache.get(key);
    if(cached&&cached.until>Date.now())return cached.value;
    if(pending.has(key))return pending.get(key);
    const request=(async()=>{
      const method=type==='ERC-1155'?'uri':'tokenURI';
      const result=await rpc('eth_call',[{to:contract,data:abi.encodeFunctionData(method,[id])},'latest'],AbortSignal.timeout(5000));
      const uri=abi.decodeFunctionResult(method,result)[0].replaceAll('{id}',BigInt(id).toString(16).padStart(64,'0'));
      let metadata;
      if(uri.startsWith('data:application/json')){
        if(uri.length>1400000)throw Error('Metadata exceeds size limit');
        const match=uri.match(/^data:application\/json(?:;charset=utf-8)?(;base64)?,(.*)$/s);if(!match)throw Error('Unsupported metadata');
        metadata=JSON.parse(match[1]?Buffer.from(match[2],'base64').toString('utf8'):decodeURIComponent(match[2]));
      } else {
        const resource=await readResource(uri,{types:new Set(['application/json','text/plain','application/octet-stream']),maxBytes:1024*1024});metadata=JSON.parse(resource.body.toString('utf8'));
      }
      if(!object(metadata))throw Error('Invalid NFT metadata');
      const value={metadata,image_url:typeof(metadata.image||metadata.image_url)==='string'?metadata.image||metadata.image_url:null,
        animation_url:typeof metadata.animation_url==='string'?metadata.animation_url:null};
      cache.set(key,{value,until:Date.now()+3600000});if(cache.size>200)cache.delete(cache.keys().next().value);
      return value;
    })();
    pending.set(key,request);try{return await request;}finally{pending.delete(key);}
  };
}
