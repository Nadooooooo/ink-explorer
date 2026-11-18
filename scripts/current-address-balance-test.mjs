import test from 'node:test';
import assert from 'node:assert/strict';
import {createCurrentAddressBalance,AddressBalanceBusy} from '../server/current-address-balance.mjs';
const address='0x'+'1'.repeat(40),other='0x'+'2'.repeat(40),hash='0x'+'a'.repeat(64),fork='0x'+'b'.repeat(64);
const time=1800000000000;
function fixture(){
 const state={now:time,chain:'0xdef1',sync:false,block:{number:'0x20',hash,timestamp:'0x'+(time/1000).toString(16)},amount:'0x200000000000001',calls:[]};
 const rpc=async(method,params,signal)=>{state.calls.push({method,params});if(method==='eth_chainId')return state.chain;if(method==='eth_syncing')return state.sync;if(method==='eth_getBlockByNumber')return state.block;if(method==='eth_getBalance'){await state.gate?.(signal);return state.amount;}throw Error(method);};
 return {state,read:createCurrentAddressBalance({rpc,chainId:57073,now:()=>state.now,limit:2})};
}
test('Concurrent reads share work and exact balances use EIP-1898 canonical hashes',async()=>{
 const {state,read}=fixture();const values=await Promise.all(Array.from({length:30},()=>read(address)));
 assert.equal(state.calls.filter(x=>x.method==='eth_getBalance').length,1);
 assert(values.every(v=>v===values[0]));assert.equal(values[0].balance,'144115188075855873');
 assert.deepEqual(state.calls.find(x=>x.method==='eth_getBalance').params,[address,{blockHash:hash,requireCanonical:true}]);
 await read(address);assert.equal(state.calls.filter(x=>x.method==='eth_getBalance').length,1);
 assert.equal(state.calls.filter(x=>x.method==='eth_getBlockByNumber').length,2,'A cache hit must re-observe the canonical head');
 await read(other);assert.equal(state.calls.filter(x=>x.method==='eth_getBalance').length,2);
});
test('New heads and same-height replacements never reuse the old hash balance',async()=>{
 const {state,read}=fixture();await read(address);state.amount='0x0';state.block={...state.block,hash:fork};
 const next=await read(address);assert.equal(next.balance,'0');assert.equal(next.block.hash,fork);
 state.block={...state.block,number:'0x21',hash:'0x'+'c'.repeat(64)};state.amount='0x'+('f'.repeat(64));
 assert.equal((await read(address)).balance,(2n**256n-1n).toString());
 assert.equal(state.calls.filter(x=>x.method==='eth_getBalance').length,3);
});
test('Invalid, wrong-network, stale and noncanonical reads fail without inventing zero',async()=>{
 for(const change of [{chain:'0x1'},{sync:{}},{block:null},{block:{number:'0x20',hash,timestamp:'0x1'}},{block:{number:'0x20',hash:'bad',timestamp:'0x'+(time/1000).toString(16)}},{amount:null},{amount:'-0x1'},{amount:'0x'+('f'.repeat(65))},{gate:()=>{throw Error('not canonical');}}]){
  const {state,read}=fixture();Object.assign(state,change);await assert.rejects(read(address));
 }
 const {state,read}=fixture();await assert.rejects(read('invalid'));assert.equal(state.calls.length,0);
});
test('Responses retain the original observation time and expire even with a delayed RPC',async()=>{
 const {state,read}=fixture();state.gate=()=>{state.now+=15001;};await assert.rejects(read(address));
 state.gate=undefined;state.block={...state.block,timestamp:'0x'+Math.floor(state.now/1000).toString(16)};
 assert.equal((await read(address)).observedAt,new Date(state.now).toISOString());
});
test('Bounded concurrent addresses share a head query and free slots after failure',async()=>{
 const {state,read}=fixture();let release;state.gate=()=>new Promise(r=>release=r);
 const first=read(address);await new Promise(r=>setImmediate(r));
 let releaseOther;state.gate=()=>new Promise(r=>releaseOther=r);const second=read(other);await new Promise(r=>setImmediate(r));
 await assert.rejects(read('0x'+'3'.repeat(40)),AddressBalanceBusy);release();releaseOther();await Promise.all([first,second]);
 state.gate=undefined;assert.equal((await read('0x'+'3'.repeat(40))).address,'0x'+'3'.repeat(40));
});
