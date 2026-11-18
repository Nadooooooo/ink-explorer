import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

const moduleUrl=new URL('../server/media-cache.mjs',import.meta.url).href;
function strictRead(scenario,value='https://public.example/art') {
  const code=`
    import {createPublicResourceReader} from ${JSON.stringify(moduleUrl)};
    const scenario=${JSON.stringify(scenario)},value=${JSON.stringify(value)};
    let resolves=0,fetches=0,result;
    const read=createPublicResourceReader({timeout:40,
      resolve:async()=>{
        resolves++;
        if(scenario==='dns-error')throw Error('Controlled DNS failure');
        if(scenario==='dns-stall')return new Promise(()=>{});
        return [{address:scenario==='private'?'127.0.0.1':'1.1.1.1',family:4}];
      },
      fetcher:async()=>{fetches++;return new Response('pixels',{headers:{'content-type':'image/png'}});},
    });
    try {const media=await read(value,{types:new Set(['image/png']),maxBytes:100});result={rejected:false,body:media.body.toString()};}
    catch(error){result={rejected:true,error:error.message};}
    // A caught request error must not leave an orphan rejection at end of turn.
    await new Promise(resolve=>setImmediate(resolve));
    await new Promise(resolve=>setImmediate(resolve));
    console.log(JSON.stringify({...result,resolves,fetches,alive:true}));
  `;
  const child=spawnSync(process.execPath,['--unhandled-rejections=strict','--input-type=module','--eval',code],
    {encoding:'utf8',timeout:5000});
  assert.equal(child.error,undefined,child.error?.message);
  assert.equal(child.status,0,`A handled media request terminated Node:\n${child.stderr}`);
  const result=JSON.parse(child.stdout.trim());assert.equal(result.alive,true);
  return result;
}

for(const [name,value] of [
  ['empty URL',''],['malformed URL','not a URL'],['non-string URL',{}],
  ['HTTP URL','http://public.example/art'],['unsupported data URI','data:image/png;base64,eA=='],
  ['embedded credentials','https://user:example@public.example/art'],
])test(`${name} rejects without an unhandled deadline or network read`,()=>{
  const result=strictRead('invalid',value);
  assert.equal(result.rejected,true);assert.equal(result.resolves,0);assert.equal(result.fetches,0);
});

test('private DNS and DNS failures reject without terminating Node',()=>{
  for(const scenario of ['private','dns-error']){
    const result=strictRead(scenario);assert.equal(result.rejected,true);
    assert.equal(result.resolves,1);assert.equal(result.fetches,0);
  }
});
test('a stalled resolver retains its deadline without an orphan rejection',()=>{
  const result=strictRead('dns-stall');assert.equal(result.rejected,true);
  assert.equal(result.error,'Media timeout');assert.equal(result.resolves,1);assert.equal(result.fetches,0);
});
test('successful public media reads remain successful under strict rejection handling',()=>{
  const result=strictRead('success');assert.equal(result.rejected,false);
  assert.equal(result.body,'pixels');assert.equal(result.resolves,1);assert.equal(result.fetches,1);
});
