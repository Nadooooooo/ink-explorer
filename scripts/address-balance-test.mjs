import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyAddressBalance} from '../server/address-balance.mjs';

const now=1800000000000, hash='0x'+'a'.repeat(64), address='0x'+'1'.repeat(40);
const profile={hash:address,coin_balance:'900719925474099312345',block_number_balance_updated_at:10,name:'Keep index metadata'};
function fixture(overrides={}, balance='0x'+BigInt(profile.coin_balance).toString(16)) {
  const calls=[];
  const rpc=async(method,params)=>{
    calls.push({method,params});
    if(method in overrides) {const value=overrides[method];if(value instanceof Error)throw value;return value;}
    if(method==='eth_chainId')return '0xdef1';
    if(method==='eth_syncing')return false;
    if(method==='eth_getBlockByNumber')return {number:params[0]==='latest'?'0x20':'0xa',timestamp:'0x'+(now/1000).toString(16),hash};
    if(method==='eth_getBalance')return balance;
    throw Error(method);
  };
  return {rpc,calls,chainId:57073,now};
}
test('Balances are exact, canonical-hash reads with retained index provenance',async()=>{
  for(const amount of [profile.coin_balance,'900719925474099312346','0']) {
    const config=fixture({},'0x'+BigInt(amount).toString(16));
    const value=await verifyAddressBalance(profile,config);
    assert.equal(value.coin_balance,amount);
    assert.equal(value.name,profile.name);assert.equal(profile.coin_balance,'900719925474099312345');
    assert.equal(value.balance_check.status,amount===profile.coin_balance?'matched':'corrected');
    assert.equal(value.balance_check.indexed_balance,profile.coin_balance);
    assert.equal(value.balance_check.block_hash,hash);
    assert.deepEqual(config.calls.find(c=>c.method==='eth_getBalance').params,[address,{blockHash:hash,requireCanonical:true}]);
  }
});
test('Wrong, syncing, stale, missing or reorged node data cannot be marked verified',async()=>{
  for(const overrides of [
    {eth_chainId:'0x1'}, {eth_syncing:{}}, {eth_getBlockByNumber:null},
    {eth_getBlockByNumber:{number:'0x20',timestamp:'0x1',hash}},
    {eth_getBlockByNumber:{number:'0x20',timestamp:'0x'+(now/1000).toString(16),hash:'invalid'}},
    {eth_getBalance:new Error('Block is no longer canonical')}, {eth_getBalance:null},
    {eth_getBalance:'garbage'}, {eth_getBalance:'-0x1'},
  ]) {
    const value=await verifyAddressBalance(profile,fixture(overrides));
    assert.equal(value.coin_balance,profile.coin_balance);assert.deepEqual(value.balance_check,{status:'unavailable'});
  }
});
test('Invalid index heights and amounts retain index data without RPC reads',async()=>{
  for(const bad of [{block_number_balance_updated_at:-1},{block_number_balance_updated_at:null},{coin_balance:null},{coin_balance:'-1'},{hash:'invalid'}]) {
    const config=fixture(),value=await verifyAddressBalance({...profile,...bad},config);
    assert.equal(config.calls.length,0);assert.equal(value.balance_check.status,'unavailable');
  }
});
