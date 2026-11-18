import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveIdentities} from '../server/live-identities.mjs';
const address=n=>'0x'+n.toString(16).padStart(40,'0');
const snapshot=(count=4)=>({block:{height:100},transactions:Array.from({length:count},(_,i)=>({hash:'tx'+i,to:{hash:address(i+1)}}))});
test('idle feed preserves local transactions and cached names without upstream reads',async()=>{
 let reads=0;const service=createLiveIdentities({enabled:()=>false,get:async()=>{reads++;},onChange:()=>{}});
 service.seed([{to:{hash:address(1),name:'Known contract',is_contract:true,is_verified:true}}]);
 const result=service.apply(snapshot());assert.equal(reads,0);assert.equal(result.block.height,100);assert.equal(result.transactions.length,4);assert.equal(result.transactions[0].to.name,'Known contract');assert.equal(result.transactions[0].to.is_verified,true);service.close();
});
test('demand starts bounded lookups; leaving clears queued work and can resume later',async()=>{
 let enabled=false,changes=0;const reads=[],waiting=[];
 const service=createLiveIdentities({enabled:()=>enabled,get:hash=>{reads.push(hash);return new Promise(resolve=>waiting.push(()=>resolve({hash,name:'Resolved '+hash,is_contract:true})));},onChange:()=>changes++});
 service.apply(snapshot());assert.equal(reads.length,0);enabled=true;service.apply(snapshot());assert.equal(reads.length,2);
 enabled=false;service.apply(snapshot());for(const resolve of waiting.splice(0))resolve();await new Promise(r=>setImmediate(r));assert.equal(changes,2);assert.equal(reads.length,2);
 const inactive=service.apply(snapshot());assert(inactive.transactions[0].to.name.startsWith('Resolved'));assert.equal(reads.length,2);
 enabled=true;service.apply(snapshot());assert.deepEqual(reads,[1,2,3,4].map(address));for(const resolve of waiting.splice(0))resolve();await new Promise(r=>setImmediate(r));service.close();
});
test('failed enrichment remains optional and does not fabricate contract metadata',async()=>{
 const service=createLiveIdentities({get:async()=>{throw new Error('Indexer unavailable');},onChange:()=>assert.fail('Failure must not announce a successful identity')});
 const initial=service.apply(snapshot(1));assert.equal(initial.transactions[0].to.is_contract,undefined);await new Promise(r=>setImmediate(r));assert.equal(service.apply(snapshot(1)).transactions[0].to.name,undefined);service.close();
});
