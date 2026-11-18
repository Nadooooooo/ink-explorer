import { test } from "node:test";
import assert from "node:assert/strict";
import { createCanonicalFeed, receiptFee, utilization, normalizedTransactions } from "../server/canonical-feed.mjs";

const block = (n,parent=`h${n-1}`,hash=`h${n}`) => ({ number:`0x${n.toString(16)}`,hash,parentHash:parent,timestamp:"0x64",gasUsed:"0xa",gasLimit:"0x64",size:"0xa",miner:"miner",transactions:[{hash:`tx-${hash}`,from:"sender",to:"target",input:"0x12345678",value:"0x0",transactionIndex:"0x0"}] });
test("utilization weights gas capacity and rejects an incomplete/disconnected window",()=>{
  const blocks=[{height:1,hash:"1",parent_hash:"0",gas_used:"10",gas_limit:"100",timestamp:"t"},{height:2,hash:"2",parent_hash:"1",gas_used:"45",gas_limit:"50",timestamp:"t"}];
  assert.equal(utilization(blocks,2).percentage,36.666666);
  assert.equal(utilization(blocks,30),null);
  assert.equal(utilization([blocks[0],{...blocks[1],parent_hash:"other"}],2),null);
});
test("fee includes L1 and explicit operator charges, never an unsupported scalar guess",()=>{
  assert.equal(receiptFee({gasUsed:"0xa",effectiveGasPrice:"0x2",l1Fee:"0x3",operatorFee:"0x4"}).value,"27");
  assert.equal(receiptFee({gasUsed:"0xa",effectiveGasPrice:"0x2"}),null);
  assert.equal(receiptFee({gasUsed:"0xa",effectiveGasPrice:"0x2",l1Fee:"0x3",operatorFeeScalar:"0x1"}),null);
});
test("inclusion is not success; orphan receipts cannot change status",()=>{
  const item=block(4);assert.equal(normalizedTransactions(item)[0].status,null);
  const receipt={transactionHash:"tx-h4",blockHash:"wrong",status:"0x1"};
  assert.equal(normalizedTransactions(item,[receipt])[0].status,null);
  assert.equal(normalizedTransactions(item,[{...receipt,blockHash:"h4",status:"0x0"}])[0].status,"error");
});
test("catches up missed heads, replaces same-height forks, rejects out-of-order delivery",async()=>{
  const db=new Map(),canonical=new Map();
  const save=b=>{db.set(b.hash,b);canonical.set(b.number,b);};
  for(let i=1;i<=6;i++)save(block(i));
  const events=[];const feed=createCanonicalFeed({window:3,onUpdate:(s,e)=>events.push([s,e]),rpc:async(method,[id])=>method==="eth_getBlockByHash"?db.get(id):method==="eth_getBlockByNumber"?canonical.get(id):[]});
  await feed.accept(db.get("h3"));await feed.accept(db.get("h6"));
  assert.deepEqual(feed.snapshot().blocks.map(b=>b.height),[6,5,4]);
  await feed.accept(db.get("h4"));assert.equal(feed.snapshot().block.height,6);
  const fork5=block(5,"h4","fork5"),fork6=block(6,"fork5","fork6");save(fork5);save(fork6);
  await feed.accept(fork6);assert.deepEqual(feed.snapshot().blocks.map(b=>b.hash),["fork6","fork5","h4"]);
  assert.ok(!feed.snapshot().transactions.some(tx=>tx.hash==="tx-h5"));assert.ok(events.length>1);
});
test("late receipts for a removed block cannot resurrect its transactions",async()=>{
  const old=block(1),replacement=block(1,"h0","replacement");let current=old,release;
  const feed=createCanonicalFeed({window:1,onUpdate:()=>{},rpc:async(method,[id])=>method==="eth_getBlockByNumber"?current:method==="eth_getBlockReceipts"&&id===old.hash?new Promise(resolve=>release=resolve):[]});
  await feed.accept(old);current=replacement;await feed.accept(replacement);
  release([{transactionHash:"tx-h1",blockHash:"h1",status:"0x1"}]);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(feed.snapshot().transactions[0].hash,"tx-replacement");assert.equal(feed.snapshot().transactions[0].status,null);
});
test('receipt recovery covers the entire window with bounded parallel work',async()=>{
 const blocks=Array.from({length:8},(_,i)=>block(i+1)),byHash=new Map(blocks.map(b=>[b.hash,b]));
 let active=0,maximum=0;const calls=[];
 const feed=createCanonicalFeed({window:8,onUpdate:()=>{},rpc:async(method,[key])=>{
  if(method==='eth_getBlockByHash')return byHash.get(key);
  if(method==='eth_getBlockByNumber')return blocks.find(b=>b.number===key);
  active++;maximum=Math.max(maximum,active);calls.push(key);await new Promise(r=>setTimeout(r,5));active--;
  return [{blockHash:key,transactionHash:`tx-${key}`,status:'0x1'}];
 }});
 await feed.accept(blocks.at(-1));
 for(let i=0;i<100 && feed.snapshot().transactions.some(tx=>tx.status==null);i++)await new Promise(r=>setTimeout(r,5));
 assert.equal(calls.length,8);assert.ok(maximum<=3);assert.ok(feed.snapshot().transactions.every(tx=>tx.status==='ok'));
});
test('slow RPC coalesces queued heads and reconstructs the newest contiguous tip',async()=>{
 const blocks=Array.from({length:100},(_,i)=>block(i+1)),byHash=new Map(blocks.map(b=>[b.hash,b]));let release,calls=0;
 const feed=createCanonicalFeed({window:3,onUpdate:()=>{},rpc:async(method,[key])=>{
  if(method==='eth_getBlockReceipts')return [];
  if(method==='eth_getBlockByHash')return byHash.get(key);
  calls++;if(calls===1)await new Promise(resolve=>release=resolve);
  return blocks.find(b=>b.number===key);
 }});
 const first=feed.accept(blocks[2]);const queued=[];for(const b of blocks.slice(3))queued.push(feed.accept(b));release();await Promise.all([first,...queued]);
 assert.equal(feed.snapshot().block.height,100);assert.deepEqual(feed.snapshot().blocks.map(b=>b.height),[100,99,98]);assert.equal(calls,4);
});
