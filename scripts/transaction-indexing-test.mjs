import test from 'node:test';
import assert from 'node:assert/strict';
import {loadIndexedTransaction,recognizeTransactionIndexing,TRANSACTION_INDEXING_DEADLINE} from '../src/transaction-indexing.ts';
const hash='0x'+'a'.repeat(64),blockHash='0x'+'b'.repeat(64);
const pending={code:'TRANSACTION_INDEXING',chainId:57073,transaction:{hash,blockHash,blockNumber:'123'},retryAfterMs:1000};
const options=extra=>({id:hash,chainId:57073,signal:new AbortController().signal,onIndexing(){},...extra});
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
test('only exact transaction, chain, delay and canonical identity validate',()=>{
 assert.equal(recognizeTransactionIndexing(pending,hash,57073),true);
 for(const value of [null,{},[],{...pending,chainId:763373},{...pending,retryAfterMs:0},{...pending,transaction:{...pending.transaction,hash:blockHash}},{...pending,transaction:{...pending.transaction,blockHash:'0xabc'}}])assert.ok(!recognizeTransactionIndexing(value,hash,57073));
});
test('pending to indexed preserves actual result and retries after one second',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date'],now:1000});let calls=0,notices=0;
 const ready={hash,status:'error',fee:{value:'123'}};
 const result=loadIndexedTransaction(options({onIndexing(){notices++;},request:async()=>++calls===1?{status:202,value:pending}:{status:200,value:ready}}));
 await flush();assert.equal(notices,1);t.mock.timers.tick(1000);await flush();assert.deepEqual(await result,ready);assert.equal(calls,2);
});
test('malformed success or pending responses never become transaction details',async()=>{
 for(const response of [{status:200,value:pending},{status:202,value:{}},{status:201,value:{hash}},{status:200,value:{hash:blockHash}}])await assert.rejects(loadIndexedTransaction(options({request:async()=>response})),/invalidApiResponse/);
});
test('navigation cancels retry and deadline stops automatic requests',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date'],now:1000});let calls=0;
 const request=async()=>{calls++;return{status:202,value:pending};};const controller=new AbortController();
 const canceled=loadIndexedTransaction(options({signal:controller.signal,request}));const rejected=assert.rejects(canceled,/Abort/);
 await flush();controller.abort();await rejected;t.mock.timers.tick(1000);assert.equal(calls,1);
 const expired=loadIndexedTransaction(options({request}));const timeout=assert.rejects(expired,/transactionIndexingExpired/);
 await flush();t.mock.timers.tick(TRANSACTION_INDEXING_DEADLINE);await timeout;assert.equal(calls,2);
});
