import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){try{return next(specifier,context)}catch(error){if(specifier.startsWith('.')&&!/\.[a-z]+$/.test(specifier))return next(specifier+'.ts',context);throw error;}}});
const {normalizeAccountInventory}=await import('../src/inventory-data.ts');
const account='0x'+'a'.repeat(40),other='0x'+'b'.repeat(40),token='0x'+'1'.repeat(40),chain=57073;
test('inventory pages retain exact raw amounts, zero NFT IDs and opaque pagination fields',()=>{
 const item={value:'9007199254740993',token:{address_hash:token,decimals:'18',name:'Token'}},cursor={value:0,price:null,flag:false};
 const page=normalizeAccountInventory({items:[item],next_page_params:cursor},account,'tokens',chain);
 assert.equal(page.items[0].value,item.value);assert.equal(page.items[0].token.decimals,18);assert.deepEqual(page.next_page_params,cursor);
 const nft=normalizeAccountInventory({items:[{...item,id:0,owner:{hash:account},token:{address_hash:token,type:'ERC-721'}}]},account,'nft',chain);
 assert.equal(nft.items[0].id,'0');assert.equal(nft.items[0].inventory_key,token+':0');assert.equal(nft.next_page_params,null);
});
test('incomplete metadata remains renderable without claiming an unidentified asset balance',()=>{
 const page=normalizeAccountInventory({items:[{value:'0'}, {value:'1',token:{address_hash:token,name:{bad:true},decimals:null}}]},account,'tokens',chain);
 assert.equal(page.items[0].value,undefined);assert.equal(page.items[0].token.address_hash,undefined);assert.equal(page.items[1].token.name,undefined);assert.equal(page.items[1].token.decimals,null);
 for(const value of [null,'',false,{},9007199254740992])assert.equal(normalizeAccountInventory({items:[{value,token:{address_hash:token}}]},account,'tokens',chain).items[0].value,undefined);
 assert.equal(normalizeAccountInventory({items:[{id:null,value:'1',token:{address_hash:token}}]},account,'nft',chain).items[0].value,undefined);
 const owner=normalizeAccountInventory({items:[{id:0,value:'1',token:{address_hash:token},owner:{hash:account,name:{bad:true},metadata:{tags:[null,{tagType:'name',name:{bad:true}},{tagType:'name',name:'Safe name'}]},implementations:{bad:true}}}]},account,'nft',chain).items[0].owner;
 assert.equal(owner.name,undefined);assert.deepEqual(owner.metadata.tags,[{tagType:'name',name:'Safe name'}]);assert.deepEqual(owner.implementations,[]);
});
test('duplicate identities, inconsistent NFT ownership and invalid scope/cursors are rejected',()=>{
 const item={id:0,value:'1',token:{address_hash:token,type:'ERC-721'}};
 for(const value of [null,[],{}, {items:[null]}, {items:[item,item]}, {items:[item,{...item,id:'00'}]},
  {items:[{...item,token:{address_hash:'bad'}}]}, {items:[{...item,id:false}]}, {items:[{...item,owner:{hash:other}}]},
  {items:[item],chain_id:763373}, {items:[item],address_hash:other}, {items:[item],next_page_params:{invalid:{}}}, {items:[item],next_page_params:[]}])assert.throws(()=>normalizeAccountInventory(value,account,'nft',chain),/invalidApiResponse/);
 assert.equal(normalizeAccountInventory({items:[item,{...item,id:1}]},account,'nft',chain).items.length,2);
 const shared=normalizeAccountInventory({items:[{...item,owner:{hash:other},token:{address_hash:token,type:'ERC-1155'}}]},account,'nft',chain);
 assert.equal(shared.items[0].value,'1');
});
