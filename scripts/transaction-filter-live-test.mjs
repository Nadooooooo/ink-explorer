import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'https://inkexplorer.xyz',out=process.env.FILTER_LIVE_OUTPUT||'reports/filters/public-method';await mkdir(out,{recursive:true});const results=[];
for(const [prefix,rpcPort,chainId]of[['',8545,57073],['/testnet',8645,763373]]){
 const start=performance.now(),response=await fetch(base+prefix+'/api/v1/transactions?methods=0x095EA7B3&status=success',{signal:AbortSignal.timeout(75000)}),data=await response.json();
 assert.equal(response.status,200);assert.equal(data.meta.chainId,chainId);assert(data.items.length>0,'Expected indexed approvals');assert.equal(new Set(data.items.map(x=>x.hash)).size,data.items.length);
 const batch=[{jsonrpc:'2.0',id:0,method:'eth_chainId',params:[]}];
 data.items.forEach((tx,i)=>batch.push({jsonrpc:'2.0',id:2*i+1,method:'eth_getTransactionByHash',params:[tx.hash]},{jsonrpc:'2.0',id:2*i+2,method:'eth_getTransactionReceipt',params:[tx.hash]}));
 const rpc=await(await fetch(`http://127.0.0.1:${rpcPort}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(batch),signal:AbortSignal.timeout(20000)})).json();
 const byId=new Map(rpc.map(x=>[x.id,x.result]));assert.equal(parseInt(byId.get(0),16),chainId);
 const receiptSources=[];
 for(const [i,tx] of data.items.entries()){
  const transaction=byId.get(2*i+1);let receipt=byId.get(2*i+2),receiptSource='local node';
  assert(transaction,`Local transaction missing: ${tx.hash}`);
  if(!receipt && chainId===763373){
   // Some older Sepolia receipts are absent locally. Check the official
   // network RPC independently and retain that provenance in the report.
   const official=await(await fetch('https://rpc-gel-sepolia.inkonchain.com',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify([{jsonrpc:'2.0',id:0,method:'eth_chainId',params:[]},{jsonrpc:'2.0',id:1,method:'eth_getTransactionReceipt',params:[tx.hash]}]),signal:AbortSignal.timeout(15000)})).json();
   assert.equal(parseInt(official.find(x=>x.id===0)?.result,16),chainId);
   receipt=official.find(x=>x.id===1)?.result;receiptSource='official Sepolia RPC (receipt unavailable locally)';
  }
  assert(receipt,`Receipt missing: ${tx.hash}`);
  assert.equal(transaction.input.slice(0,10).toLowerCase(),'0x095ea7b3');assert.equal(receipt.status,'0x1');assert.equal(tx.status,'ok');
  assert.equal(tx.from.hash.toLowerCase(),transaction.from.toLowerCase());assert.equal(tx.to.hash.toLowerCase(),transaction.to.toLowerCase());assert.equal(tx.block_number,parseInt(receipt.blockNumber,16));
  assert.equal(transaction.blockHash,receipt.blockHash);assert.equal(receipt.transactionHash,tx.hash);
  receiptSources.push({hash:tx.hash,block:tx.block_number,receiptSource});
 }
 const result={chainId,items:data.items.length,allSelectorsReceiptsAddressesAndBlocksVerified:true,ms:Math.round(performance.now()-start),next:!!data.next_page_params,decodedMethods:[...new Set(data.items.map(x=>x.method))],receiptSources};results.push(result);console.log({...result,receiptSources:undefined,officialReceiptFallbacks:receiptSources.filter(x=>x.receiptSource!=='local node').length});
}
await writeFile(out+'/results.json',JSON.stringify({base,passed:true,results},null,2));
