import {accountInteger} from './address-data';
import {normalizeTokenProfile} from './token-data';

const object=(value:any):value is Record<string,any>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const address=/^0x[\da-f]{40}$/i;
const text=(value:unknown)=>typeof value==='string'?value:undefined;

/** Incomplete metadata may render a disabled identity, never a guessed balance. */
export function normalizeAccountInventory(value:any,account:string,kind:'tokens'|'nft',chainId:number):{items:Record<string,any>[];next_page_params:Record<string,unknown>|null} {
  if(!object(value)||!Array.isArray(value.items)||value.chain_id!=null&&String(value.chain_id)!==String(chainId)||
      value.address_hash!=null&&(typeof value.address_hash!=='string'||value.address_hash.toLowerCase()!==account.toLowerCase()))
    throw new Error('invalidApiResponse');
  const seen=new Set<string>();
  const items=value.items.map((item:any,index:number)=>{
    if(!object(item))throw new Error('invalidApiResponse');
    const rawToken=object(item.token)?item.token:{};
    if(rawToken.address_hash!=null&&(typeof rawToken.address_hash!=='string'||!address.test(rawToken.address_hash)))throw new Error('invalidApiResponse');
    const token:Record<string,any>=rawToken.address_hash?normalizeTokenProfile(rawToken,rawToken.address_hash,chainId):{
      name:text(rawToken.name),symbol:text(rawToken.symbol),type:text(rawToken.type),icon_url:text(rawToken.icon_url),decimals:null,
    };
    token.icon_url=text(token.icon_url);
    const rawId=kind==='nft'?item.id??item.token_id:item.token_id;
    const id=rawId==null?undefined:accountInteger(rawId);
    if(rawId!=null&&id==null)throw new Error('invalidApiResponse');
    const identity=token.address_hash&&(kind==='tokens'||id!=null);
    const key=identity?token.address_hash.toLowerCase()+':'+(id==null?'':BigInt(id)):'unknown:'+index;
    if(seen.has(key))throw new Error('invalidApiResponse');
    seen.add(key);
    const owner=typeof item.owner==='string'?{hash:item.owner}:item.owner;
    if(owner!=null&&(!object(owner)||typeof owner.hash!=='string'||!address.test(owner.hash)))throw new Error('invalidApiResponse');
    if(kind==='nft'&&owner&&token.type==='ERC-721'&&owner.hash.toLowerCase()!==account.toLowerCase())throw new Error('invalidApiResponse');
    const ownerDetails=owner?{...owner,name:text(owner.name),ens_domain_name:text(owner.ens_domain_name),
      implementations:Array.isArray(owner.implementations)?owner.implementations.filter((item:any)=>object(item)&&typeof item.name==='string'):[],
      metadata:object(owner.metadata)?{...owner.metadata,tags:Array.isArray(owner.metadata.tags)?owner.metadata.tags.filter((tag:any)=>object(tag)&&typeof tag.name==='string'):[]}:null}:null;
    return {...item,token,id:kind==='nft'?id:item.id,token_id:id,inventory_key:key,value:identity?accountInteger(item.value):undefined,
      image_url:text(item.image_url),media_url:text(item.media_url),owner:ownerDetails,
      metadata:object(item.metadata)?{...item.metadata,name:text(item.metadata.name),image:text(item.metadata.image),image_url:text(item.metadata.image_url)}:null};
  });
  const cursor=value.next_page_params;
  if(cursor!=null&&(!object(cursor)||Object.values(cursor).some(field=>field!=null&&!['string','number','boolean'].includes(typeof field)||typeof field==='number'&&!Number.isFinite(field))))
    throw new Error('invalidApiResponse');
  return{items,next_page_params:cursor&&Object.keys(cursor).length?cursor:null};
}
