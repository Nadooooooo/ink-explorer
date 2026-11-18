import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){try{return n(s,c)}catch(e){if(s.startsWith('./')&&c.parentURL?.includes('/src/')&&!/\.[a-z]+$/.test(s))return n(s+'.ts',c);throw e;}}});
const {observeTransaction,followedTransaction,currentConfirmations,transactionNeedsIndex,transactionNeedsReceipt,transactionIndexWitness,reinclusionReceipt}=await import('../src/transaction-follow.ts');
const id='0x'+'a'.repeat(64),old='0x'+'b'.repeat(64),other='0x'+'c'.repeat(64),wallet='0x'+'d'.repeat(40),now=Date.now();
const frame=(changes={})=>({connected:true,network:{chainId:57073,expectedChainId:57073,online:true,synced:true,stale:false,head:101,finalizedBlock:90,sampledAt:new Date(now).toISOString()},blocks:[{height:100,hash:old,transaction_hashes:[id],timestamp:new Date(now).toISOString()}],transactions:[],...changes});
const pending={hash:id,block_number:null,status:'pending',fee:{type:'maximum',value:'999999999'},from:{hash:wallet,name:'Named wallet'},method:'namedMethod',raw_input:'0x12345678'};
test('node inclusion updates pending, without calling header inclusion execution success',()=>{
 const proof=observeTransaction(id,pending,frame(),57073,undefined,now);const result=followedTransaction(pending,proof);
 assert.equal(result.block_number,100);assert.equal(result.status,null);assert.equal(result.result,'confirmed');assert.equal(result.fee,undefined);assert.equal(result.from.name,'Named wallet');assert.equal(result.raw_input,'0x12345678');
 assert.equal(currentConfirmations(result,frame(),57073,now),1);
});
test('receipt failure wins over pending or success index; enrichment survives',()=>{
 const record={hash:id,block_hash:old,block_number:100,status:'error',result:'execution reverted',gas_used:'90071992547409931',fee:{type:'actual',value:'900719925474099312345'},from:{hash:wallet},method:'0x12345678'};
 const proof=observeTransaction(id,pending,frame({transactions:[record]}),57073,undefined,now);const result=followedTransaction(pending,proof);
 assert.equal(result.status,'error');assert.equal(result.fee.value,'900719925474099312345');assert.equal(result.method,'namedMethod');assert.equal(result.from.name,'Named wallet');
 assert.strictEqual(observeTransaction(id,result,frame(),57073,proof,now),proof);
});
test('wrong chain, expired or disconnected observations cannot change inclusion or confirmations',()=>{
 for(const f of [frame({connected:false}),frame({network:{...frame().network,chainId:763373}}),frame({network:{...frame().network,sampledAt:new Date(now-15001).toISOString()}}),frame({network:{...frame().network,synced:false}})]){
 assert.equal(observeTransaction(id,pending,f,57073,undefined,now),undefined);assert.equal(currentConfirmations({block_number:100},f,57073,now),null);
 }
 for(const number of [null,undefined,'',-1,102,1.5])assert.equal(currentConfirmations({block_number:number},frame(),57073,now),null);
});
test('full membership detects replacement without indexed block hash, and late index cannot restore old execution',()=>{
 const indexed={...pending,block_number:100,status:'ok',gas_used:'100',fee:{type:'actual',value:'200'}};
 const f=frame({blocks:[{height:100,hash:other,transaction_hashes:[]}]});
 const proof=observeTransaction(id,indexed,f,57073,undefined,now);assert.equal(proof.replaced,true);
 const after=followedTransaction(indexed,proof);assert.equal(after.block_number,null);assert.equal(after.status,'pending');assert.equal(after.fee,undefined);
 assert.strictEqual(observeTransaction(id,indexed,frame({blocks:[]}),57073,proof,now),proof);
 const included=observeTransaction(id,indexed,frame({blocks:[{height:100,hash:other,transaction_hashes:[id]}]}),57073,proof,now);
 assert.equal(followedTransaction(indexed,included).fee,undefined,'Old fee must not survive same-height reinclusion');
});
test('a truncated live transaction list does not imply absence from the full block',()=>{
 const proof=observeTransaction(id,pending,frame({transactions:[]}),57073,undefined,now);assert.equal(proof.replaced,false);
 const malformed=frame({blocks:[{height:100,hash:old}]});assert.equal(observeTransaction(id,{...pending,block_number:100},malformed,57073,undefined,now),undefined);
});
test('confirmed history stops index refresh after finalized height, pending and changed blocks still retry',()=>{
 const indexed={...pending,block_number:80,status:'ok'};assert.equal(transactionNeedsIndex(indexed,undefined,frame(),57073),false);
 assert.equal(transactionNeedsIndex(pending,undefined,frame(),57073),true);
 assert.equal(transactionNeedsIndex({...indexed,block_number:100},undefined,frame(),57073),true);
 assert.equal(transactionNeedsIndex(indexed,{height:81},frame(),57073),true);
});
test('missed reinclusion is recovered only from a matching network receipt and coherent canonical window',()=>{
 const previous={id,height:100,blockHash:old,replaced:true,record:pending};
 const value={chainId:57073,result:{transactionHash:id,blockHash:other,blockNumber:'0x65',status:'0x0',gasUsed:'0x5208',effectiveGasPrice:'0x2',l1Fee:'0x3'}};
 const proof=reinclusionReceipt(id,value,57073,frame(),previous);assert.equal(proof.height,101);assert.equal(proof.record.status,'error');assert.equal(proof.record.fee.value,'42003');
 assert.equal(reinclusionReceipt(id,{...value,chainId:763373},57073,frame(),previous),undefined);
 assert.equal(reinclusionReceipt(id,{...value,result:{...value.result,blockHash:old}},57073,frame(),previous),undefined);
 assert.equal(reinclusionReceipt(id,value,57073,frame({blocks:[{height:101,hash:old,transaction_hashes:[]}]}),previous),undefined);
});
test('mixed-case search identity cannot leave a pending duplicate ahead of its receipt',()=>{
 const mixed=id.toUpperCase().replace('0X','0x'),indexed={...pending,hash:mixed,block_number:100};
 const proof=observeTransaction(mixed,indexed,frame({transactions:[{hash:id,block_hash:old,block_number:100,status:'error',result:'execution reverted'}]}),57073,undefined,now);
 assert.equal(followedTransaction(indexed,proof).status,'error');
});

