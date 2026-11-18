import assert from 'node:assert/strict';
import {test} from 'node:test';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){try{return n(s,c)}catch(e){if(s.startsWith('./')&&c.parentURL?.includes('/src/')&&!/\.[a-z]+$/.test(s))return n(s+'.ts',c);throw e;}}});
const {emptyLedgerPage,readLedgerPage,updateLedgerPage}=await import('../src/ledger-page.ts');
const h=n=>'0x'+BigInt(n).toString(16).padStart(64,'0'),address='0x'+'a'.repeat(40);
const block=(n=1000,id=n)=>({height:n,hash:h(id),miner:{hash:address},transaction_hashes:[h(id)]});
const tx=(n=1000,id=n)=>({block_number:n,block_hash:h(n),hash:h(id),position:0,from:{hash:address},to:{hash:address},method:'0x12345678'});
for(const kind of ['blocks','transactions']){
 const make=kind==='blocks'?block:tx;
 const context=(extra={})=>({key:kind,kind,streaming:true,holding:false,live:{connected:true,network:{online:true,synced:true,stale:false},block:block(),blocks:[block()],transactions:[tx()]},...extra});
 test(`${kind}: stream renders before initial index response and survives its error`,()=>{
  let state=updateLedgerPage(emptyLedgerPage(kind),{type:'stream'},context());assert.equal(state.visible.items[0].hash,h(1000));assert.equal(state.visible.next_page_params,undefined);
  state=updateLedgerPage(state,{type:'error',error:'offline'},context());assert.equal(state.visible.items[0].hash,h(1000));assert.equal(state.error,'offline');
  state=updateLedgerPage(state,{type:'indexed',page:{items:[make(900)],next_page_params:{block_number:900}}},context());assert.equal(state.error,'');assert.deepEqual(state.visible.items.map(v=>v.hash),[h(1000),h(900)]);assert.equal(state.visible.next_page_params.block_number,900);
 });
 test(`${kind}: no invented rows from an unavailable or empty stream`,()=>{
  const ctx=context();ctx.live.connected=false;assert.equal(updateLedgerPage(emptyLedgerPage(kind),{type:'stream'},ctx).visible,undefined);
  ctx.live.connected=true;ctx.live.blocks=[];ctx.live.transactions=[];delete ctx.live.block;assert.equal(updateLedgerPage(emptyLedgerPage(kind),{type:'stream'},ctx).visible,undefined);
  const state=updateLedgerPage(emptyLedgerPage(kind),{type:'indexed',page:{items:[]}},ctx);assert.deepEqual(state.visible.items,[]);
 });
 test(`${kind}: held rows preserve identity, order and cursor while metadata arrives`,()=>{
  let state=updateLedgerPage(emptyLedgerPage(kind),{type:'stream'},context());const row={...make(1000),...(kind==='blocks'?{miner:{hash:address,name:'Named beneficiary'}}:{to:{hash:address,name:'Named contract'}})};
  state=updateLedgerPage(state,{type:'indexed',page:{items:[row,make(900)],next_page_params:{block_number:900}}},context({holding:true}));
  assert.deepEqual(state.visible.items.map(v=>v.hash),[h(1000)]);assert.equal(state.visible.next_page_params,undefined);assert.equal(state.candidate.items.length,2);assert.equal((kind==='blocks'?state.visible.items[0].miner:state.visible.items[0].to).name,kind==='blocks'?'Named beneficiary':'Named contract');
  state=updateLedgerPage(state,{type:'accept'},context({holding:true}));assert.equal(state.visible.items.length,2);assert.equal(state.visible.next_page_params.block_number,900);assert.equal(state.candidate,undefined);
 });
 test(`${kind}: full indexed page retains its tail and the real cursor`,()=>{
  const items=Array.from({length:50},(_,i)=>make(900-i));const page={items,next_page_params:{block_number:851,index:7}};
  const state=updateLedgerPage(emptyLedgerPage(kind),{type:'indexed',page},context());assert.equal(state.visible.items.length,51);assert.deepEqual(state.visible.next_page_params,page.next_page_params);assert(items.every(item=>state.visible.items.some(row=>row.hash===item.hash)));
 });
 test(`${kind}: historical and filtered scopes do not receive live rows`,()=>{
  const ctx=context({streaming:false});let state=updateLedgerPage(emptyLedgerPage(kind),{type:'stream'},ctx);assert.equal(state.visible,undefined);
  state=updateLedgerPage(state,{type:'indexed',page:{items:[make(800)]}},ctx);state=updateLedgerPage(state,{type:'stream'},ctx);assert.deepEqual(state.visible.items.map(v=>v.hash),[h(800)]);
  state=updateLedgerPage(state,{type:'start'},context({key:'other-page',streaming:false}));assert.equal(state.visible,undefined);
 });
 test(`${kind}: same-height replacement is offered while the reader is holding rows`,()=>{
  let state=updateLedgerPage(emptyLedgerPage(kind),{type:'stream'},context());const ctx=context({holding:true});ctx.live.blocks=[block(1000,2000)];ctx.live.block=ctx.live.blocks[0];ctx.live.transactions=[{...tx(1000,2000),block_hash:h(2000)}];
  state=updateLedgerPage(state,{type:'stream'},ctx);assert.equal(state.visible.items[0].hash,h(1000));assert.equal(state.candidate.items[0].hash,h(2000));state=updateLedgerPage(state,{type:'accept'},ctx);assert.equal(state.visible.items[0].hash,h(2000));
 });
}
test('transaction window is sorted before its size is bounded',()=>{
 const transactions=Array.from({length:80},(_,position)=>({...tx(1000,position+1),position}));const b={...block(1000),transaction_hashes:transactions.map(t=>t.hash)};
 const context={key:'txs',kind:'transactions',streaming:true,holding:false,live:{connected:true,network:{online:true,synced:true},block:b,blocks:[b],transactions}};
 const state=updateLedgerPage(emptyLedgerPage('txs'),{type:'stream'},context);assert.equal(state.visible.items.length,50);assert.equal(state.visible.items[0].position,79);assert.equal(state.visible.items.at(-1).position,30);
});
test('invalid directory data cannot supply a pagination cursor',()=>{
 for(const value of [null,{}, {items:null},{items:[null]},{items:[],next_page_params:[]},{items:[],next_page_params:{bad:{nested:1}}}])assert.throws(()=>readLedgerPage(value));
 assert.deepEqual(readLedgerPage({items:[],next_page_params:null}),{items:[],next_page_params:null});
});
