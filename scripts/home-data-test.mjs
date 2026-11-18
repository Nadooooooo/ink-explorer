import test from 'node:test';
import assert from 'node:assert/strict';
import {dailyTransactionChange} from '../src/home-data.ts';
const now=Date.parse('2026-10-17T14:00:00Z');
const history=Array.from({length:15},(_,i)=>({date:new Date(now-(14-i)*86400000).toISOString().slice(0,10),transactions_count:i<7?'100':i<14?'150':'1'}));
test('weekly change compares fourteen complete UTC days and excludes the current partial day',()=>{
 assert.equal(dailyTransactionChange(history,now),50);
 assert.equal(dailyTransactionChange(history.slice(0,14),now),50);
 assert.equal(dailyTransactionChange(history.slice(0,14).map(r=>({...r,transactions_count:100})),now),0);
});
test('unknown counts, missing days, stale ranges and zero baselines cannot become a fabricated percentage',()=>{
 for(const value of [null,undefined,'',NaN,Infinity,-1,'oops'])assert.equal(dailyTransactionChange(history.map((r,i)=>i===4?{...r,transactions_count:value}:r),now),null);
 assert.equal(dailyTransactionChange(history.slice(1),now),null);
 assert.equal(dailyTransactionChange(history.map((r,i)=>i===4?{...r,date:history[3].date}:r),now),null);
 assert.equal(dailyTransactionChange(history,now+86400000*2),null);
 assert.equal(dailyTransactionChange(history.map(r=>({...r,transactions_count:'0'})),now),null);
});
