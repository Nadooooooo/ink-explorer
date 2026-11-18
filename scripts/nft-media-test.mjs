import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Interface} from 'ethers';
import {createMediaCache,createPublicResourceReader,resourceCandidates,safeSvg} from '../server/media-cache.mjs';
import {createNftMetadataReader} from '../server/nft-metadata.mjs';

const resolve=async()=>[{address:'1.1.1.1',family:4}],types=new Set(['image/png']);
test('IPFS scheme, path and subdomain use independent gateways',()=>{
  for(const url of ['ipfs://bafytest/art.png','https://dweb.link/ipfs/bafytest/art.png','https://bafytest.ipfs.w3s.link/art.png'])
    assert(resourceCandidates(url).includes('https://gateway.pinata.cloud/ipfs/bafytest/art.png'));
  assert.throws(()=>resourceCandidates('http://127.0.0.1/secret'));
});
test('a stalled gateway does not delay a successful alternative; losers are cancelled',async()=>{
  let aborted=false;
  const read=createPublicResourceReader({resolve,timeout:500,fetcher:async(url,{signal})=>{
    if(url.hostname==='gateway.pinata.cloud')return new Promise((_,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(Error('cancelled'));},{once:true}));
    return new Response('png',{headers:{'content-type':'image/png'}});
  }});
  const start=Date.now(),media=await read('ipfs://bafytest/file',{types,maxBytes:100});
  assert.equal(media.body.toString(),'png');assert(Date.now()-start<450);assert(aborted);
});
test('private DNS, rebinding through redirects, SVG scripts and oversized streamed bodies are rejected',async()=>{
  const read=createPublicResourceReader({resolve:async host=>[{address:host==='private.example'?'127.0.0.1':'1.1.1.1',family:4}],fetcher:async()=>new Response(null,{status:302,headers:{location:'https://private.example/secret'}})});
  await assert.rejects(read('https://public.example/file',{types,maxBytes:100}));
  let called=false;const blocked=createPublicResourceReader({resolve:async()=>[{address:'::ffff:127.0.0.1',family:6}],fetcher:async()=>{called=true;}});
  await assert.rejects(blocked('https://private.example/file',{types,maxBytes:100}));assert.equal(called,false);
  assert.throws(()=>safeSvg(Buffer.from('<svg onload="alert(1)"></svg>')));
  const oversized=createPublicResourceReader({resolve,fetcher:async()=>new Response('1234567890',{headers:{'content-type':'image/png'}})});
  await assert.rejects(oversized('https://public.example/file',{types,maxBytes:5}));
});
test('metadata reads have a deadline even if DNS stalls',async()=>{
  const read=createPublicResourceReader({resolve:()=>new Promise(()=>{}),timeout:20});
  await assert.rejects(read('https://public.example/file',{types,maxBytes:100}),/timeout/);
});
test('large GIF/video cards are compact, coalesced and reusable from disk without the origin',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'ink-media-'));let reads=0,transforms=0;
  try {
    const load=createMediaCache({cacheDir:dir,readResource:async(_url,options)=>{
      reads++;assert(options.types.has('video/mp4'));assert(options.maxBytes('image/gif')>8415004);assert(options.maxBytes('video/mp4')>38629263);
      await new Promise(resolve=>setTimeout(resolve,10));return {body:Buffer.from('large original'),type:'video/mp4'};
    },thumbnail:async()=>{transforms++;return Buffer.from('small frame');}});
    const results=await Promise.all(Array.from({length:5},()=>load('https://public.example/video','thumbnail')));
    assert.equal(reads,1);assert.equal(transforms,1);assert(results.every(r=>r.type==='image/webp'&&r.body.toString()==='small frame'));
    const offline=createMediaCache({cacheDir:dir,readResource:async()=>{throw Error('offline');}});
    assert.equal((await offline('https://public.example/video','thumbnail')).cached,true);
    await writeFile(path.join(dir,'irrelevant'),'');
  } finally {await rm(dir,{recursive:true,force:true});}
});
test('metadata recovery uses the exact ERC-721/1155 token URI and leaves ownership outside its result',async()=>{
  const abi=new Interface(['function tokenURI(uint256) view returns (string)','function uri(uint256) view returns (string)']);
  let calls=0;
  const reader=createNftMetadataReader({rpc:async(method,[call])=>{
    calls++;assert.equal(method,'eth_call');const parsed=abi.parseTransaction(call);assert.equal(parsed.args[0],1222n);
    return abi.encodeFunctionResult(parsed.name,[parsed.name==='uri'?'ipfs://bafytest/{id}.json':'data:application/json;base64,'+Buffer.from(JSON.stringify({image:'ipfs://bafytest/1222.png',name:'Shellies #1222',owner:'untrusted'})).toString('base64')]);
  },readResource:async url=>{assert(url.endsWith('4c6.json'));return{body:Buffer.from('{"image":"ipfs://bafytest/card.png"}')};}});
  const result=await reader('0x'+'1'.repeat(40),'1222','ERC-721');assert.equal(result.image_url,'ipfs://bafytest/1222.png');assert.equal(result.owner,undefined);
  await reader('0x'+'1'.repeat(40),'1222','ERC-721');assert.equal(calls,1);
  assert.equal((await reader('0x'+'2'.repeat(40),'1222','ERC-1155')).image_url,'ipfs://bafytest/card.png');
  await assert.rejects(reader('0x'+'1'.repeat(40),(2n**256n).toString(),'ERC-721'));
});
