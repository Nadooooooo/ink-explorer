import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {queryTransactions} from '../server/transaction-query.mjs';
const base=process.env.BASE_URL||'https://inkexplorer.xyz',mode=process.env.FILTER_REAL_MODE||'candidate';
const output=process.env.FILTER_REAL_OUTPUT||'reports/filter-integrity/real-'+mode;
const samples=JSON.parse(await readFile('reports/filter-integrity/before-real.json','utf8')),results=[];
assert.equal(samples.length,2);
const get=async url=>{const r=await fetch(url,{signal:AbortSignal.timeout(70000)});assert.equal(r.status,200,url);return r.json();};
for(const sample of samples){
 const {prefix,failed,query}=sample,api=base+prefix+'/api',rpc='http://127.0.0.1:'+(prefix?8645:8545);
 const post=async(method,params)=>{const r=await fetch(rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(20000)});assert.equal(r.status,200);const j=await r.json();assert(!j.error);return j.result;};
 const chainId=parseInt(await post('eth_chainId',[]),16);assert.equal(chainId,prefix?763373:57073);
 const receipt=await post('eth_getTransactionReceipt',[failed.hash]),tx=await post('eth_getTransactionByHash',[failed.hash]);
 assert(receipt&&tx);assert.equal(receipt.status,'0x0');assert.equal(tx.from.toLowerCase(),query.from_address_hashes_to_include.toLowerCase());assert.equal(tx.hash,failed.hash);
 const block=await post('eth_getBlockByNumber',[receipt.blockNumber,false]);assert.equal(Date.parse(failed.timestamp),parseInt(block.timestamp,16)*1000);
 const tests=[
  ['failed',{...query,status:'failed'},true],
  ['success',{...query,status:'success'},false],
  ['all statuses',query,true],
  ['parent method',{...query,status:'failed',methods:tx.input.slice(0,10).toUpperCase().replace('0X','0x')},true],
  ['recipient AND',{...query,status:'failed',to_address_hashes_to_include:tx.to},true],
  ['wrong recipient AND',{...query,status:'failed',to_address_hashes_to_include:'0x'+'0'.repeat(40)},false],
  ['sender OR recipient',{...query,status:'failed',to_address_hashes_to_include:'0x'+'0'.repeat(40),address_relation:'or'},true],
  ['outside time window',{...query,status:'failed',age_from:new Date(Date.parse(failed.timestamp)+1000).toISOString(),age_to:new Date(Date.parse(failed.timestamp)+1000).toISOString()},false],
 ];
 for(const [name,filters,expected] of tests){
  const params=new URLSearchParams(filters),result=mode==='public'?await get(api+'/v1/transactions?'+params):await queryTransactions(params,{get:path=>get(api+'/explorer'+path)});
  assert(Array.isArray(result.items));assert.equal(result.items.some(x=>x.hash===failed.hash),expected,name);
  if(expected)assert.equal(result.items.find(x=>x.hash===failed.hash).status,'error');
  assert.equal(new Set(result.items.map(x=>x.hash)).size,result.items.length);if(mode==='public')assert.equal(result.meta.chainId,chainId);
  results.push({chainId,name,passed:true,count:result.items.length,knownFailedHash:failed.hash,receiptStatus:receipt.status});console.log(JSON.stringify(results.at(-1)));
 }
}
await mkdir(output,{recursive:true});await writeFile(output+'/results.json',JSON.stringify({base,mode,passed:true,independentReceiptAndTimestampProof:true,results},null,2));
