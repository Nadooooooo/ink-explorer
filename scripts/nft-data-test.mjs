import test from 'node:test';import assert from 'node:assert/strict';import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){try{return next(specifier,context)}catch(e){if(specifier.startsWith('.')&&!/\.[a-z]+$/.test(specifier))return next(specifier+'.ts',context);throw e;}}});
const {normalizeNftInstance,normalizeNftInstances,normalizeNftTransferCount}=await import('../src/nft-data.ts');
const contract='0x'+'a'.repeat(40),owner='0x'+'b'.repeat(40),chain=57073,huge=(2n**256n-1n).toString();
test('NFT identity remains exact, including zero and the largest uint256',()=>{
 for(const id of ['0',huge]){const n=normalizeNftInstance({id,owner:{hash:owner},token:{address_hash:contract}},contract,id,chain);assert.equal(n.id,id);assert.equal(n.owner.hash,owner);}
 const n=normalizeNftInstance({id:0,owner:null,metadata:{name:{bad:true},description:{bad:true},attributes:[null,{trait_type:{},value:{nested:1}}]}},contract,'0',chain);
 assert.equal(n.owner,null);assert.equal(n.metadata.name,undefined);assert.equal(n.metadata.description,undefined);assert.equal(n.metadata.attributes[0].value,'{"nested":1}');assert.deepEqual(n.raw_metadata.name,{bad:true});
});
test('NFT scope cannot silently display an unrelated token or owner',()=>{
 for(const value of [null,[],{}, {id:false},{id:'-1'},{id:9007199254740992},{id:2n**256n},{id:'1'}, {id:0,chain_id:1},{id:0,token_address_hash:owner},{id:0,token:{address_hash:owner}},{id:0,owner:{hash:'bad'}},{id:0,owner:{hash:owner,chain_id:1}}])assert.throws(()=>normalizeNftInstance(value,contract,'0',chain),/invalidApiResponse/);
 const n=normalizeNftInstance({id:0,owner:{hash:owner,name:{},implementations:{},metadata:{tags:[null,{name:{}}]}}},contract,'0',chain);assert.equal(n.owner.name,undefined);assert.deepEqual(n.owner.implementations,[]);assert.deepEqual(n.owner.metadata.tags,[]);
});
test('NFT directory validates duplicate canonical IDs and preserves opaque cursors',()=>{
 const cursor={unique_token:0,flag:false,other:null};const n=normalizeNftInstances({items:[{id:0},{id:huge}],next_page_params:cursor},contract,chain);assert.deepEqual(n.next_page_params,cursor);assert.equal(n.items[1].id,huge);
 for(const value of [{items:[{id:0},{id:'00'}]},{items:[{id:0}],next_page_params:{nested:{}}},{items:[null]},{items:[] ,chain_id:1}])assert.throws(()=>normalizeNftInstances(value,contract,chain),/invalidApiResponse/);
});
test('Transfer counters never infer a total from a loaded history page',()=>{
 assert.equal(normalizeNftTransferCount({transfers_count:'9007199254740993'},contract,'0',chain).transfers_count,'9007199254740993');
 assert.equal(normalizeNftTransferCount({transfers_count:0},contract,'0',chain).transfers_count,'0');
 for(const v of [null,false,'',9007199254740992,{},'-1'])assert.equal(normalizeNftTransferCount({transfers_count:v},contract,'0',chain).transfers_count,undefined);
 assert.throws(()=>normalizeNftTransferCount({id:1,transfers_count:1},contract,'0',chain),/invalidApiResponse/);
});