test('a changed index inclusion after a missed window requires a current receipt instead of freezing the old block',()=>{
 const previous={id,height:100,blockHash:old,replaced:false,record:{hash:id,block_number:100,block_hash:old,status:'ok'}};
 const indexed={...pending,block_number:105,status:'error'};
 const gap=frame({blocks:[],network:{...frame().network,head:200}});
 assert.equal(transactionNeedsReceipt(indexed,previous,gap,57073,now),true);
 const receipt=reinclusionReceipt(id,{chainId:57073,result:{transactionHash:id,blockHash:other,blockNumber:'0x69',status:'0x0',gasUsed:'0x5208',effectiveGasPrice:'0x2',l1Fee:'0x3'}},57073,gap,previous);
 const result=followedTransaction(indexed,receipt);assert.equal(result.block_number,105);assert.equal(result.status,'error');assert.equal(currentConfirmations(result,gap,57073,now),95);
 assert.equal(transactionNeedsReceipt(indexed,receipt,gap,57073,now),false);
});
test('a receipt confirming the old block bounds an index conflict; current full membership needs no RPC',()=>{
 const indexed={...pending,block_number:105};const previous={id,height:100,blockHash:old,replaced:false,record:{hash:id,block_number:100,status:'ok'}};
 assert.equal(transactionNeedsReceipt(indexed,previous,frame(),57073,now),false);
 const gap=frame({blocks:[]});
 const receipt=reinclusionReceipt(id,{chainId:57073,result:{transactionHash:id,blockHash:old,blockNumber:'0x64',status:'0x1'}},57073,gap,previous);
 assert(receipt);const checked={...receipt,indexWitness:transactionIndexWitness(indexed),receiptCheckedAt:now};
 assert.equal(transactionNeedsReceipt(indexed,checked,gap,57073,now+14000),false);
 assert.equal(transactionNeedsReceipt(indexed,checked,gap,57073,now+15000),true);
 assert.equal(transactionNeedsReceipt({...indexed,block_number:106},checked,gap,57073,now),true);
});
