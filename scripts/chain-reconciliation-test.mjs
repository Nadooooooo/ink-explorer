import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { executionFee } from '../src/explorer-data.ts';

const base=process.env.BASE_URL || 'http://127.0.0.1:4188';
const observations=[];
await mkdir('reports/chain-reconciliation',{recursive:true});
await writeFile('reports/chain-reconciliation/request-failures.json','[]\n');
async function rpc(url,method,params=[]) {
  const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(15000)});
  assert(response.ok,`RPC HTTP ${response.status}`);
  const value=await response.json();
  if(value.error)throw new Error(`${method}: ${value.error.message}`);
  return value.result;
}
async function get(path) {
  for(let attempt=0;attempt<3;attempt++) {
    const response=await fetch(base+path,{signal:AbortSignal.timeout(25000)});
    if(response.ok)return response.json();
    const body=await response.text();
    observations.push({at:new Date().toISOString(),path,attempt:attempt+1,status:response.status,error:body.slice(0,600)});
    await writeFile('reports/chain-reconciliation/request-failures.json',JSON.stringify(observations,null,2));
    // A short gateway outage may outlast the server's own bounded retries.
    // Repeat the identical read, without skipping records or weakening equality.
    // Permanent upstream errors and malformed successful JSON fail immediately.
    const transient=response.status===429 || ([502,503,504].includes(response.status) &&
      /Upstream returned (?:429|502|503|504)|fetch failed|aborted|timed?\s*out/i.test(body));
    if(!transient || attempt===2)assert.fail(`Explorer ${path}: HTTP ${response.status}: ${body.slice(0,600)}`);
    await new Promise(resolve=>setTimeout(resolve,(attempt+1)*2000));
  }
}
const results=[];
for (const [prefix,chainId,local,publicRpc] of [
  ['',57073,'http://127.0.0.1:8545','https://rpc-gel.inkonchain.com'],
  ['/testnet',763373,'http://127.0.0.1:8645','https://rpc-gel-sepolia.inkonchain.com'],
]) {
  const api=prefix+'/api';
  const [snapshot,chain,blocks]=await Promise.all([get(api+'/network'),rpc(local,'eth_chainId'),get(api+'/explorer/blocks')]);
  assert.equal(Number(chain),chainId);assert.equal(snapshot.chainId,chainId);assert(snapshot.online && snapshot.synced);
  assert(Array.isArray(blocks.items)&&blocks.items.length);
  // Stay behind the moving unsafe tip; compare the same immutable height.
  const height=Number(blocks.items[0].height)-120, tag='0x'+height.toString(16);
  const [indexed,node,reference]=await Promise.all([get(api+'/explorer/blocks/'+height),rpc(local,'eth_getBlockByNumber',[tag,false]),rpc(publicRpc,'eth_getBlockByNumber',[tag,false])]);
  assert.equal(indexed.hash,node.hash);assert.equal(node.hash,reference.hash);
  assert.equal(indexed.parent_hash,node.parentHash);assert.equal(indexed.height,Number(node.number));
  assert.equal(Date.parse(indexed.timestamp)/1000,Number(node.timestamp));
  assert.equal(BigInt(indexed.gas_used),BigInt(node.gasUsed));
  assert.equal(BigInt(indexed.gas_limit),BigInt(node.gasLimit));
  assert.equal(Number(indexed.transactions_count),node.transactions.length);
  const transactions=[];let cursor='',pages=0;
  do {
    const value=await get(api+`/explorer/blocks/${height}/transactions`+cursor);
    transactions.push(...value.items);pages++;
    cursor=value.next_page_params?'?'+new URLSearchParams(Object.entries(value.next_page_params).filter(([,v])=>v!=null).map(([k,v])=>[k,String(v)])):'';
    assert(pages<100,'A block cursor must terminate');
  } while(cursor);
  assert.deepEqual([...new Set(transactions.map(tx=>tx.hash))].sort(),[...node.transactions].sort(),'Complete block transaction set must match the node');
  const receipts=[];
  for(const tx of transactions.slice(0,5)) {
    const [detail,receipt]=await Promise.all([get(api+'/explorer/transactions/'+tx.hash),rpc(local,'eth_getTransactionReceipt',[tx.hash])]);
    assert.equal(receipt.blockHash,indexed.hash);assert.equal(detail.block_number,height);
    assert.equal(detail.status,Number(receipt.status)===1?'ok':'error');
    assert.equal(BigInt(detail.gas_used),BigInt(receipt.gasUsed));
    assert.equal(BigInt(executionFee(detail)),BigInt(receipt.gasUsed)*BigInt(receipt.effectiveGasPrice));
    if(receipt.l1Fee!=null)assert.equal(BigInt(detail.l1_fee),BigInt(receipt.l1Fee));
    receipts.push(tx.hash);
  }
  const address='0x4200000000000000000000000000000000000006';
  const profile=await get(api+'/explorer/addresses/'+address);
  assert.equal(profile.hash.toLowerCase(),address.toLowerCase());
  const balanceHeight=profile.block_number_balance_updated_at;
  assert(Number.isSafeInteger(balanceHeight));
  assert.equal(profile.balance_check?.source,'local','The displayed balance must identify its verified node source');
  const balanceBlock=profile.balance_check.block_hash;
  const [balance,indexedHeight,publicHeight]=await Promise.all([
    rpc(local,'eth_getBalance',[address,{blockHash:balanceBlock,requireCanonical:true}]),
    rpc(local,'eth_getBlockByNumber',['0x'+balanceHeight.toString(16),false]),
    rpc(publicRpc,'eth_getBlockByNumber',['0x'+balanceHeight.toString(16),false]),
  ]);
  assert.equal(indexedHeight.hash,balanceBlock);assert.equal(publicHeight.hash,balanceBlock);
  assert.equal(BigInt(profile.coin_balance),BigInt(balance),'Compare balance at the indexed update height, never across different blocks');
  assert.equal(profile.is_contract,(await rpc(local,'eth_getCode',[address,'latest']))!=='0x');
  const finalizedTag='0x'+snapshot.finalizedBlock.toString(16);
  const [finalized,publicFinalized]=await Promise.all([rpc(local,'eth_getBlockByNumber',[finalizedTag,false]),rpc(publicRpc,'eth_getBlockByNumber',[finalizedTag,false])]);
  assert.equal(finalized.hash,publicFinalized.hash);
  results.push({chainId,checkedAt:new Date().toISOString(),height,hash:node.hash,transactions:transactions.length,pages,receipts,address,balanceHeight,balanceWei:profile.coin_balance,balanceCheck:profile.balance_check,finalizedHeight:snapshot.finalizedBlock,finalizedHash:finalized.hash,derivation:snapshot.derivation});
}
await mkdir('reports/chain-reconciliation',{recursive:true});
await writeFile('reports/chain-reconciliation/results.json',JSON.stringify({recordedAt:new Date().toISOString(),requestFailures:observations,results},null,2));
console.log(JSON.stringify(results,null,2));
