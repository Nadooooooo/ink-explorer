import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSearchDestination, searchResultDestination, searchCursorQuery } from '../src/search.ts';
import { searchQuery } from '../server/search-query.mjs';

const hash='0x'+'a'.repeat(64), other='0x'+'b'.repeat(64), address='0x'+'1'.repeat(40);
test('search distinguishes exact block hashes from transactions and pending hashes',async()=>{
  assert.equal(await resolveSearchDestination(hash,async()=>({items:[{type:'block',block_hash:hash,block_number:0}]})),`/block/${hash}`);
  assert.equal(await resolveSearchDestination(hash,async()=>({items:[{type:'transaction',transaction_hash:hash}]})),`/tx/${hash}`);
  assert.equal(await resolveSearchDestination(hash,async()=>({items:[]})),`/tx/${hash}`);
  assert.equal(await resolveSearchDestination(hash,async()=>({items:[{type:'block',block_hash:other}]})),`/tx/${hash}`);
  assert.equal(await resolveSearchDestination(hash,async()=>({items:[{type:'block',block_hash:hash.toUpperCase().replace('0X','0x')}]})),`/block/${hash}`);
});
test('addresses, numeric blocks including genesis, and text avoid unnecessary index requests',async()=>{
  const fail=async()=>{assert.fail('Unexpected lookup');};
  assert.equal(await resolveSearchDestination(` ${address} `,fail),`/address/${address}`);
  assert.equal(await resolveSearchDestination('0',fail),'/block/0');
  assert.equal(await resolveSearchDestination('1234',fail),'/block/1234');
  assert.equal(await resolveSearchDestination('INK & WETH',fail),'/search?q=INK%20%26%20WETH');
  assert.equal(await resolveSearchDestination(' ',fail),undefined);
});
test('failed, invalid and bounded hash lookups retain an actionable search query',async()=>{
  for(const lookup of [async()=>{throw new Error('network unavailable');},async()=>null,async()=>({})])assert.equal(await resolveSearchDestination(hash,lookup),`/search?q=${hash}`);
  let lookupSignal;
  assert.equal(await resolveSearchDestination(hash,async(_query,signal)=>{lookupSignal=signal;return new Promise(()=>{});},undefined,15),`/search?q=${hash}`);
  assert.equal(lookupSignal.aborted,true);
});
test('obsolete hash searches abort without returning a later navigation',async()=>{
  const controller=new AbortController();
  const result=resolveSearchDestination(hash,async()=>new Promise(()=>{}),controller.signal);
  controller.abort(new DOMException('Navigation changed','AbortError'));
  await assert.rejects(result,{name:'AbortError'});
});
test('search result links handle genesis and accept only native entity identifiers',()=>{
  assert.equal(searchResultDestination({type:'block',block_number:0}),'/block/0');
  assert.equal(searchResultDestination({type:'block',block_number:0,block_hash:hash}),`/block/${hash}`);
  assert.equal(searchResultDestination({type:'transaction',transaction_hash:hash}),`/tx/${hash}`);
  assert.equal(searchResultDestination({type:'token',address_hash:address}),`/token/${address}`);
  assert.equal(searchResultDestination({type:'address',address_hash:address}),`/address/${address}`);
  for(const item of [{type:'block',block_number:'../admin'},{type:'token',address_hash:'https://example.com'},{type:'transaction',transaction_hash:'invalid'},{}])assert.equal(searchResultDestination(item),'');
});
test('search cursors preserve nulls, nested sort fields, and the original query',()=>{
  const cursor={q:'other',next_page_params_type:'search','token[circulating_market_cap]':null,'token[fiat_value]':null,'token[holder_count]':'0','token[name]':'A&B','token[inserted_at]':'2026-10-16T00:00:00Z','token[is_verified_via_admin_panel]':false};
  const params=new URLSearchParams(searchCursorQuery('INK',cursor));
  assert.equal(params.get('q'),'INK');assert.equal(params.get('token[circulating_market_cap]'),'null');assert.equal(params.get('token[holder_count]'),'0');assert.equal(params.get('token[name]'),'A&B');assert.equal(params.get('token[is_verified_via_admin_panel]'),'false');
  assert.deepEqual([...searchQuery(params)],[...params]);
  const nested=new URLSearchParams(searchCursorQuery('INK',{metadata_tag:{metadata_next_page_params:{page_token:'1,ink,tag',page_size:50},addresses_index:0}}));
  assert.equal(nested.get('metadata_tag[metadata_next_page_params][page_token]'),'1,ink,tag');
  assert.deepEqual([...searchQuery(nested)],[...nested]);
});
test('the search proxy rejects unrelated, duplicate and prototype-shaped parameters',()=>{
  for(const query of ['q=INK&url=https://example.com','q=INK&q=other','q=INK&token[__proto__]=x','q=INK&__proto__[a]=x'])assert.equal(searchQuery(new URLSearchParams(query)),null);
  assert.equal(searchQuery(new URLSearchParams('q=%20INK%20')).get('q'),'INK');
});
