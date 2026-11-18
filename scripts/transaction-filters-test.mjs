import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){try{return next(specifier,context)}catch(error){if(specifier.startsWith('.')&&!/\.[a-z]+$/.test(specifier))return next(specifier+'.ts',context);throw error;}}});
const {normalizeTransactionFilters,readTransactionFilters,transactionFilterCount}=await import('../src/transaction-filters.ts');
const {queryTransactions}=await import('../server/transaction-query.mjs');
test('opening a legacy empty-filter URL still means the normal transaction stream',()=>{
 assert.equal(transactionFilterCount(readTransactionFilters('?activity=filtered&lang=fr')),0);
 assert.equal(transactionFilterCount(readTransactionFilters('?activity=filtered&address_relation=or')),0);
 assert.equal(transactionFilterCount(readTransactionFilters('?status=failed')),1);
});
test('a relation needs both addresses and does not inflate the applied-criteria count',()=>{
 const value={from_address_hashes_to_include:' a ',to_address_hashes_to_include:'b',address_relation:'or'};
 const result=normalizeTransactionFilters(value,' success ');
 assert.deepEqual(result,{filters:{from_address_hashes_to_include:'a',to_address_hashes_to_include:'b',address_relation:'or'},status:'success'});
 assert.equal(transactionFilterCount(result),3);assert.equal(value.from_address_hashes_to_include,' a ');
 assert.deepEqual(normalizeTransactionFilters({...result.filters,to_address_hashes_to_include:undefined}),{filters:{from_address_hashes_to_include:'a'},status:''});
});
test('unsupported values remain reviewable rather than silently broadening the query',()=>{
 const state=readTransactionFilters('?methods=not-a-selector&status=unknown&amount_from=1&lang=fr');
 assert.deepEqual(state,{filters:{methods:'not-a-selector',amount_from:'1'},status:'unknown'});
 assert.equal(transactionFilterCount(state),3);
});
test('failed token-event queries stop without scanning source pages, while invalid cursors still fail',async()=>{
 let reads=0;const get=async()=>{reads++;throw Error('An impossible event filter must not fetch parents')};
 for(const type of ['ERC-20','ERC-721','ERC-1155']){
  const page=await queryTransactions(new URLSearchParams({transaction_types:type,status:'failed'}),{get});
  assert.deepEqual(page,{items:[],next_page_params:null});
 }
 assert.equal(reads,0);
 await assert.rejects(queryTransactions(new URLSearchParams({transaction_types:'ERC-20',status:'failed',cursor:'invalid*'}),{get}),/Invalid cursor/);
 assert.equal(reads,0);
});
