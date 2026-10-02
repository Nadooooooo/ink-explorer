import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BASE_URL || 'http://127.0.0.1:4188';
const results=[];
async function read(prefix,query) {
  const started=Date.now();
  const r=await fetch(`${base}${prefix}/api/explorer/advanced-filters?${query}`,{signal:AbortSignal.timeout(75000)});
  assert.equal(r.status,200,`${prefix}: advanced filters`);
  const data=await r.json();assert.ok(Array.isArray(data.items));
  results.push({prefix,query:String(query),items:data.items.length,milliseconds:Date.now()-started});
  return data;
}
function checkAmounts(items) {
  for(const item of items) {
    assert.equal(item.type,'ERC-20');
    const decimals=Number(item.total?.decimals ?? item.token?.decimals);
    assert.ok(Number.isInteger(decimals)&&decimals>=0&&decimals<=255);
    // Compare normalized amount >= 0.01 without rounding through Number.
    assert.ok(BigInt(item.total.value)*100n >= 10n**BigInt(decimals),item.hash);
  }
}
for(const prefix of ['', '/testnet']) {
  const initial=await read(prefix,'');assert.ok(initial.items.length>0);
  const query=new URLSearchParams({transaction_types:'ERC-20',amount_from:'0.01'});
  const page=await read(prefix,query);assert.ok(page.items.length>0);checkAmounts(page.items);
  assert.ok(page.next_page_params,'Live fixture must exercise a cursor');
  for(const [key,value] of Object.entries(page.next_page_params))query.set(key,value==null?'null':String(value));
  const next=await read(prefix,query);checkAmounts(next.items);
  const key=item=>[item.hash,item.token_transfer_index,item.token_transfer_batch_index].join(':');
  assert.ok(!next.items.some(item=>page.items.some(first=>key(first)===key(item))),'Cursor repeats previous page');
}
await mkdir('reports/activity-live',{recursive:true});
await writeFile('reports/activity-live/results.json',JSON.stringify({recordedAt:new Date().toISOString(),results},null,2));
console.log('Live advanced filters passed on Mainnet and Sepolia: decimal units and retained-filter cursor pages.');
