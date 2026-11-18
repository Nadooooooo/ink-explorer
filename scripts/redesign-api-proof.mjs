import assert from'node:assert/strict';import{mkdir,writeFile}from'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4310',results=[];
const get=async(path)=>{const response=await fetch(base+path,{signal:AbortSignal.timeout(75000)});return {status:response.status,body:await response.json()};};
for(const prefix of ['', '/testnet']){
 for(const query of ['unknown=1','methods=bad','status=invalid','cursor=not-a-valid-cursor']){const r=await get(prefix+'/api/v1/transactions?'+query);assert.equal(r.status,400);}
 const r=await get(prefix+'/api/v1/transactions');assert.equal(r.status,200);assert.ok(r.body.items.length);assert.equal(r.body.meta.chainId,prefix?763373:57073);assert.equal(new Set(r.body.items.map(row=>row.hash)).size,r.body.items.length);
 assert.ok(r.body.items.every(row=>row.internal_transaction_index==null&&row.token_transfer_index==null));
 if(r.body.next_page_params){const next=await get(prefix+'/api/v1/transactions?'+new URLSearchParams(r.body.next_page_params));assert.equal(next.status,200);assert.ok(!next.body.items.some(row=>r.body.items.some(before=>before.hash===row.hash)));}
 const sample=r.body.items[0];
 const filtered=await get(prefix+'/api/v1/transactions?'+new URLSearchParams({from_address_hashes_to_include:sample.from.hash,age_from:sample.timestamp}));assert.equal(filtered.status,200);assert.ok(filtered.body.items.every(row=>row.from.hash.toLowerCase()===sample.from.hash.toLowerCase()&&Date.parse(row.timestamp)>=Date.parse(sample.timestamp)));
 const transfers=await get(prefix+'/api/explorer/advanced-filters?transaction_types=ERC-20,ERC-721,ERC-1155');assert.equal(transfers.status,200);assert.ok(transfers.body.items.every(row=>/^ERC-/.test(row.token?.type)));
 const snapshots=await get(prefix+'/api/live/snapshot');assert.equal(snapshots.status,200);const b=snapshots.body;assert.equal(b.network.chainId,prefix?763373:57073);assert.equal(b.blocks.length,30);const used=b.blocks.reduce((s,row)=>s+BigInt(row.gas_used),0n),limit=b.blocks.reduce((s,row)=>s+BigInt(row.gas_limit),0n);assert.equal(b.utilization.percentage,Number(used*100000000n/limit)/1e6);
 results.push({network:prefix?'sepolia':'mainnet',chainId:b.network.chainId,transactions:r.body.items.length,filtered:filtered.body.items.length,tokenTransfers:transfers.body.items.length,transport:b.network.liveTransport,window:b.utilization.blocks,utilization:b.utilization.percentage,passed:true});console.log(JSON.stringify(results.at(-1)));
}
await mkdir('reports/redesign/api',{recursive:true});await writeFile('reports/redesign/api/results.json',JSON.stringify({at:new Date().toISOString(),passed:true,results},null,2));
