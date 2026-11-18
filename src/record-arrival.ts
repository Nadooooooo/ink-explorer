import {validIndexedBlockResource,recognizeBlockIndexing} from './block-indexing';
import {recognizeTransactionIndexing} from './transaction-indexing';
import {formatWei,formatChainAmount,transactionState} from './explorer-data';
import {STATISTICS_MAX_AGE} from './statistics-data';
import {normalizeAddressProfile} from './address-data';
import {profileAddressBalance} from './address-balance';
import {normalizeTokenProfile,tokenOnchainCap,tokenUsd} from './token-data';
import {validBlockRouteIdentifier} from './page-seo';

export type RecordKind='block'|'transaction'|'address'|'token';
export type RecordArrival={schema:1;kind:RecordKind;id:string;chainId:number;issuedAt:number;sourceAt?:string;phase:'ready'|'indexing'|'unavailable';data?:Record<string,any>};
export type RecordRow={label:string;value:string;href?:string;identifier?:boolean};
export const INITIAL_RECORD_TTL=10_000;
// Profiles use the same source-age boundary in the document and the client.
// The origin has nested 15 s and 5 s caches; age alone does not mark them stale.
export const recordSourceMaxAge=(kind:RecordKind)=>kind==='address'||kind==='token'?STATISTICS_MAX_AGE:15000;
const hash=/^0x[\da-f]{64}$/i, address=/^0x[\da-f]{40}$/i;
const object=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export function recordRoute(path:string):{kind:RecordKind;id:string}|null {
  const profile=path.match(/^\/(address|token)\/(0x[\da-f]{40})$/i);
  if(profile)return {kind:profile[1].toLowerCase() as 'address'|'token',id:profile[2]};
  const match=path.match(/^\/(block|tx)\/([^/]+)$/i);
  if(!match)return null;
  const kind=match[1].toLowerCase()==='block'?'block':'transaction';
  if(!(kind==='block'?validBlockRouteIdentifier(match[2]):hash.test(match[2])))return null;
  return {kind,id:match[2]};
}
export function validRecordData(kind:RecordKind,id:string,value:unknown,chainId?:number) {
  if(kind==='address'||kind==='token'){
    try {
      if(!object(value)||'code' in value)return false;
      (kind==='address'?normalizeAddressProfile:normalizeTokenProfile)(value,id,chainId??57073);
      return true;
    }catch{return false;}
  }
  return kind==='block'?validIndexedBlockResource(value,id,'block'):
    object(value)&&!('code' in value)&&typeof value.hash==='string'&&hash.test(value.hash)&&value.hash.toLowerCase()===id.toLowerCase();
}
export function validRecordIndexing(kind:RecordKind,id:string,chainId:number,value:unknown) {
  return kind==='block'?!!recognizeBlockIndexing(value,id,chainId):kind==='transaction'&&!!recognizeTransactionIndexing(value,id,chainId);
}
export function validRecordArrival(value:unknown,kind:RecordKind,id:string,chainId:number,now=Date.now()):value is RecordArrival {
  if(!object(value)||value.schema!==1||value.kind!==kind||typeof value.id!=='string'||value.id.toLowerCase()!==id.toLowerCase()||value.chainId!==chainId||!Number.isFinite(value.issuedAt)||value.issuedAt>now+1000||now-value.issuedAt>INITIAL_RECORD_TTL)return false;
  if(value.phase==='ready')return typeof value.sourceAt==='string'&&Number.isFinite(Date.parse(value.sourceAt))&&Date.parse(value.sourceAt)<=now+1000&&now-Date.parse(value.sourceAt)<recordSourceMaxAge(kind)&&validRecordData(kind,id,value.data,chainId);
  return value.phase==='indexing'?validRecordIndexing(kind,id,chainId,value.data):value.phase==='unavailable'&&value.data===undefined;
}
const scalar=(value:unknown)=>typeof value==='string'&&value.length<=1024?value:typeof value==='number'&&Number.isFinite(value)?String(value):undefined;
const account=(value:any)=>typeof value==='string'?value:typeof value?.hash==='string'?value.hash:'';
export function recordOverview(arrival:RecordArrival,locale:string,t:(key:string)=>string,basePath='') {
  const d=arrival.phase==='ready'?arrival.data:undefined,rows:RecordRow[]=[];
  const number=(v:unknown)=>{const s=scalar(v);if(s===undefined||!/^\d+$/.test(s)||s.length>80)return 'N/A';return new Intl.NumberFormat(locale).format(BigInt(s));};
  const amount=(v:unknown)=>{const s=scalar(v);return s!==undefined&&/^\d+$/.test(s)&&s.length<=80?formatWei(s,locale)+' ETH':'N/A';};
  const measured=(v:unknown,unit:string)=>{const value=number(v);return value==='N/A'?value:value+' '+unit;};
  const link=(path:string)=>basePath+path+(locale==='en'?'':'?lang='+locale);
  const add=(label:string,value:string,href?:string,identifier=false)=>rows.push({label:t(label),value,href,identifier});
  const identity=(label:string,v:unknown,type:'block'|'address')=>{const s=scalar(v);add(label,s||'N/A',s&&(type==='block'?hash:address).test(s)?link('/'+type+'/'+s):undefined,true);};
  const time=(value:unknown)=>{const s=scalar(value),date=s?new Date(s):undefined;return date&&Number.isFinite(date.getTime())?new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'medium',timeZone:'UTC'}).format(date)+' UTC':'N/A';};
  const title=arrival.kind==='block'?t('blockKind')+(hash.test(arrival.id)?'':' #'+number(d?.height??arrival.id)):arrival.kind==='transaction'?t('Transaction details'):arrival.kind==='token'?(scalar(d?.name)||t('Token')):(scalar(d?.name)||t('address'));
  if(d){
    if(arrival.kind==='block'){
      identity('blockHash',d.hash,'block');add('timestamp',time(d.timestamp));add('transactions',number(d.transactions_count),link('/block/'+d.hash)+(locale==='en'?'?':'&')+'tab=transactions');
      add('size',measured(d.size,'B'));add('gasUsed',number(d.gas_used));add('gasLimit',number(d.gas_limit));add('baseFee',measured(d.base_fee_per_gas,'wei'));add('l2Fees',amount(d.transaction_fees));identity('Beneficiary',account(d.miner),'address');identity('parentBlock',d.parent_hash,'block');
    }else if(arrival.kind==='transaction'){
      add('Status',t(transactionState(d)));add('block',number(d.block_number),/^\d+$/.test(String(d.block_number))?link('/block/'+d.block_number):undefined);add('timestamp',time(d.timestamp));identity('from',account(d.from),'address');identity('to',account(d.to||d.created_contract),'address');add('value',amount(d.value));add('transactionFee',amount(d.fee?.value));add('gasUsed',number(d.gas_used));add('gasLimit',number(d.gas_limit));add('gasPrice',measured(d.gas_price,'wei'));add('method',scalar(d.method)||'N/A');add('nonce',number(d.nonce));
    }else if(arrival.kind==='address'){
      const profile=normalizeAddressProfile(d,arrival.id,arrival.chainId);
      const balance=profileAddressBalance(profile,arrival.id,arrival.chainId,arrival.issuedAt);
      add('ETH balance',amount(balance?.balance));
      add(t('ETH balance')+' · '+t('block'),number(balance?.block.number),balance?link('/block/'+balance.block.hash):undefined);
      add('Type',profile.is_contract===true?t('smartContract'):profile.is_contract===false?t('address'):'N/A');
      add('verifiedSource',profile.is_verified===true?t('Yes'):profile.is_verified===false?t('No'):'N/A');
      if(profile.creator_address_hash)identity('creator',profile.creator_address_hash,'address');
      if(typeof profile.token?.address_hash==='string'&&profile.token.address_hash.toLowerCase()===arrival.id.toLowerCase())add('Token',scalar(profile.token.name)||scalar(profile.token.symbol)||arrival.id,link('/token/'+arrival.id));
    }else{
      const profile=normalizeTokenProfile(d,arrival.id,arrival.chainId);
      identity('Contract',profile.address_hash,'address');add('Token',scalar(profile.symbol)||'N/A');add('Type',scalar(profile.type)||'N/A');
      add('Price',tokenUsd(profile.exchange_rate,locale,'price'));add('Holders',number(profile.holders_count));
      add('Total supply',formatChainAmount(profile.total_supply,profile.decimals??0,locale).replace(/^—$/,'N/A')+(profile.decimals==null?' '+t('base units'):profile.symbol?' '+profile.symbol:''));
      add('On-chain market cap',tokenUsd(tokenOnchainCap(profile),locale,'cap'));
    }
  }
  return {title,identifier:hash.test(arrival.id)||address.test(arrival.id)?arrival.id:undefined,rows,sourceAt:arrival.sourceAt?time(arrival.sourceAt):undefined};
}
