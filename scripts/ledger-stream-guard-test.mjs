import assert from 'node:assert/strict';
import {test} from 'node:test';
import {registerHooks} from 'node:module';

registerHooks({resolve(specifier,context,next){try{return next(specifier,context);}catch(error){if(specifier.startsWith('./')&&context.parentURL?.includes('/src/')&&!/\.[a-z]+$/.test(specifier))return next(specifier+'.ts',context);throw error;}}});
const {applyLiveFrame,isCurrentNetwork}=await import('../src/live-ledger.ts');
const {emptyLedgerPage,updateLedgerPage}=await import('../src/ledger-page.ts');
const hash=value=>'0x'+BigInt(value).toString(16).padStart(64,'0'),address='0x'+'a'.repeat(40);
const row=height=>({height,hash:hash(height),miner:address,timestamp:'2026-11-17T00:00:00Z',gas_limit:'1000000',gas_used:'1000',size:1234,
  transactions_count:100,transaction_hashes:Array.from({length:100},(_,position)=>hash(BigInt(height)*100000n+BigInt(position))),_live:true});
const network=(head=1000)=>({chainId:57073,expectedChainId:57073,head,online:true,synced:true,stale:false,sampledAt:'2026-11-17T00:00:00Z',safeBlock:head-2,finalizedBlock:head-4});
const initialLive=()=>({connected:true,sequence:1,network:network(),block:row(1000),blocks:Array.from({length:30},(_,i)=>row(1000-i)),transactions:[]});
const context=live=>({key:'blocks:true:/explorer/blocks',kind:'blocks',streaming:true,holding:false,live});
const indexed=()=>({items:Array.from({length:50},(_,i)=>({...row(988-i),miner:{hash:address,name:'Indexed vault',is_contract:true},_live:false})),next_page_params:{block_number:939,index:7}});
function freeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);for(const child of Object.values(value))freeze(child);}return value;}
function seed(ctx=context(initialLive()),page=indexed()){
  const state=updateLedgerPage(emptyLedgerPage(ctx.key),{type:'indexed',page},ctx);
  return {ctx,page,state:updateLedgerPage(state,{type:'stream'},ctx)};
}
const stream=(state,ctx)=>updateLedgerPage(state,{type:'stream'},ctx);
const heights=state=>state.visible.items.map(item=>item.height);
function preservesIndex(state,page){assert.deepEqual(state.visible.next_page_params,page.next_page_params);for(const item of page.items)assert(state.visible.items.some(current=>current.hash===item.hash),'indexed tail is retained');}

test('controlled25-frame fixture keeps data/cursor and avoids18 unchanged Blocks updates',()=>{
  // Controlled payloads follow an observed count/head pattern, not a replay of
  // original transactions, reset bits, readiness or beneficiary metadata.
  const frames=[
    ['welcome',30,50,0],['network',0,0,0],['block',1,13,1],['network',0,13,1],['network',0,0,1],
    ['network',0,0,1],['network',0,1,1],['block',1,10,2],['network',0,10,2],['network',0,0,2],
    ['network',0,0,2],['network',0,0,2],['network',0,0,2],['block',1,11,3],['network',0,11,3],
    ['network',0,0,3],['block',1,10,4],['network',0,10,4],['network',0,0,4],['block',1,10,5],
    ['network',0,10,5],['network',0,1,5],['block',1,11,6],['network',0,11,6],['network',0,0,6],
  ];
  let live={connected:false,blocks:[],transactions:[],network:network()},ctx=context(live);
  const page=freeze(indexed());let state=updateLedgerPage(emptyLedgerPage(ctx.key),{type:'indexed',page},ctx),skipped=0,empty=0;
  for(const [i,[type,blockCount,transactionCount,offset]] of frames.entries()){
    const head=1000+offset,frame=freeze({type,delta:true,reset:i===0,sequence:i+1,network:network(head),block:row(head),window:{fromBlock:head-29,toBlock:head},
      blocks:Array.from({length:blockCount},(_,index)=>row(head-index)),transactions:Array.from({length:transactionCount},(_,position)=>({hash:hash(BigInt(head)*100000n+BigInt(position)),block_number:head,block_hash:hash(head),position,status:'ok'}))});
    live={connected:true,sequence:frame.sequence,sentAt:`fixture:${i}`,...applyLiveFrame(live,frame),network:frame.network,block:frame.block};ctx=context(live);
    const previous=state;state=stream(state,ctx);const unchanged=state===previous;
    assert.equal(unchanged,i>0&&blockCount===0,'only unchanged block inputs keep page identity');if(unchanged)skipped++;if(!blockCount&&!transactionCount)empty++;
    const expected=[...new Set([...page.items.map(item=>item.height),...live.blocks.map(item=>item.height)])].sort((a,b)=>b-a);
    assert.deepEqual(heights(state),expected);assert.equal(state.visible.items[0].hash,hash(head));preservesIndex(state,page);
    assert.equal(state.visible.items[0].miner.name,'Indexed vault');assert.equal(state.error,'');
  }
  assert.equal(frames.length,25);assert.equal(skipped,18);assert.equal(empty,10);
});

