import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){try{return next(specifier,context)}catch(error){if(specifier.startsWith('.')&&context.parentURL?.includes('/src/')&&!/\.[a-z]+$/.test(specifier))return next(specifier+'.ts',context);throw error;}}});
const {statisticNumber,normalizeCounters,normalizeGasOracle,snapshotExpiry,STATISTICS_MAX_AGE}=await import('../src/statistics-data.ts');
const counter={id:'totalTxns',title:'Total txns',description:'All transactions',value:'9007199254740993'};
test('Counters preserve raw precision and distinguish zero from unavailable values',()=>{
 assert.equal(normalizeCounters({counters:[counter]}).counters[0].value,counter.value);
 assert.equal(normalizeCounters({counters:[{...counter,value:'1.5'}]}).counters[0].value,null);
 assert.equal(normalizeCounters({counters:[{...counter,value:'1.5',units:'ETH'}]}).counters[0].value,'1.5');
 for(const value of [0,'0','12','0.00000001','1e-18'])assert.notEqual(statisticNumber(value),null);
 for(const value of [null,undefined,'',' ','-1',-1,Infinity,NaN,true,false,{},[],['2'],'0x20','12abc','1e-4000']){
  assert.equal(statisticNumber(value),null);assert.equal(normalizeCounters({counters:[{...counter,value}]}).counters[0].value,null);
 }
});
test('Fee counter labels are concise without modifying IDs, descriptions, or exact values',()=>{
 const source={counters:[
  {id:'txnsFee24h',title:'Transactions fees (24h)',description:'Sum of ETH spent on gas fees within the last 24 hours',units:'ETH',value:'0.000000000000000001'},
  {id:'averageTxnFee24h',title:'Avg. transaction fee (24h)',description:'Average amount of ETH spent on gas fees per transaction within the last 24 hours',units:'ETH',value:'0.000000000000000001'},
  counter,
 ]};
 const result=normalizeCounters(source);
 assert.deepEqual(result.counters.map(row=>row.title),['Transaction fees · 24h','Avg. tx fee · 24h','Total txns']);
 assert.deepEqual(result.counters.map(row=>row.value),['0.000000000000000001','0.000000000000000001',counter.value]);
 assert.equal(source.counters[0].title,'Transactions fees (24h)');
});
test('Malformed, empty and duplicate counter collections cannot replace a valid snapshot',()=>{
 for(const value of [null,[],{}, {counters:null},{counters:{}},{counters:[]},{counters:[null]},{counters:[counter,counter]},{counters:[{...counter,title:7}]}])assert.throws(()=>normalizeCounters(value),/invalidApiResponse/);
});
test('Oracle prices keep wei precision and reject misleading coercions or fallback values',()=>{
 const source={gas_price_updated_at:'2026-10-18T00:00:00Z',gas_prices:{slow:{wei:'1',time:0},average:{wei:'',price:50,time:-1},fast:{price:0,time:null}}};
 assert.deepEqual(normalizeGasOracle(source).estimates,{slow:{gwei:1e-9,seconds:0},average:{gwei:null,seconds:null},fast:{gwei:0,seconds:null}});
 assert.equal(normalizeGasOracle({...source,gas_prices:{slow:{wei:'1.5',price:10}}}).estimates.slow.gwei,null);
 for(const value of [null,{}, {...source,gas_prices:null},{...source,gas_price_updated_at:'yesterday'}])assert.throws(()=>normalizeGasOracle(value),/invalidApiResponse/);
});
test('Only dated fresh responses may supply current values, including the oracle observation date',()=>{
 const now=Date.parse('2026-10-18T00:00:00Z');
 const headers=new Headers({'x-ink-data-status':'fresh','x-ink-data-fetched-at':new Date(now-15000).toISOString(),date:new Date(now).toUTCString()});
 assert.equal(snapshotExpiry(headers,now),now+STATISTICS_MAX_AGE-15000);
 assert.equal(snapshotExpiry(headers,now,new Date(now-60000).toISOString()),now+30000);
 // A browser with a wrong wall clock still uses server-relative response age.
 assert.equal(snapshotExpiry(headers,now+3600000),now+3600000+75000);
 for(const status of ['stale','unknown','']){const h=new Headers(headers);h.set('x-ink-data-status',status);assert.throws(()=>snapshotExpiry(h,now),/Data source unavailable/);}
 for(const stamp of ['invalid',new Date(now-90000).toISOString(),new Date(now+6000).toISOString()]){
  const h=new Headers(headers);h.set('x-ink-data-fetched-at',stamp);assert.throws(()=>snapshotExpiry(h,now),/Data source unavailable/);
  assert.throws(()=>snapshotExpiry(headers,now,stamp),/Data source unavailable/);
 }
});
