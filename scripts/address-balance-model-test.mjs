import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){try{return n(s,c)}catch(e){if(s.startsWith('./')&&c.parentURL?.includes('/src/')&&!/\.[a-z]+$/.test(s))return n(s+'.ts',c);throw e;}}});
import test from 'node:test';
import assert from 'node:assert/strict';
const {normalizeAddressBalance,profileAddressBalance,currentAddressBalance}=await import('../src/address-balance.ts');
const now=1800000000000,id='0x'+'1'.repeat(40),hash='0x'+'a'.repeat(64),fork='0x'+'b'.repeat(64);
const data=()=>({schema:1,chainId:57073,address:id,balance:'900719925474099312345',block:{number:100,hash,timestamp:now/1000},observedAt:new Date(now).toISOString(),source:'local'});
const frame=()=>({connected:true,network:{online:true,synced:true,stale:false,chainId:57073,expectedChainId:57073,head:100,sampledAt:new Date(now).toISOString()},block:{height:100,hash},blocks:[{height:100,hash}]});
test('Current balance observations preserve integer precision and validate identity and age',()=>{
 assert.equal(normalizeAddressBalance(data(),id,57073,now).balance,'900719925474099312345');
 for(const patch of [{balance:-1},{balance:'-1'},{balance:(2n**256n).toString()},{chainId:1},{address:'0x'+'2'.repeat(40)},{source:'index'},{observedAt:new Date(now-15000).toISOString()},{block:{...data().block,timestamp:now/1000-15}},{observedAt:new Date(now+2000).toISOString()}])assert.throws(()=>normalizeAddressBalance({...data(),...patch},id,57073,now));
});
test('A disconnected, replaced, wrong-network or expired frame cannot prove a current balance',()=>{
 assert.equal(currentAddressBalance(data(),frame(),57073,now)?.balance,data().balance);
 for(const f of [{...frame(),connected:false},{...frame(),block:{height:100,hash:fork}},{...frame(),network:{...frame().network,chainId:1}},{...frame(),network:{...frame().network,sampledAt:new Date(now-16000).toISOString()}}])assert.equal(currentAddressBalance(data(),f,57073,now),undefined);
 const f=frame();f.network.head=101;f.block={height:101,hash:fork};assert(currentAddressBalance(data(),f,57073,now));
 f.blocks=[];assert.equal(currentAddressBalance(data(),f,57073,now),undefined);
 assert.equal(currentAddressBalance(data(),frame(),57073,now+15000),undefined);
});
test('Only explicitly current-head profile evidence can bridge initial socket startup',()=>{
 const d=data(),profile={hash:id,coin_balance:d.balance,balance_check:{status:'matched',scope:'head',block_number:100,block_hash:hash,block_timestamp:now/1000,checked_at:d.observedAt,source:'local'}};
 const initial=profileAddressBalance(profile,id,57073,now);assert(initial);
 assert(currentAddressBalance(initial,{connected:false,initialPending:true},57073,now));
 delete profile.balance_check.scope;assert.equal(profileAddressBalance(profile,id,57073,now),undefined);
});