test('new array with the same ordered immutable rows keeps page identity',()=>{
  const {state,ctx}=seed();assert.equal(stream(state,{...ctx,live:{...ctx.live,blocks:[...ctx.live.blocks]}}),state);
});
test('sequence and observation timestamps continue in live while Blocks page stays unchanged',()=>{
  const {state,ctx}=seed(),live={...ctx.live,sequence:99,sentAt:'later',network:{...ctx.live.network,sampledAt:'later'}};
  assert.equal(stream(state,{...ctx,live}),state);assert.equal(live.sequence,99);assert.equal(live.network.sampledAt,'later');
});
test('finality-only updates do not rebuild the Blocks page or freeze live metadata',()=>{
  const {state,ctx}=seed(),live={...ctx.live,network:{...ctx.live.network,safeBlock:999,finalizedBlock:998}};
  assert.equal(stream(state,{...ctx,live}),state);assert.equal(live.network.finalizedBlock,998);
});
test('transaction-only receipts do not rebuild the Blocks page',()=>{
  const {state,ctx}=seed();assert.equal(stream(state,{...ctx,live:{...ctx.live,transactions:[{hash:hash(123),status:'error'}]}}),state);
});
test('holding keeps identities/cursor until a new head is explicitly accepted',()=>{
  const {state,ctx,page}=seed(),next=row(1001),holding={...ctx,holding:true,live:{...ctx.live,block:next,blocks:[next,...ctx.live.blocks]}};
  const held=stream(state,holding);assert.notEqual(held,state);assert.equal(held.visible.items[0].height,1000);assert.equal(held.candidate.items[0].height,1001);preservesIndex(held,page);
  const accepted=updateLedgerPage(held,{type:'accept'},holding);assert.equal(accepted.visible.items[0].height,1001);assert.equal(accepted.candidate,undefined);preservesIndex(accepted,page);
});
test('another route cannot reuse the prior page or its stream identity',()=>{
  const {state,ctx}=seed(),next={...ctx,key:'blocks:true:/explorer/blocks?cursor=other',streaming:false};
  const scoped=stream(state,next);assert.equal(scoped.visible,undefined);assert.equal(scoped.key,next.key);
});
test('historical and forked scopes render only their indexed page',()=>{
  const {state,ctx}=seed(),history={...ctx,key:'blocks:false:/explorer/blocks?type=reorg',streaming:false},page={items:[{...row(800),type:'reorg'}],next_page_params:{cursor:'fork'}};
  const current=updateLedgerPage(state,{type:'indexed',page},history),next=stream(current,history);
  assert.deepEqual(heights(next),[800]);assert.deepEqual(next.visible.next_page_params,{cursor:'fork'});
});
test('transaction pages remain outside the Blocks no-op guard',()=>{
  const ctx={...context(initialLive()),key:'transactions',kind:'transactions'},tx={hash:hash(777),block_number:1000,block_hash:hash(1000),status:null};
  ctx.live.blocks=[{...row(1000),transaction_hashes:[tx.hash]}];ctx.live.transactions=[tx];
  let state=updateLedgerPage(emptyLedgerPage(ctx.key),{type:'stream'},ctx);
  state=stream(state,{...ctx,live:{...ctx.live,transactions:[{...tx,status:'ok',fee:{value:'12'}}]}});
  assert.equal(state.visible.items[0].status,'ok');assert.equal(state.visible.items[0].fee.value,'12');
});
test('retainObserved never enters the Blocks guard domain',()=>{
  const {state,ctx}=seed(),retained={...ctx,retainObserved:true};assert.notEqual(stream(state,retained),state);
});
test('a different chain scope invalidates a prior Blocks stream identity',()=>{
  const {state,ctx}=seed();assert.notEqual(stream(state,{...ctx,live:{...ctx.live,network:{...ctx.live.network,chainId:763373,expectedChainId:763373}}}),state);
});
test('a changed expected chain invalidates a prior Blocks stream identity',()=>{
  const {state,ctx}=seed();assert.notEqual(stream(state,{...ctx,live:{...ctx.live,network:{...ctx.live.network,expectedChainId:763373}}}),state);
});
test('same-height canonical replacement is applied instead of cached',()=>{
  const {state,ctx}=seed(),replacement={...ctx.live.blocks[0],hash:hash(777),transaction_hashes:[]};
  const next=stream(state,{...ctx,live:{...ctx.live,blocks:[replacement,...ctx.live.blocks.slice(1)]}});assert.notEqual(next,state);assert.equal(next.visible.items[0].hash,hash(777));
});
test('same-hash late metadata replaces the displayed beneficiary',()=>{
  const {state,ctx}=seed(),enriched={...ctx.live.blocks[0],miner:{hash:address,name:'Late indexed identity'}};
  const next=stream(state,{...ctx,live:{...ctx.live,blocks:[enriched,...ctx.live.blocks.slice(1)]}});assert.equal(next.visible.items[0].miner.name,'Late indexed identity');
});
test('a changed reference order invalidates the complete input vector',()=>{
  const {state,ctx}=seed(),rows=ctx.live.blocks;assert.notEqual(stream(state,{...ctx,live:{...ctx.live,blocks:[rows[1],rows[0],...rows.slice(2)]}}),state);
});
test('an empty delta with a pruned live window still reconciles',()=>{
  const {state,ctx,page}=seed(),frame={delta:true,block:ctx.live.block,blocks:[],transactions:[],window:{fromBlock:999,toBlock:1000}};
  const live={...ctx.live,...applyLiveFrame(ctx.live,frame)},next=stream(state,{...ctx,live});
  assert.notEqual(next,state);assert.deepEqual(live.blocks.map(item=>item.height),[1000,999]);preservesIndex(next,page);
});
test('resetting the buffer uses the current fallback block',()=>{
  const {state,ctx,page}=seed(),head=row(1002),frame={delta:true,reset:true,block:head,blocks:[],transactions:[],window:{fromBlock:1002,toBlock:1002}};
  const live={...ctx.live,...applyLiveFrame(ctx.live,frame),block:head},next=stream(state,{...ctx,live});
  assert.equal(next.visible.items[0].height,1002);assert(!next.visible.items.some(item=>item.height===1000));preservesIndex(next,page);
});
test('missing blocks and fallback do not keep stale live-only identities',()=>{
  const {state,ctx,page}=seed(),next=stream(state,{...ctx,live:{...ctx.live,blocks:[],block:undefined}});
  assert.deepEqual(heights(next),page.items.map(item=>item.height));preservesIndex(next,page);
});
for(const [field,value]of [['connected',false],['online',false],['synced',false],['stale',true]])test(`${field} unavailability and recovery invalidate the prior stream identity`,()=>{
  const {state,ctx}=seed(),live=field==='connected'?{...ctx.live,connected:value}:{...ctx.live,network:{...ctx.live.network,[field]:value}};
  assert.equal(isCurrentNetwork(live),false);const unavailable=stream(state,{...ctx,live});assert.deepEqual(unavailable.visible,state.visible);
  const recovered=stream(unavailable,ctx);assert.notEqual(recovered,unavailable);assert.deepEqual(recovered.visible,state.visible);assert.equal(stream(recovered,ctx),recovered);
});
test('index start retains pending state through following stream reconciliation',()=>{
  const {state,ctx}=seed(),pending=updateLedgerPage(state,{type:'start'},ctx);assert.equal(pending.pending,true);
  const next=stream(pending,ctx);assert.notEqual(next,pending);assert.equal(next.pending,true);assert.deepEqual(next.visible,state.visible);
});
test('index error retains its message through following stream reconciliation',()=>{
  const {state,ctx}=seed(),failed=updateLedgerPage(state,{type:'error',error:'Indexed history unavailable'},ctx);
  const next=stream(failed,ctx);assert.notEqual(next,failed);assert.equal(next.error,'Indexed history unavailable');assert.deepEqual(next.visible,state.visible);
});
test('indexed metadata and cursor refresh invalidate the previous stream identity',()=>{
  const {state,ctx,page}=seed(),fresh={...page,items:page.items.map(item=>({...item,index_provenance:'fresh'})),next_page_params:{cursor:'new-cursor'}};
  const indexedState=updateLedgerPage(state,{type:'indexed',page:fresh},ctx),next=stream(indexedState,ctx);
  assert.notEqual(next,indexedState);assert.deepEqual(next.visible.next_page_params,{cursor:'new-cursor'});assert.equal(next.visible.items.at(-1).index_provenance,'fresh');assert.equal(next.error,'');
});
test('accept invalidates the stream identity before it can become stable again',()=>{
  const {state,ctx}=seed(),accepted=updateLedgerPage(state,{type:'accept'},ctx),next=stream(accepted,ctx);
  assert.notEqual(next,accepted);assert.equal(stream(next,ctx),next);assert.deepEqual(next.visible,accepted.visible);
});
test('metadata beyond50 input rows still enriches the visible beneficiary',()=>{
  const rows=Array.from({length:51},(_,i)=>row(1100-i)),ctx={...context(initialLive()),live:{...initialLive(),blocks:rows,block:rows[0]}},{state}=seed(ctx);
  const changed=rows.map((item,i)=>i===50?{...item,miner:{hash:address,name:'Tail identity beyond50'}}:item),next=stream(state,{...ctx,live:{...ctx.live,blocks:changed}});
  assert.notEqual(next,state);assert.equal(next.visible.items[0].miner.name,'Tail identity beyond50');
});
