import {accountInteger} from './address-data';
import {normalizeTokenProfile} from './token-data';

const object=(value:any):value is Record<string,any>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const address=/^0x[\da-f]{40}$/i;
const text=(value:unknown)=>typeof value==='string'?value:undefined;
const invalid=()=>{throw new Error('invalidApiResponse');};
function scope(value:any,contract:string,chainId:number) {
  if(!object(value)||value.chain_id!=null&&String(value.chain_id)!==String(chainId)||
    value.token_address_hash!=null&&(typeof value.token_address_hash!=='string'||value.token_address_hash.toLowerCase()!==contract.toLowerCase()))invalid();
}
function entity(value:any,chainId:number) {
  if(value==null)return null;
  const item=typeof value==='string'?{hash:value}:value;
  if(!object(item)||typeof item.hash!=='string'||!address.test(item.hash)||item.chain_id!=null&&String(item.chain_id)!==String(chainId))return invalid();
  return {...item,name:text(item.name),ens_domain_name:text(item.ens_domain_name),
    implementations:Array.isArray(item.implementations)?item.implementations.filter((v:any)=>object(v)&&typeof v.name==='string'):[],
    metadata:object(item.metadata)?{...item.metadata,tags:Array.isArray(item.metadata.tags)?item.metadata.tags.filter((v:any)=>object(v)&&typeof v.name==='string'):[]}:null};
}

/** Scope ownership to a precise collection, network and lossless uint256 token ID. */
export function normalizeNftInstance(value:any,contract:string,requestedId:string|undefined,chainId:number):Record<string,any> {
  scope(value,contract,chainId);
  const rawId=accountInteger(value.id??value.token_id);
  if(rawId==null||BigInt(rawId)>=2n**256n||requestedId!=null&&BigInt(rawId)!==BigInt(requestedId))return invalid();
  const token=value.token==null?undefined:normalizeTokenProfile(value.token,contract,chainId);
  const metadata=object(value.metadata)?value.metadata:null;
  return {...value,id:BigInt(rawId).toString(),token,owner:entity(value.owner,chainId),creator:entity(value.creator??value.creator_address_hash,chainId),
    image_url:text(value.image_url),media_url:text(value.media_url),external_app_url:text(value.external_app_url),
    transfers_count:accountInteger(value.transfers_count),raw_metadata:metadata,
    metadata:metadata?{...metadata,name:text(metadata.name),description:text(metadata.description),image:text(metadata.image),image_url:text(metadata.image_url),
      attributes:Array.isArray(metadata.attributes)?metadata.attributes.filter(object).map((v:any)=>({trait_type:text(v.trait_type),key:text(v.key),value:typeof v.value==='object'?JSON.stringify(v.value):String(v.value??'—')})):[]}:null};
}

export function normalizeNftInstances(value:any,contract:string,chainId:number):{items:Record<string,any>[];next_page_params:Record<string,unknown>|null} {
  scope(value,contract,chainId);if(!Array.isArray(value.items))return invalid();
  const seen=new Set<string>(),items=value.items.map((item:any)=>{
    const nft=normalizeNftInstance(item,contract,undefined,chainId);if(seen.has(nft.id))return invalid();seen.add(nft.id);return nft;
  });
  const cursor=value.next_page_params;
  if(cursor!=null&&(!object(cursor)||Object.values(cursor).some(field=>field!=null&&!['string','number','boolean'].includes(typeof field)||typeof field==='number'&&!Number.isFinite(field))))return invalid();
  return{items,next_page_params:cursor&&Object.keys(cursor).length?cursor:null};
}

export function normalizeNftTransferCount(value:any,contract:string,tokenId:string,chainId:number) {
  scope(value,contract,chainId);
  if(value.id!=null&&(accountInteger(value.id)==null||BigInt(value.id)!==BigInt(tokenId)))return invalid();
  return{transfers_count:accountInteger(value.transfers_count)};
}
