import test from 'node:test';
import assert from 'node:assert/strict';
import {accountInteger,normalizeAddressProfile,normalizeAddressCounters,normalizeAddressAssetCount} from '../src/address-data.ts';

const address='0x'+'a'.repeat(40),other='0x'+'b'.repeat(40),chain=57073;
test('address totals preserve integers and reject coercion, unsafe numbers and missing values',()=>{
 for(const [input,expected] of [[0,'0'],['0','0'],[9007199254740993n,'9007199254740993'],['9007199254740993','9007199254740993']])assert.equal(accountInteger(input),expected);
 for(const input of [null,undefined,'',false,true,{},[],-1,'-1','1.2','0x10',NaN,Infinity,9007199254740992])assert.equal(accountInteger(input),undefined);
 const profile=normalizeAddressProfile({hash:address,coin_balance:'9007199254740993',block_number_balance_updated_at:0},address,chain);
 assert.equal(profile.coin_balance,'9007199254740993');assert.equal(profile.block_number_balance_updated_at,'0');
 const counters=normalizeAddressCounters({transactions_count:'9007199254740993',token_transfers_count:0,gas_usage_count:false},chain);
 assert.equal(counters.transactions_count,'9007199254740993');assert.equal(counters.token_transfers_count,'0');assert.equal(counters.gas_usage_count,undefined);
});
test('profiles and counters reject wrong identities, chain and malformed payloads',()=>{
 for(const value of [null,[],{}, {hash:other}, {hash:address,chain_id:763373}])assert.throws(()=>normalizeAddressProfile(value,address,chain),/invalidApiResponse/);
 for(const value of [null,[],false,{chain_id:763373}])assert.throws(()=>normalizeAddressCounters(value,chain),/invalidApiResponse/);
 assert.equal(normalizeAddressProfile({hash:address.toUpperCase().replace('0X','0x'),chain_id:String(chain)},address,chain).coin_balance,undefined);
});
test('an inventory count requires a complete valid list and distinct token identities',()=>{
 const item={token:{address_hash:address},value:'0'};
 assert.equal(normalizeAddressAssetCount([],chain),0);
 assert.equal(normalizeAddressAssetCount({items:[item],next_page_params:null,chain_id:chain},chain),1);
 assert.equal(normalizeAddressAssetCount([{...item,token_id:0},{...item,token_id:1}],chain),2);
 for(const value of [null,{}, {items:[item],next_page_params:{page:2}}, {items:[item],chain_id:763373}, [null], [item,item], [{...item,value:9007199254740992}], [{...item,token:{}}], [{...item,token_id:false}], [{...item,token_id:'00'},{...item,token_id:0}]])assert.throws(()=>normalizeAddressAssetCount(value,chain),/invalidApiResponse/);
});
