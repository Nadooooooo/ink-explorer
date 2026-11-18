import {test} from "node:test";
import assert from "node:assert/strict";
import {parentMatches,queryTransactions,decodeTransactionCursor,normalizeParent,eventCursorAfter} from "../server/transaction-query.mjs";
const sender="0x"+"1".repeat(40),recipient="0x"+"2".repeat(40),other="0x"+"3".repeat(40),hash="0x"+"a".repeat(64);
const row={hash,from:{hash:sender},to:{hash:recipient},method:"0x12345678",raw_input:"0x1234567800",timestamp:"2026-10-17T00:00:00Z",block_number:1,status:"success",fee:"123",internal_transaction_index:null,token_transfer_index:null};
test("from/to filters match the parent and support AND/OR",()=>{
  assert.equal(parentMatches(row,{from_address_hashes_to_include:sender,to_address_hashes_to_include:other}),false);
  assert.equal(parentMatches(row,{from_address_hashes_to_include:sender,to_address_hashes_to_include:other,address_relation:"or"}),true);
  assert.equal(parentMatches(row,{methods:"0xffffffff"}),false);
  assert.equal(parentMatches(row,{},"failed"),false);
});
test("internal calls are excluded, parent events are deduplicated",async()=>{
  const result=await queryTransactions(new URLSearchParams(),{get:async()=>({items:[{...row,hash:"0x"+"b".repeat(64),internal_transaction_index:1},row,row],next_page_params:null})});
  assert.equal(result.items.length,1);assert.equal(result.items[0].status,"ok");assert.equal(result.items[0].fee.value,"123");
});
test("ERC transfers are resolved to their parent before address and method filtering",async()=>{
  let query;
  const result=await queryTransactions(new URLSearchParams({transaction_types:"ERC-20",from_address_hashes_to_include:sender,methods:"0x12345678"}),{get:async path=>{if(path.startsWith("/transactions/"))return row;query=path;return {items:[{...row,from:{hash:other},token_transfer_index:1}, {...row,token_transfer_index:2}],next_page_params:null};}});
  assert.equal(result.items.length,1);assert.equal(result.items[0].from.hash,sender);assert.ok(!query.includes("from_address"));assert.ok(!query.includes("methods"));
});
test("a cursor rejects arbitrary source parameters and suppresses a continued parent",async()=>{
  const bad=Buffer.from(JSON.stringify({next:{url:"http://evil"}})).toString("base64url");assert.throws(()=>decodeTransactionCursor(bad));
  const cursor=Buffer.from(JSON.stringify({next:{block_number:1},last:hash})).toString("base64url");
  const result=await queryTransactions(new URLSearchParams({cursor}),{get:async()=>({items:[row],next_page_params:null})});assert.equal(result.items.length,0);
});
test("decoded root method names retain the exact upstream selector constraint",async()=>{
  const result=await queryTransactions(new URLSearchParams({methods:"0x095EA7B3"}),{get:async path=>{
    assert.equal(new URL(path,'https://example.test').searchParams.get('methods'),'0x095ea7b3');
    return {items:[{...row,raw_input:undefined,method:'approve'}],next_page_params:null};
  }});
  assert.equal(result.items.length,1);assert.equal(result.items[0].method,'approve');
  assert.equal(parentMatches({...row,raw_input:'0x095ea7b3abcd'},{methods:'0x095EA7B3'}),true);
  assert.equal(parentMatches({...row,raw_input:'0x',method:'approve'},{methods:'0x095ea7b3'},'',{methodFiltered:true}),false);
  assert.equal(parentMatches(row,{methods:'0xffffffff'},'',{methodFiltered:true}),false);
});
test("a decoded token-event method cannot stand in for the parent calldata selector",async()=>{
  const result=await queryTransactions(new URLSearchParams({transaction_types:'ERC-20',methods:'0x095ea7b3'}),{get:async path=>path.startsWith('/transactions/')?{...row,raw_input:undefined,method:'approve'}:{items:[{...row,token_transfer_index:1}],next_page_params:null}});
  assert.equal(result.items.length,0);
});
test("advanced-filter revert reasons remain failed parent transactions",async()=>{
  for(const status of ['execution reverted','out of gas','invalid opcode','custom contract error', 'error', 'failed']) {
    const source={...row,status};
    assert.equal(parentMatches(source,{},'failed'),true,status);
    assert.equal(parentMatches(source,{},'success'),false,status);
    assert.equal(normalizeParent(source).status,'error',status);
    const get=async()=>({items:[source],next_page_params:null});
    const result=await queryTransactions(new URLSearchParams({status:'failed'}),{get});
    assert.deepEqual(result.items.map(tx=>[tx.hash,tx.status]),[[hash,'error']],status);
    assert.equal((await queryTransactions(new URLSearchParams({status:'success'}),{get})).items.length,0,status);
  }
});
test("pending, unindexed and missing statuses are never promoted to success or failure",async()=>{
  for(const status of ['pending','awaiting_internal_transactions',null,undefined,'',42,{}]) {
    const source={...row,status};
    assert.equal(parentMatches(source,{},'failed'),false,String(status));
    assert.equal(parentMatches(source,{},'success'),false,String(status));
    assert.equal(normalizeParent(source).status,status==='pending'?'pending':null);
  }
});
test('token parents load with bounded concurrency while preserving source order and deduplication',async()=>{
 const events=Array.from({length:8},(_,i)=>({...row,hash:'0x'+String(i+1).padStart(64,'0'),token_transfer_index:i}));
 let active=0,peak=0;const fetched=[];
 const result=await queryTransactions(new URLSearchParams({transaction_types:'ERC-721'}),{get:async path=>{
  if(path.startsWith('/advanced-filters'))return {items:[events[0],...events,events[4]],next_page_params:null};
  const wanted=path.split('/').at(-1),i=events.findIndex(x=>x.hash===wanted);fetched.push(wanted);active++;peak=Math.max(peak,active);
  await new Promise(r=>setTimeout(r,i%3===0?20:2));active--;return {...row,hash:wanted};
 }});
 assert(peak>1,'Independent parent reads must overlap');assert(peak<=2,'At most two reads per query');
 assert.deepEqual(result.items.map(x=>x.hash),events.map(x=>x.hash));assert.equal(fetched.length,events.length);
});
test('token pagination suppresses split parent events and keeps sparse pages resumable',async()=>{
 const a={...row,token_transfer_index:1},b={...a,hash:'0x'+'b'.repeat(64)},c={...a,hash:'0x'+'c'.repeat(64)};
 const pages=[{items:[a,a],next_page_params:{block_number:3}},{items:[a,b,b],next_page_params:{block_number:2}},{items:[b,b],next_page_params:{block_number:1}},{items:[b,c],next_page_params:null}];
 const get=async path=>path.startsWith('/transactions/')?{...row,hash:path.split('/').at(-1)}:pages[new URL(path,'https://example.test').searchParams.has('block_number')?4-Number(new URL(path,'https://example.test').searchParams.get('block_number')):0];
 const first=await queryTransactions(new URLSearchParams({transaction_types:'ERC-1155'}),{get});assert.deepEqual(first.items.map(x=>x.hash),[a.hash,b.hash]);assert(first.next_page_params);
 const second=await queryTransactions(new URLSearchParams({transaction_types:'ERC-1155',...first.next_page_params}),{get});assert.deepEqual(second.items.map(x=>x.hash),[c.hash]);assert.equal(second.next_page_params,null);
 const empty=await queryTransactions(new URLSearchParams({transaction_types:'ERC-1155',status:'failed'}),{get});assert.deepEqual(empty.items,[]);assert(empty.next_page_params);
});
test('failed parent reads reject the whole page and stop scheduling further batches',async()=>{
 let reads=0;
 const events=Array.from({length:8},(_,i)=>({...row,hash:'0x'+String(i+1).padStart(64,'0'),token_transfer_index:i}));
 await assert.rejects(queryTransactions(new URLSearchParams({transaction_types:'ERC-20'}),{get:async path=>{
  if(path.startsWith('/advanced-filters'))return {items:events,next_page_params:null};
  reads++;if(reads===2)throw new Error('Parent source unavailable');await new Promise(r=>setTimeout(r,10));return {...row,hash:path.split('/').at(-1)};
 }}),/Parent source unavailable/);
 assert(reads<=2);
});
test('a token event must resolve to its own valid parent transaction',async()=>{
 for(const parent of [null,[],{}, {...row,hash:'0x'+'b'.repeat(64)}]){
  await assert.rejects(queryTransactions(new URLSearchParams({transaction_types:'ERC-20'}),{get:async path=>path.startsWith('/transactions/')?parent:{items:[{...row,token_transfer_index:0}],next_page_params:null}}),/Invalid transaction source response/);
 }
});
test('a token page resolves at most 25 parents and resumes at the exact source event',async()=>{
 const events=Array.from({length:61},(_,i)=>({...row,hash:'0x'+String(i>25?i:i===25?25:i+1).padStart(64,'0'),block_number:1000,transaction_index:i>25?i-1:i===25?24:i,internal_transaction_index:null,token_transfer_batch_index:1,token_transfer_index:i}));
 const expected=[...new Set(events.map(x=>x.hash))];assert.equal(expected.length,60);
 let reads=0;const get=async path=>{
  if(path.startsWith('/transactions/')){reads++;return {...row,hash:path.split('/').at(-1)};}
  const params=new URL(path,'https://example.test').searchParams,start=params.has('token_transfer_index')?Number(params.get('token_transfer_index'))+1:0;
  const items=events.slice(start,start+50);
  return {items,next_page_params:start+50<events.length?eventCursorAfter(items.at(-1)):null};
 };
 const found=[];let cursor;
 for(let page=0;page<3;page++){
  const before=reads,params=new URLSearchParams({transaction_types:'ERC-1155',...(cursor||{})});
  const result=await queryTransactions(params,{get});
  assert(reads-before<=25,`page ${page+1} read ${reads-before} parents`);
  found.push(...result.items.map(x=>x.hash));cursor=result.next_page_params;
  if(page<2){assert(cursor);const decoded=decodeTransactionCursor(cursor.cursor);assert.equal(decoded.next.token_transfer_index,page===0?24:50);}
  else assert.equal(cursor,null);
 }
 assert.deepEqual(found,expected);
 assert.equal(new Set(found).size,found.length);
});
test('an event without a safe source cursor keeps the remaining results on the page',async()=>{
 const events=Array.from({length:30},(_,i)=>({...row,hash:'0x'+String(i+1).padStart(64,'0'),block_number:1000,transaction_index:i,token_transfer_index:null}));
 assert.equal(eventCursorAfter(events[0]),null);
 let reads=0;const result=await queryTransactions(new URLSearchParams({transaction_types:'ERC-20'}),{get:async path=>{
  if(path.startsWith('/transactions/')){reads++;return {...row,hash:path.split('/').at(-1)};}
  return {items:events,next_page_params:null};
 }});
 assert.equal(reads,events.length);assert.equal(result.items.length,events.length);assert.equal(result.next_page_params,null);
});
test('sparse parent filters remain ordered and resumable after the 25-read limit',async()=>{
 const events=Array.from({length:60},(_,i)=>({...row,hash:'0x'+String(i+1).padStart(64,'0'),block_number:1000,transaction_index:i,token_transfer_batch_index:1,token_transfer_index:i}));
 const expected=events.filter((_,i)=>i%3===0).map(x=>x.hash);
 let cursor,reads=0;const found=[];
 const get=async path=>{
  if(path.startsWith('/transactions/')){reads++;const hash=path.split('/').at(-1),i=events.findIndex(x=>x.hash===hash);return {...row,hash,from:{hash:i%3===0?sender:other}};}
  const p=new URL(path,'https://example.test').searchParams,start=p.has('token_transfer_index')?Number(p.get('token_transfer_index'))+1:0,items=events.slice(start,start+50);
  assert.equal(p.has('from_address_hashes_to_include'),false,'event source must not filter parent addresses');
  return {items,next_page_params:start+50<events.length?eventCursorAfter(items.at(-1)):null};
 };
 for(let page=0;page<3;page++){
  const before=reads,result=await queryTransactions(new URLSearchParams({transaction_types:'ERC-721',from_address_hashes_to_include:sender,...(cursor||{})}),{get});
  assert(reads-before<=25);found.push(...result.items.map(x=>x.hash));cursor=result.next_page_params;
  if(page<2)assert(cursor);else assert.equal(cursor,null);
 }
 assert.deepEqual(found,expected);assert.equal(reads,events.length);
});
