import {test} from 'node:test';
import assert from 'node:assert/strict';
import {RollingStore,summarizeBlock,collectRollingWindow,localRpc} from '../server/rolling-metrics.mjs';
const h=n=>'0x'+n.toString(16).padStart(64,'0'),q=n=>'0x'+n.toString(16);
function fixture(n,timestamp,branch=0) {
 const b={number:q(n),timestamp:q(timestamp),hash:h(n+1000+branch),parentHash:h(n+999+branch),gasUsed:q(7),transactions:[h(n*10+20000+branch),h(n*10+20001+branch)]};
 const receipts=b.transactions.map((hash,index)=>({blockHash:b.hash,blockNumber:b.number,transactionHash:hash,transactionIndex:q(index),status:q(index),type:index?'0x2':'0x7e',gasUsed:q(index?4:3),effectiveGasPrice:q(index?11:0),l1Fee:q(index?5:0),cumulativeGasUsed:q(index?7:3)}));
 return {b,receipts};
}
test('receipts reconcile precisely in wei, including failed/deposit transactions and unordered replies',()=>{
 const {b,receipts}=fixture(1,1); const row=summarizeBlock(b,receipts.toReversed());
 assert.deepEqual([row.transactions,row.successful,row.failed,row.deposits,row.feeWei,row.gasUsed],[2,1,1,1,'49','7']);
 receipts[1].effectiveGasPrice='0xffffffffffffffffffff';
 assert.equal(summarizeBlock(b,receipts).feeWei,(BigInt(receipts[1].effectiveGasPrice)*4n+5n).toString());
});
test('a missing fee component does not erase valid transaction counts or become zero fees',()=>{
 for(const change of [{l1Fee:undefined},{operatorFeeScalar:'0x1'},{operatorFeeConstant:'0x1'},{opGasRefund:'0x1'}]) {
  const {b,receipts}=fixture(1,1);Object.assign(receipts[1],change);
  const row=summarizeBlock(b,receipts);assert.equal(row.transactions,2);assert.equal(row.feeWei,null);assert.equal(row.unknownFees,1);
 }
 const {b,receipts}=fixture(1,1);receipts[1].operatorFee='0x7';receipts[1].operatorFeeScalar='0x3';receipts[0].operatorFeeScalar='0x3';
 assert.equal(summarizeBlock(b,receipts).feeWei,'56');
});
test('pruned receipts leave header counts intact, while outcome and fee totals stay unavailable',()=>{
 const store=new RollingStore(':memory:',57073),now=Math.floor(Date.now()/1000);
 try{
  const a=fixture(0,now-1),b=fixture(1,now);store.append([summarizeBlock(a.b,a.receipts),summarizeBlock(b.b,null)]);
  let report=store.snapshot(b.b,now*1000,1);assert.equal(report.transactions,2);assert.equal(report.feeWei,null);assert.equal(report.successful,null);assert.equal(report.failed,null);assert.equal(report.deposits,null);assert.equal(report.missingReceipts,2);
  store.repair(summarizeBlock(b.b,b.receipts));report=store.snapshot(b.b,now*1000,1);assert.equal(report.feeWei,'49');assert.equal(report.successful,1);assert.equal(report.missingReceipts,0);
 }finally{store.close();}
});
test('partial, duplicate, wrong-block and inconsistent receipts are rejected',()=>{
 for(const mutate of [r=>r.pop(),r=>r[1]=r[0],r=>r[1].transactionHash=h(0),r=>r[1].blockHash=h(0),r=>r[1].blockNumber='0x2',r=>r[1].gasUsed='0x5',r=>r[1].status='0x2',r=>r[1].effectiveGasPrice='-1',r=>r[1].gasUsed='0x01',r=>r[1].l1Fee='',r=>r[0].effectiveGasPrice='0x1']) {
  const {b,receipts}=fixture(1,1);mutate(receipts);assert.throws(()=>summarizeBlock(b,receipts));
 }
});
test('open-left window requires its preceding boundary and every canonical block',()=>{
 const store=new RollingStore(':memory:',57073),now=Math.floor(Date.now()/1000),blocks=Array.from({length:5},(_,n)=>fixture(n,now-4+n));
 try{
  store.append(blocks.map(({b,receipts})=>summarizeBlock(b,receipts)));
  const report=store.snapshot(blocks[4].b,now*1000,3);
  assert.deepEqual([report.transactions,report.feeWei,report.window.blocks,report.window.fromBlock,report.window.boundaryBlock],[6,'147',3,2,1]);
  assert.throws(()=>store.snapshot(blocks[4].b,now*1000,5),/coverage/);
  assert.throws(()=>store.snapshot(blocks[4].b,(now+121)*1000,3),/head/);
  assert.throws(()=>store.snapshot({...blocks[4].b,hash:h(9)},now*1000,3),/head/);
  store.db.prepare('DELETE FROM blocks WHERE height=3').run();assert.throws(()=>store.snapshot(blocks[4].b,now*1000,3),/coverage/);
 }finally{store.close();}
});
test('inconsistent appends are atomic; unknown fees preserve an honest null total',()=>{
 const store=new RollingStore(':memory:',57073),now=Math.floor(Date.now()/1000),a=fixture(0,now-2),b=fixture(1,now-1),c=fixture(2,now);
 try{
  store.append([summarizeBlock(a.b,a.receipts)]);
  assert.throws(()=>store.append([summarizeBlock(b.b,b.receipts),{...summarizeBlock(c.b,c.receipts),parentHash:h(0)}]));assert.equal(store.tip().height,0);
  delete c.receipts[1].l1Fee;store.append([summarizeBlock(b.b,b.receipts),summarizeBlock(c.b,c.receipts)]);
  const report=store.snapshot(c.b,now*1000,2);assert.equal(report.transactions,4);assert.equal(report.feeWei,null);assert.equal(report.unknownFees,1);
 }finally{store.close();}
});
test('incremental windows match full independent sums across moving boundaries and sparse timestamps',()=>{
 const store=new RollingStore(':memory:',57073),now=Math.floor(Date.now()/1000),raw=[];
 try{
  for(let n=0;n<150;n++){
   const timestamp=now-300+n*2,f=fixture(n,timestamp);f.receipts[1].l1Fee=q(n*7);
   const row=summarizeBlock(f.b,n%11===0?null:f.receipts);raw.push(row);store.append([row]);
   if(n<15)continue;
   const window=30,report=store.snapshot(f.b,timestamp*1000,window),included=raw.filter(r=>r.timestamp>timestamp-window);
   assert.equal(report.transactions,included.reduce((s,r)=>s+r.transactions,0));
   assert.equal(report.unknownFees,included.reduce((s,r)=>s+r.unknownFees,0));
   assert.equal(report.gasUsed,included.reduce((s,r)=>s+BigInt(r.gasUsed),0n).toString());
   assert.equal(report.feeWei,included.some(r=>r.feeWei===null)?null:included.reduce((s,r)=>s+BigInt(r.feeWei),0n).toString());
   assert.equal(report.window.fromBlock,included[0].height);assert.equal(report.window.blocks,included.length);
  }
 }finally{store.close();}
});
function mockRpc() {
 const now=Math.floor(Date.now()/1000),chain=new Map(Array.from({length:11},(_,n)=>[n,fixture(n,now-10+n)]));let tip=10;
 const calls=[];
 const rpc=async(method,params)=>{
  calls.push({method,params});
  if(method==='eth_chainId')return q(57073);
  if(method==='eth_syncing')return false;
  if(method==='eth_getBlockByNumber')return chain.get(params[0]==='latest'?tip:Number(params[0]))?.b;
  if(method==='eth_getBlockReceipts')return [...chain.values()].find(v=>v.b.hash===params[0])?.receipts;
  throw new Error(method);
 };
 rpc.batch=calls=>Promise.all(calls.map(([method,params])=>rpc(method,params)));
 return {rpc,chain,calls,setTip:n=>tip=n,now};
}
test('collector resumes, repairs same-height reorganizations and supports lower heads',async()=>{
 const store=new RollingStore(':memory:',57073),m=mockRpc();
 try{
  let result=await collectRollingWindow({store,rpc:m.rpc,windowSeconds:5,batchSize:2});assert.equal(result.transactions,10);
  m.calls.length=0;await collectRollingWindow({store,rpc:m.rpc,windowSeconds:5});assert.equal(m.calls.filter(c=>c.method==='eth_getBlockReceipts').length,0);
  for(let n=8;n<=10;n++){const v=fixture(n,m.now-10+n,500);if(n===8)v.b.parentHash=m.chain.get(7).b.hash;v.receipts[1].l1Fee='0xa';m.chain.set(n,v);}
  result=await collectRollingWindow({store,rpc:m.rpc,windowSeconds:5,batchSize:2});assert.equal(result.feeWei,String(5*49+3*5));assert.equal(result.window.toBlockHash,m.chain.get(10).b.hash);
  m.setTip(9);result=await collectRollingWindow({store,rpc:m.rpc,windowSeconds:4});assert.equal(result.window.toBlock,9);assert.equal(store.tip().height,9);
 }finally{store.close();}
});
test('collector rejects wrong network, stale head, cancellation, RPC height changes and late forks',async()=>{
 for(const mode of ['chain','stale','abort','height','fork']) {
  const store=new RollingStore(':memory:',57073),m=mockRpc(),original=m.rpc.batch;
  try{
   let blockReads=0;
   m.rpc.batch=async calls=>{
    const values=await original(calls);
    if(mode==='chain'&&calls[0][0]==='eth_chainId')values[0]=q(1);
    if(mode==='stale'&&calls.some(([m,p])=>m==='eth_getBlockByNumber'&&p[0]==='latest'))values[2]={...values[2],timestamp:q(m.now-121)};
    if(mode==='height'&&calls.length===2&&calls[0][0]==='eth_getBlockByNumber')values[0]={...values[0],number:'0xffff'};
    return values;
   };
   const wrapped=async(method,params)=>{const r=await m.rpc(method,params);if(mode==='fork'&&method==='eth_getBlockByNumber'&&params[0]==='0xa'&&++blockReads>=1)return {...r,hash:h(7000)};return r;};wrapped.batch=m.rpc.batch;
   await assert.rejects(collectRollingWindow({store,rpc:wrapped,windowSeconds:5,batchSize:2,signal:mode==='abort'?AbortSignal.abort():undefined}));
  }finally{store.close();}
 }
 assert.throws(()=>localRpc('https://external.example'));
});
