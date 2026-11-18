import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mergeLiveTransactions,mergeLiveBlocks,applyLiveFrame} from '../src/live-ledger.ts';
const addressA='0x'+'a'.repeat(40),addressB='0x'+'b'.repeat(40);
test('receipt updates preserve names and replace provisional status',()=>{
  const result=mergeLiveTransactions([{hash:'tx',block_number:1,from:{hash:addressA},to:{hash:addressB,name:'Known contract',is_contract:true},method:'swap',status:null}],[{hash:'tx',block_number:1,to:{hash:addressB},status:'ok',fee:{value:'12'},method:'0x12345678'}],[]);
  assert.equal(result[0].to.name,'Known contract');assert.equal(result[0].status,'ok');assert.equal(result[0].method,'swap');
});
test('canonical hash set removes orphaned indexed rows without a block hash',()=>{
  assert.equal(mergeLiveTransactions([{hash:'orphan',block_number:1}],[],[{height:1,hash:'new',transaction_hashes:['new-tx']}]).length,0);
});
test('deltas accumulate, same-height replacement removes old transactions and reset forgets previous scope',()=>{
  const initial=applyLiveFrame({}, {delta:true,reset:true,block:{height:1},blocks:[{height:1,hash:'a',transaction_hashes:['tx-a']}],transactions:[{hash:'tx-a',block_number:1,block_hash:'a'}]});
  const next=applyLiveFrame(initial,{delta:true,block:{height:2},blocks:[{height:2,hash:'b',transaction_hashes:['tx-b']}],transactions:[{hash:'tx-b',block_number:2,block_hash:'b'}]});
  assert.equal(next.blocks.length,2);assert.equal(next.transactions.length,2);
  const replacement=applyLiveFrame(next,{delta:true,block:{height:2},blocks:[{height:2,hash:'c',transaction_hashes:['tx-c']}],transactions:[{hash:'tx-c',block_number:2,block_hash:'c'}]});
  assert.deepEqual(replacement.transactions.map(tx=>tx.hash),['tx-c','tx-a']);
  assert.equal(applyLiveFrame(replacement,{delta:true,reset:true,block:{height:2},blocks:[],transactions:[]}).transactions.length,0);
});
test('an indexed refresh cannot reintroduce an orphan transaction',()=>{
 const blocks=[{height:1,hash:'canonical',transaction_hashes:['good']}];
 assert.deepEqual(mergeLiveTransactions([],[{hash:'old',block_number:1,block_hash:'orphan'},{hash:'unknown-old',block_number:1}],blocks),[]);
});
test('raw beneficiary updates preserve known identity and enrich new blocks of the same account',()=>{
 const miner={hash:addressA,name:'Vault',is_contract:true,is_verified:true,proxy_type:'eip1967'};
 const current=[{height:2,hash:'two',miner}];
 const rows=mergeLiveBlocks(current,[{height:2,hash:'two',miner:addressA},{height:3,hash:'three',miner:addressA.toUpperCase().replace('0X','0x')}]);
 assert.equal(rows[0].miner,miner);assert.equal(rows[1],current[0]);
 assert.deepEqual(mergeLiveBlocks([],[{height:3,hash:'three',miner:addressA}])[0].miner,addressA,'No identity leaks between independent pages or networks');
});
test('beneficiary identity never crosses an address or replaces canonical block facts',()=>{
 const current=[{height:2,hash:'old',miner:{hash:addressA,name:'Vault',is_verified:true},transaction_fees:'999'}];
 const row=mergeLiveBlocks(current,[{height:2,hash:'new',miner:addressB,gas_used:'123'}])[0];
 assert.equal(row.miner,addressB);assert.equal(row.hash,'new');assert.equal(row.transaction_fees,undefined);assert.equal(row.gas_used,'123');
});
test('transaction identity merging checks the address and accepts explicit metadata changes',()=>{
 const initial=[{hash:'tx',to:{hash:addressA,name:'Old name',is_contract:true,is_verified:true,implementations:[{name:'Old implementation'}]}}];
 assert.deepEqual(mergeLiveTransactions(initial,[{hash:'tx',to:{hash:addressB}}],[])[0].to,{hash:addressB});
 const same=mergeLiveTransactions(initial,[{hash:'tx',to:{hash:addressA.toUpperCase().replace('0X','0x'),is_verified:null,is_contract:null}}],[])[0];
 assert.equal(same.to.name,'Old name');assert.equal(same.to.is_verified,true);assert.equal(same.to.is_contract,true);
 const updated=mergeLiveTransactions(initial,[{hash:'tx',to:{hash:addressA,name:null,is_verified:false,implementations:[]}}],[])[0];
 assert.equal(updated.to.name,null);assert.equal(updated.to.is_verified,false);assert.deepEqual(updated.to.implementations,[]);
 assert.equal(mergeLiveTransactions(initial,[{hash:'tx',to:addressA}],[])[0].to,initial[0].to);
 assert.equal(mergeLiveTransactions(initial,[{hash:'tx',to:'invalid'}],[])[0].to,'invalid');
});

test('open block canonical observations persist only for that block and accept current matching-chain evidence', async()=>{
 const {observeBlockCanonicality}=await import('../src/live-ledger.ts');
 const hash=n=>'0x'+String(n).repeat(64), block={height:100,hash:hash(1)};
 const live={connected:true,network:{online:true,synced:true,chainId:57073,expectedChainId:57073},blocks:[{height:100,hash:hash(2)}]};
 const replaced=observeBlockCanonicality(block,live);
 assert.equal(replaced.canonicalHash,hash(2));
 assert.equal(observeBlockCanonicality(block,live,replaced),replaced);
 assert.equal(observeBlockCanonicality(block,{...live,blocks:[]},replaced),replaced);
 for(const update of [{connected:false},{network:{...live.network,stale:true}},{network:{...live.network,synced:false}},{network:{...live.network,chainId:763373}},{network:{online:true,synced:true}}]){
  assert.equal(observeBlockCanonicality(block,{...live,blocks:[block],...update},replaced),replaced);
  assert.equal(observeBlockCanonicality(block,{...live,...update}),undefined);
 }
 assert.equal(observeBlockCanonicality(block,{...live,blocks:[block]},replaced).canonicalHash,block.hash);
 assert.equal(observeBlockCanonicality({...block,hash:hash(3)},{...live,blocks:[]},replaced),undefined);
 assert.equal(observeBlockCanonicality({...block,height:101},{...live,blocks:[]},replaced),undefined);
 assert.equal(observeBlockCanonicality(undefined,live,replaced),undefined);
 assert.equal(observeBlockCanonicality(block,{...live,blocks:[{height:100,hash:'invalid'}]},replaced),replaced);
});
