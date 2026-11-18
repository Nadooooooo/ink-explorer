import {test} from 'node:test';
import assert from 'node:assert/strict';
import {currentRollingStatistics} from '../src/rolling-statistics.ts';
import {createRollingReader} from '../server/rolling-reader.mjs';
const hash=c=>'0x'+c.repeat(64),now=Date.parse('2026-10-23T08:00:00Z');
function fixture(){return {connected:true,sentAt:new Date(now).toISOString(),network:{online:true,synced:true,stale:false,chainId:57073,expectedChainId:57073,head:100000},block:{height:100000,hash:hash('a'),timestamp:new Date(now).toISOString()},blocks:[{height:100000,hash:hash('a'),timestamp:new Date(now).toISOString()}],rolling24h:{status:'ready',chainId:57073,source:'local-canonical-window',sampledAt:new Date(now).toISOString(),window:{from:new Date(now-86400000).toISOString(),to:new Date(now).toISOString(),seconds:86400,startExclusive:true,endInclusive:true,fromBlock:13601,toBlock:100000,toBlockHash:hash('a'),boundaryBlock:13600,boundaryHash:hash('b'),blocks:86400},transactions:400000,unknownFees:200000,missingReceipts:200000,feeWei:null}};}
test('only a complete, fresh window anchored to the correct canonical network is accepted',()=>{
 const f=fixture();assert.equal(currentRollingStatistics(f,57073).transactions,400000);assert.equal(currentRollingStatistics(f,57073).feeWei,null);
 f.rolling24h.transactions=0;f.rolling24h.unknownFees=0;f.rolling24h.missingReceipts=0;f.rolling24h.feeWei='0';assert.equal(currentRollingStatistics(f,57073).transactions,0);
 const s=fixture();s.network.chainId=s.network.expectedChainId=s.rolling24h.chainId=763373;assert.equal(currentRollingStatistics(s,763373).transactions,400000);assert.equal(currentRollingStatistics(s,57073),null);
});
test('stopped, stale, incomplete, forked or malformed windows never fall back to indexer counters',()=>{
 const mutate=[f=>f.connected=false,f=>f.network.online=false,f=>f.network.synced=false,f=>f.network.stale=true,f=>f.network.head++,f=>f.network.expectedChainId++,f=>f.rolling24h.status='unavailable',f=>f.rolling24h.chainId++,f=>f.rolling24h.source='indexer',f=>f.rolling24h.window.blocks--,f=>f.rolling24h.window.fromBlock--,f=>f.rolling24h.window.boundaryBlock--,f=>f.rolling24h.window.startExclusive=false,f=>f.rolling24h.window.toBlockHash=hash('c'),f=>f.blocks=[],f=>f.rolling24h.window.to=new Date(now-1000).toISOString(),f=>f.rolling24h.sampledAt=new Date(now-5001).toISOString(),f=>f.sentAt=new Date(now+5001).toISOString(),f=>f.rolling24h.sampledAt=new Date(now+1001).toISOString(),f=>f.rolling24h.transactions=-1,f=>f.rolling24h.transactions=1.5,f=>f.rolling24h.transactions=Number.MAX_SAFE_INTEGER+1,f=>f.rolling24h.missingReceipts=200001,f=>f.rolling24h.feeWei='10',f=>f.rolling24h.feeWei=undefined];
 for(const change of mutate){const f=fixture();change(f);assert.equal(currentRollingStatistics(f,57073),null,change.toString());}
});
test('reader masks stale cache, parse/read failures and shutdown, and resumes on valid data',async()=>{
 const f=fixture();let body=JSON.stringify(f.rolling24h),fail=false;
 const reader=createRollingReader({file:'/fixture',chainId:57073,interval:60000,read:async()=>{if(fail)throw new Error('offline');return body;}});
 try{
  await new Promise(r=>setImmediate(r));assert.equal(reader.current(f,now).transactions,400000);assert.equal(reader.current(f,now+5001),null);
  fail=true;await reader.refresh();assert.equal(reader.current(f,now),null);
  fail=false;body='invalid';await reader.refresh();assert.equal(reader.current(f,now),null);
  body='x'.repeat(16385);await reader.refresh();assert.equal(reader.current(f,now),null);
  body=JSON.stringify(f.rolling24h);await reader.refresh();assert.equal(reader.current(f,now).transactions,400000);
  reader.close();assert.equal(reader.current(f,now),null);
 }finally{reader.close();}
});
