import assert from 'node:assert/strict';import {test} from 'node:test';import {addressTransactionSlots} from '../src/address-transaction-slots.ts';
const row=n=>({hash:String(n),value:n});
test('automatic arrivals reuse positions while updating transaction identities',()=>{
 const previous=addressTransactionSlots([], [row(2),row(1)],false);const next=addressTransactionSlots(previous,[row(3),row(2),row(1)],false);
 assert.deepEqual(next.map(s=>s.key),[0,1,2]);assert.deepEqual(next.map(s=>s.hash),['3','2','1']);assert.equal(next[0].key,previous[0].key);assert.equal(previous[0].hash,'2');
});
test('reading never replaces a missing identity with the next transaction',()=>{
 const previous=addressTransactionSlots([],[row(3),row(2),row(1)],false);const next=addressTransactionSlots(previous,[row(2),row(1)],true);
 assert.equal(next[0].hash,'3');assert.equal(next[0].row,undefined);assert.equal(next[1].hash,'2');assert.equal(next[1].key,previous[1].key);assert.equal(next[2].hash,'1');
});
test('history append never fills an invalidated slot with an unrelated transaction',()=>{
 const previous=[{key:2,hash:'orphan'},{key:7,hash:'known',row:{hash:'known'}}];const next=addressTransactionSlots(previous,[{hash:'known',value:4},{hash:'older'}],true);
 assert.deepEqual(next.map(s=>s.key),[2,7,8]);assert.equal(next[0].row,undefined);assert.equal(next[1].row.value,4);assert.equal(next[2].hash,'older');
});
test('re-inclusion of the same transaction restores its held identity and acceptance removes gaps',()=>{
 const previous=[{key:0,hash:'1'},{key:1,hash:'2',row:row(2)}];const restored=addressTransactionSlots(previous,[row(2),{...row(1),block_number:5}],true);
 assert.equal(restored[0].row.block_number,5);assert.equal(restored[1].hash,'2');assert.deepEqual(addressTransactionSlots(restored,[row(2)],false),[{key:0,hash:'2',row:row(2)}]);
});
test('all invalidated rows keep unavailable positions until explicit acceptance',()=>{
 const previous=addressTransactionSlots([],[row(1),row(2)],false);const held=addressTransactionSlots(previous,[],true);assert.equal(held.length,2);assert(held.every(s=>!s.row));assert.deepEqual(addressTransactionSlots(held,[],false),[]);
});
