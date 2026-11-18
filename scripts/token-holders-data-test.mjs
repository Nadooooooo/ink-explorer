import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeTokenHolders} from '../src/token-data.ts';
const token='0x'+'a'.repeat(40),holder='0x'+'b'.repeat(40),chain=57073;
test('holder pages retain exact integers, zeros, account metadata and opaque cursors',()=>{
 const item={address:{hash:holder,name:'Named holder',is_contract:true},value:'9007199254740993'};
 const next_page_params={value:0,address_hash:holder,fiat_value:null,is_null:false};
 const page=normalizeTokenHolders({items:[item],next_page_params,chain_id:String(chain),token_address_hash:token},token,chain);
 assert.deepEqual(page,{items:[item],next_page_params});
 const zero=normalizeTokenHolders({items:[{address:holder,value:0}],next_page_params:{}},token,chain);
 assert.equal(zero.items[0].value,'0');assert.equal(zero.items[0].address.hash,holder);assert.equal(zero.next_page_params,null);
});
test('holder pages reject duplicate accounts, invalid identities, wrong scope and malformed cursors',()=>{
 const item={address:{hash:holder},value:'1'};
 for(const value of [null,[],{}, {items:[null]}, {items:[{address:'invalid',value:'1'}]}, {items:[item,item]},
  {items:[item,{...item,address:{hash:holder.toUpperCase().replace('0X','0x')}}]},
  {items:[item],chain_id:763373}, {items:[item],token_address_hash:holder}, {items:[{...item,address:{hash:holder,chain_id:763373}}]},
  ...[[],false,'cursor',{field:{}},{field:Infinity}].map(next_page_params=>({items:[item],next_page_params}))])assert.throws(()=>normalizeTokenHolders(value,token,chain),/invalidApiResponse/);
});
test('invalid holder amounts stay unknown without suppressing valid identity',()=>{
 for(const value of [null,undefined,'',true,false,[],{},-1,'-1','1.2','0x10',NaN,Infinity,9007199254740992]){
  const page=normalizeTokenHolders({items:[{address:{hash:holder},value}]},token,chain);
  assert.equal(page.items[0].address.hash,holder);assert.equal(page.items[0].value,undefined);
 }
});
