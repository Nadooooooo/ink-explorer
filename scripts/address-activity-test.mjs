import assert from 'node:assert/strict';import {test} from 'node:test';import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){try{return n(s,c)}catch(e){if(s.startsWith('./')&&c.parentURL?.includes('/src/')&&!/\.[a-z]+$/.test(s))return n(s+'.ts',c);throw e;}}});
const {addressActivityFrame,readAddressTransactions}=await import('../src/address-activity.ts');const {emptyLedgerPage,updateLedgerPage}=await import('../src/ledger-page.ts');
const h=n=>'0x'+BigInt(n).toString(16).padStart(64,'0'),address='0x'+'a'.repeat(40),other='0x'+'b'.repeat(40),third='0x'+'c'.repeat(40),now=Date.now();
const tx=(n,id=n,extra={})=>({hash:h(id),block_number:n,block_hash:h(n),position:0,from:{hash:other},to:{hash:address},...extra});
const frame=(height,rows=[tx(height)],extra={})=>({connected:true,sequence:height,network:{online:true,synced:true,stale:false,chainId:57073,expectedChainId:57073,head:height,sampledAt:new Date(now).toISOString()},block:{height,hash:h(height)},blocks:[{height,hash:h(height),transaction_hashes:rows.map(t=>t.hash)}],transactions:rows,...extra});
const context=(live,extra={})=>({key:address,kind:'transactions',streaming:true,holding:false,retainObserved:true,live:addressActivityFrame(live,address,57073,now),...extra});
const hashes=s=>s.visible.items.map(t=>t.hash);
test('live account scope requires fresh matching-chain canonical membership, including creations',()=>{
 const rows=[tx(100),tx(100,101,{from:{hash:address.toUpperCase().replace('0X','0x')},to:{hash:other}}),tx(100,102,{to:null,created_contract:{hash:address}}),tx(100,103,{from:{hash:other},to:{hash:third}}),tx(100,104,{block_hash:h(99)})];
 const f=frame(100,rows);assert.deepEqual(addressActivityFrame(f,address,57073,now).transactions.map(t=>t.hash),[h(100),h(101),h(102)]);
 for(const update of [{connected:false},{network:{...f.network,chainId:763373}},{network:{...f.network,synced:false}},{network:{...f.network,online:'true'}},{network:{...f.network,head:99}},{network:{...f.network,sampledAt:new Date(now-16000).toISOString()}}])assert.equal(addressActivityFrame({...f,...update},address,57073,now).connected,false);
 assert.equal(addressActivityFrame({...f,blocks:[{...f.blocks[0],transaction_hashes:[]}]},address,57073,now).transactions.length,0);
});
test('indexed account pages cannot mix addresses, chains or invalid cursors',()=>{
 assert.equal(readAddressTransactions({items:[tx(1)],next_page_params:{block_number:1,index:0}},address,57073).items.length,1);
 for(const v of [{items:[{...tx(1),hash:"invalid"}]},{items:[tx(1,1,{to:{hash:third}})]},{items:[tx(1)],chainId:763373},{items:[tx(1)],next_page_params:{nested:{x:1}}}])assert.throws(()=>readAddressTransactions(v,address,57073));
});
test('sparse transactions remain visible after leaving the shared live window and history retains every tail row',()=>{
 let s=updateLedgerPage(emptyLedgerPage(address),{type:'stream'},context(frame(100)));
 s=updateLedgerPage(s,{type:'stream'},context(frame(140,[])));assert.deepEqual(hashes(s),[h(100)]);
 const page={items:Array.from({length:50},(_,i)=>tx(90-i)),next_page_params:{block_number:41,index:0}};
 s=updateLedgerPage(s,{type:'indexed',page},context(frame(141)));assert.equal(s.visible.items.length,52);assert(hashes(s).includes(h(41)));assert.deepEqual(s.visible.next_page_params,page.next_page_params);
});
test('reading holds order and cursor, while accepting shows updates and preserved metadata',()=>{
 let s=updateLedgerPage(emptyLedgerPage(address),{type:'indexed',page:{items:[tx(100,100,{to:{hash:address,name:'Named contract'},method:'swap'})],next_page_params:{block_number:100,index:0}}},context(frame(100)));
 s=updateLedgerPage(s,{type:'stream'},context(frame(101),{holding:true}));assert.deepEqual(hashes(s),[h(100)]);assert.equal(s.visible.items[0].to.name,'Named contract');assert.equal(s.candidate.items[0].hash,h(101));assert.equal(s.visible.next_page_params.block_number,100);
 s=updateLedgerPage(s,{type:'accept'},context(frame(101),{holding:true}));assert.deepEqual(hashes(s),[h(101),h(100)]);assert.equal(s.visible.items[1].method,'swap');
});
test('a witnessed orphan disappears even during reading and an old index response cannot resurrect it',()=>{
 let s=updateLedgerPage(emptyLedgerPage(address),{type:'indexed',page:{items:[tx(100),tx(90)]}},context(frame(100)));
 const replacement={...frame(100,[]),block:{height:100,hash:h(200)},blocks:[{height:100,hash:h(200),transaction_hashes:[]}]};
 s=updateLedgerPage(s,{type:'stream'},context(replacement,{holding:true}));assert.deepEqual(hashes(s),[h(90)]);
 s=updateLedgerPage(s,{type:'indexed',page:{items:[tx(100),tx(90)]}},context(frame(140,[])));assert.deepEqual(hashes(s),[h(90)]);
 s=updateLedgerPage(s,{type:'stream'},context(frame(141,[tx(141,100)])));assert.equal(s.visible.items[0].hash,h(100));assert.equal(s.visible.items[0].block_number,141);
});
test('a new address scope discards all retained rows and replacement observations',()=>{
 let s=updateLedgerPage(emptyLedgerPage(address),{type:'stream'},context(frame(100)));
 s=updateLedgerPage(s,{type:'start'},context(frame(101),{key:other}));assert.equal(s.visible,undefined);assert.equal(s.observed,undefined);
});
test('observed cache is bounded without truncating an indexed pagination boundary',()=>{
 let s=emptyLedgerPage(address);for(let n=1;n<=510;n++)s=updateLedgerPage(s,{type:'stream'},context(frame(n)));
 assert.equal(s.observed.length,500);assert.equal(s.visible.items.length,500);
 s=updateLedgerPage(s,{type:'indexed',page:{items:[tx(1)],next_page_params:{block_number:1,index:0}}},context(frame(511)));
 assert.equal(s.visible.items.length,501);assert.equal(s.visible.items.at(-1).hash,h(1));
});
test('index catch-up releases redundant observed rows into the actual history cursor',()=>{
 let s=emptyLedgerPage(address);for(let n=1;n<=100;n++)s=updateLedgerPage(s,{type:'stream'},context(frame(n)));
 assert.equal(s.visible.items.length,100);
 s=updateLedgerPage(s,{type:'indexed',page:{items:Array.from({length:20},(_,i)=>tx(100-i)),next_page_params:{block_number:81,index:0}}},context(frame(101)));
 assert.equal(s.observed.length,21);assert.equal(s.visible.items.length,21);assert.equal(s.visible.next_page_params.block_number,81);
});
