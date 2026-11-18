import assert from 'node:assert/strict';
import {mkdir,writeFile,appendFile} from 'node:fs/promises';
import {Interface} from 'ethers';
import {queryTransactions} from '../server/transaction-query.mjs';
const base=process.env.BASE_URL||'https://inkexplorer.xyz',mode=process.env.TOKEN_FILTER_MODE||'candidate',output=process.env.TOKEN_FILTER_OUTPUT||'reports/token-filter/real-'+mode;
await mkdir(output,{recursive:true});const results=[];
const end='2026-10-22T08:00:00Z',key=value=>JSON.stringify(Object.entries(value||{}).sort(([a],[b])=>a.localeCompare(b)));
const decode=cursor=>cursor?JSON.parse(Buffer.from(cursor,'base64url').toString()):{next:{},last:null};
const types={
 'ERC-20':new Interface(['event Transfer(address indexed from, address indexed to, uint256 value)','event Deposit(address indexed to,uint256 value)','event Withdrawal(address indexed from,uint256 value)']),
 'ERC-721':new Interface(['event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)']),
 'ERC-1155':new Interface(['event TransferSingle(address indexed operator,address indexed from,address indexed to,uint256 id,uint256 value)','event TransferBatch(address indexed operator,address indexed from,address indexed to,uint256[] ids,uint256[] values)']),
};
const get=async url=>{
 const start=performance.now(),r=await fetch(url,{signal:AbortSignal.timeout(70000)}),text=await r.text();
 await appendFile(output+'/requests.jsonl',JSON.stringify({url,status:r.status,ms:Math.round(performance.now()-start),contentType:r.headers.get('content-type'),...(r.ok?{}:{body:text.slice(0,400)})})+'\n');
 assert.equal(r.status,200,url+' '+text.slice(0,400));try{return JSON.parse(text);}catch{throw Error('Invalid JSON: '+url+' '+text.slice(0,400));}
};
const rpc=async(url,method,params)=>{const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(20000)});assert(r.ok);const d=await r.json();assert(!d.error,JSON.stringify(d.error));return d.result;};
for(const prefix of ['','/testnet'])for(const type of Object.keys(types)){
 const api=base+prefix+'/api',source='https://explorer'+(prefix?'-sepolia':'')+'.inkonchain.com/api/v2',node='http://127.0.0.1:'+(prefix?8645:8545),chainId=prefix?763373:57073;
 assert.equal(parseInt(await rpc(node,'eth_chainId',[]),16),chainId);
 const across=new Set();let previous={};
 for(let page=1;page<=2;page++){
  const filters={transaction_types:type,age_to:end},params=new URLSearchParams({...filters,...previous}),start=performance.now();
  const result=mode==='candidate-http'?await get('http://127.0.0.1:'+(prefix?4326:4325)+'/api/v1/transactions?'+params):mode==='public'?await get(api+'/v1/transactions?'+params):await queryTransactions(params,{get:path=>get(api+'/explorer'+path)});
  const ms=Math.round(performance.now()-start);assert(Array.isArray(result.items));assert(result.items.length>0,'Expected historical transactions');if(mode!=='candidate')assert.equal(result.meta.chainId,chainId);
  await writeFile(`${output}/${chainId}-${type}-${page}-api.json`,JSON.stringify(result,null,2));
  const incoming=decode(previous.cursor),outgoing=result.next_page_params?decode(result.next_page_params.cursor):null,events=[];
  let cursor=incoming.next,sourcePages=0,reached=false;
  for(let i=0;i<3;i++){
   const records=await get(source+'/advanced-filters?'+new URLSearchParams({...filters,...Object.fromEntries(Object.entries(cursor).map(([k,v])=>[k,String(v)]))}));sourcePages++;assert(Array.isArray(records.items));assert(records.items.every(x=>x.token?.type===type));events.push(...records.items);cursor=records.next_page_params;
   if(outgoing?key(cursor)===key(outgoing.next):!cursor){reached=true;break;}
  }
  assert(reached,'Returned cursor must identify exactly the consumed source range');
  const expected=[...new Set(events.map(x=>x.hash.toLowerCase()))].filter(hash=>hash!==incoming.last?.toLowerCase());
  assert.deepEqual(result.items.map(x=>x.hash.toLowerCase()),expected,'No missing, reordered or duplicate parent transactions');
  for(const tx of result.items){assert(!across.has(tx.hash.toLowerCase()),'Duplicate across cursor boundary');across.add(tx.hash.toLowerCase());}
  const receiptProofs=[];
  for(const parent of [result.items[0],result.items[Math.floor(result.items.length/2)],result.items.at(-1)]){
   let transaction=await rpc(node,'eth_getTransactionByHash',[parent.hash]),receipt=await rpc(node,'eth_getTransactionReceipt',[parent.hash]),receiptSource='local node';
   if(!receipt||!transaction){const official=prefix?'https://rpc-gel-sepolia.inkonchain.com':'https://rpc-gel.inkonchain.com';assert.equal(parseInt(await rpc(official,'eth_chainId',[]),16),chainId);if(!receipt)receipt=await rpc(official,'eth_getTransactionReceipt',[parent.hash]);if(!transaction)transaction=await rpc(official,'eth_getTransactionByHash',[parent.hash]);receiptSource=prefix?'official Sepolia RPC':'official Mainnet RPC';}
   assert(transaction&&receipt,`Receipt and transaction required for independent proof: ${chainId} ${parent.hash}`);assert.equal(parent.from.hash.toLowerCase(),transaction.from.toLowerCase());assert.equal(parent.to?.hash?.toLowerCase(),transaction.to?.toLowerCase());assert.equal(BigInt(parent.value),BigInt(transaction.value));assert.equal(parent.block_number,parseInt(receipt.blockNumber,16));assert.equal(parent.status,receipt.status==='0x1'?'ok':'error');
   const event=events.find(x=>x.hash.toLowerCase()===parent.hash.toLowerCase());assert(event);const log=receipt.logs.find(x=>parseInt(x.logIndex,16)===event.token_transfer_index);assert(log);assert.equal(log.address.toLowerCase(),event.token.address_hash.toLowerCase());
   const parsed=types[type].parseLog(log);assert(parsed,`Unknown indexed event: ${chainId} ${parent.hash} ${log.topics[0]}`);
   // The index also represents WETH Deposit/Withdrawal as ERC-20 mint/burn.
   // Prove the actual event and zero-address side rather than requiring Transfer.
   const zero='0x'+'0'.repeat(40),from=parsed.name==='Deposit'?zero:parsed.args.from,to=parsed.name==='Withdrawal'?zero:parsed.args.to;
   assert.equal(from.toLowerCase(),event.from.hash.toLowerCase());assert.equal(to.toLowerCase(),event.to.hash.toLowerCase());
   if(type==='ERC-20')assert.equal(String(parsed.args.value),event.total.value);
   else if(type==='ERC-721')assert.equal(String(parsed.args.tokenId),event.total.token_id);
   else if(parsed.name==='TransferSingle'){assert.equal(String(parsed.args.id),event.total.token_id);assert.equal(String(parsed.args.value),event.total.value);}
   else assert(parsed.args.ids.some((id,i)=>String(id)===event.total.token_id&&String(parsed.args[4][i])===event.total.value));
   receiptProofs.push({hash:parent.hash,receiptSource,log:parseInt(log.logIndex,16),event:parsed.name});
  }
  const row={chainId,type,page,passed:true,ms,sourcePages,eventCount:events.length,parentCount:result.items.length,cursorBoundaryVerified:true,receiptProofs};results.push(row);console.log(JSON.stringify({...row,receiptProofs:receiptProofs.length}));
  await writeFile(output+'/results.json',JSON.stringify({base,mode,complete:false,results},null,2));
  previous=result.next_page_params;if(!previous)break;
 }
}
await writeFile(output+'/results.json',JSON.stringify({base,mode,complete:true,passed:true,results},null,2));
