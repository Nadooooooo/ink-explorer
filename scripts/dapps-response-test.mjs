import assert from 'node:assert/strict';
import {test} from 'node:test';
import {gzipSync} from 'node:zlib';
import {dappsResponse} from '../server/dapps-response.mjs';

const full=Array.from({length:120},(_,index)=>({
  id:`app-${index}`,title:`Application ${index}`,shortDescription:`Summary ${index}`,
  categories:['DeFi','Tools'],url:`https://app-${index}.example.invalid/`,
  description:`Full documentation for application ${index}. `.repeat(80),
  author:`Author ${index}`,rating:4,ratingsTotalCount:index,
  logo:`https://media.example.invalid/app-${index}.png`,
}));

test('list projection preserves every catalogue field, row order and Open app destination',()=>{
  const list=dappsResponse(full,'list');
  assert.equal(list.length,full.length);
  for(const [index,item]of list.entries()){
    assert.deepEqual(item,{id:`app-${index}`,title:`Application ${index}`,shortDescription:`Summary ${index}`,categories:['DeFi','Tools'],url:`https://app-${index}.example.invalid/`});
    assert.equal(encodeURIComponent(item.id),encodeURIComponent(full[index].id));
    assert.equal(item.categories.join(' · '),full[index].categories.join(' · '));
  }
  const original=JSON.stringify(full),projected=JSON.stringify(list);
  assert(Buffer.byteLength(projected)<Buffer.byteLength(original));
  assert(gzipSync(projected).length<gzipSync(original).length,'Projection also reduces transferred gzip bytes');
});

test('default and detail API responses retain complete original objects without mutation',()=>{
  const before=JSON.stringify(full);dappsResponse(full,'list');
  for(const view of [null,undefined,'detail','unknown']){
    assert.equal(dappsResponse(full,view),full);
    assert.equal(dappsResponse(full,view)[0].description,full[0].description);
    assert.equal(dappsResponse(full,view)[0].author,full[0].author);
  }
  assert.equal(JSON.stringify(full),before);
});

test('empty, missing and invalid upstream responses retain their existing meaning',()=>{
  assert.deepEqual(dappsResponse([],'list'),[]);
  assert.deepEqual(dappsResponse([{id:'minimal',title:'Minimal'}],'list'),[{id:'minimal',title:'Minimal'}]);
  for(const value of [null,'invalid',123,{error:'Directory offline'},{items:[]},[null,'invalid',[]]]){
    assert.deepEqual(dappsResponse(value,'list'),value);
  }
});
