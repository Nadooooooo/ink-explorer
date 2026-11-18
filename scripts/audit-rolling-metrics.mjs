import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {localRpc} from '../server/rolling-metrics.mjs';
const out=process.env.ROLLING_AUDIT_OUTPUT||'reports/rolling-metrics';await mkdir(out,{recursive:true});
for(const [network,chainId,port] of [['mainnet',57073,8545],['sepolia',763373,8645]]){
 const started=Date.now(),snapshot=JSON.parse(await readFile(`data/rolling-metrics/${chainId}.json`,'utf8')),rpc=localRpc(`http://127.0.0.1:${port}`);
 assert.equal(snapshot.status,'ready');assert(Date.now()-Date.parse(snapshot.sampledAt)<10000);
 const w=snapshot.window,q=n=>'0x'+n.toString(16),canonical=()=>rpc('eth_getBlockByNumber',[q(w.toBlock),false]);
 assert.equal((await canonical()).hash,w.toBlockHash);
 let total=0,blocks=0;
 for(let n=w.fromBlock;n<=w.toBlock;n+=32){
  const heights=Array.from({length:Math.min(32,w.toBlock-n+1)},(_,i)=>n+i);
  const counts=await rpc.batch(heights.map(h=>['eth_getBlockTransactionCountByNumber',[q(h)]]));
  total+=counts.reduce((s,c)=>s+Number(BigInt(c)),0);blocks+=counts.length;
  if(blocks%8192===0)console.log(JSON.stringify({network,checked:blocks,total}));
 }
 assert.equal(total,snapshot.transactions);assert.equal(blocks,w.blocks);assert.equal((await canonical()).hash,w.toBlockHash);
 const db=new DatabaseSync(`data/rolling-metrics/${chainId}.sqlite`,{readOnly:true});
 const range=db.prepare('SELECT MIN(height) first,MAX(height) last FROM blocks WHERE successful IS NOT NULL AND height BETWEEN ? AND ?').get(w.fromBlock,w.toBlock);
 const sample=Array.from({length:64},(_,i)=>Math.floor(range.first+(range.last-range.first)*i/63));
 let checkedFees=0,receiptCount=0;
 for(const height of sample){
  const row=db.prepare('SELECT * FROM blocks WHERE height=?').get(height),receipts=await rpc('eth_getBlockReceipts',[q(height)]);
  if(receipts===null)continue; // Node pruning may pass an older retained row during the audit.
  assert.equal(receipts.length,row.transactions);
  assert(receipts.every(r=>r.blockHash===row.hash));
  assert(receipts.every(r=>r.operatorFee!=null || BigInt(r.operatorFeeScalar||0)===0n&&BigInt(r.operatorFeeConstant||0)===0n));
  const sum=receipts.reduce((s,r)=>s+BigInt(r.gasUsed)*BigInt(r.effectiveGasPrice)+BigInt(r.l1Fee||0)+BigInt(r.operatorFee||0),0n);
  assert.equal(sum.toString(),row.fee_wei);checkedFees++;receiptCount+=receipts.length;
 }
 db.close();assert(checkedFees>=32);
 const result={network,chainId,startedAt:new Date(started).toISOString(),finishedAt:new Date().toISOString(),snapshot,
  countAudit:{method:'eth_getBlockTransactionCountByNumber',blocks,total,canonicalAnchorBeforeAndAfter:true},
  feeAudit:{sampledBlocks:checkedFees,receipts:receiptCount,complete24hFees:false},passed:true};
 await writeFile(`${out}/${network}-audit.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({network,passed:true,blocks,total,checkedFees,receiptCount,ms:Date.now()-started}));
}
