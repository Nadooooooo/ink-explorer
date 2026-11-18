import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium,firefox,webkit} from 'playwright-core';

// Exercise the real recovery hook and the same React-child name rendering used
// by NftItem. The server can return arbitrary collection-controlled metadata.
const root=resolve(import.meta.dirname,'..');
const output=process.env.NFT_ARTWORK_OUTPUT||resolve(root,'reports/nft-artwork');
const address='0x'+'1'.repeat(40);
const image='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><path fill="red" d="M0 0h2v2H0z"/></svg>');
const html='<!doctype html><html><head></head><body><div id="root"></div><script type="module" src="/__nft-artwork-entry.jsx"></script></body></html>';
const entry=resolve(root,'__nft-artwork-entry.jsx');
const entrySource=`import React from 'react';
import {createRoot} from 'react-dom/client';
import {useNftArtwork} from '/src/useNftArtwork.ts';
const item={id:'7',token:{address_hash:${JSON.stringify(address)}}};
function Fixture(){const {ref,name,source}=useNftArtwork(item);return React.createElement('div',{ref,className:'artwork-frame'},React.createElement('span',{className:'artwork-name'},name||'Collection fallback'),source&&React.createElement('img',{src:source,alt:''}));}
createRoot(document.getElementById('root')).render(React.createElement(Fixture));`;
const server=await createServer({root,configFile:false,cacheDir:resolve(output,'.vite'),plugins:[react(),{
  name:'nft-artwork-component-fixture',
  resolveId(id){if(id==='/__nft-artwork-entry.jsx')return entry;},
  load(id){if(id===entry)return entrySource;},
  configureServer(server){server.middlewares.use(async(req,res,next)=>{
    if(!/^\/(?:testnet\/)?__nft-artwork-fixture(?:\?|$)/.test(req.url||''))return next();
    try{res.setHeader('content-type','text/html');res.end(await server.transformIndexHtml(req.url,html));}
    catch(error){next(error);}
  });},
}],server:{host:'127.0.0.1',port:0}});
const scenarios=[
  {name:'object name falls back safely',metadata:{name:{unexpected:'object'},image},expected:'Collection fallback'},
  {name:'array name falls back safely',metadata:{name:['unexpected'],image},expected:'Collection fallback'},
  {name:'numeric name falls back safely',metadata:{name:123,image},expected:'Collection fallback'},
  {name:'string name is retained',metadata:{name:'Recovered artwork',image},expected:'Recovered artwork'},
  {name:'malformed image field leaves valid metadata image usable',image_url:{},metadata:{name:'Recovered artwork',image},expected:'Recovered artwork'},
];
const rows=[];
await mkdir(output,{recursive:true});
await server.listen();
const base=`http://127.0.0.1:${server.httpServer.address().port}`;
try{
  for(const [engine,launcher]of Object.entries({chromium,firefox,webkit})){
    const browser=await launcher.launch(engine==='chromium'?{executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']}:{});
    try{for(const prefix of ['','/testnet'])for(const scenario of scenarios){
      const page=await browser.newPage(),errors=[],requests=[];
      const row={engine,network:prefix?'sepolia':'mainnet',scenario:scenario.name,passed:false};
      page.setDefaultTimeout(5000);page.on('pageerror',error=>errors.push(error.message));
      await page.route('**/api/explorer/tokens/*/instances/7',async route=>{
        requests.push(new URL(route.request().url()).pathname);
        await route.fulfill({json:{id:'7',token:{address_hash:address},metadata:scenario.metadata,image_url:scenario.image_url}});
      });
      try{
        await page.goto(`${base}${prefix}/__nft-artwork-fixture`);
        await page.waitForFunction(()=>{const image=document.querySelector('.artwork-frame img');return image?.complete&&image.naturalWidth>0;},null,{timeout:2500});
        assert.equal(await page.locator('.artwork-name').innerText(),scenario.expected);
        assert.equal(await page.locator('.artwork-frame img').getAttribute('src'),image);
        assert.deepEqual(requests,[`${prefix}/api/explorer/tokens/${address}/instances/7`]);
        assert.deepEqual(errors,[]);row.passed=true;
      }catch(error){row.error=error.message;row.errors=errors;}
      finally{await page.close();}
      rows.push(row);console.log(JSON.stringify(row));
    }}finally{await browser.close();}
  }
}finally{
  await server.close();
  await writeFile(resolve(output,'results.json'),JSON.stringify({complete:true,passed:rows.length===30&&rows.every(row=>row.passed),
    sourceSha256:createHash('sha256').update(await readFile(resolve(root,'src/useNftArtwork.ts'))).digest('hex'),rows},null,2));
}
assert.equal(rows.length,30);assert(rows.every(row=>row.passed),'NFT recovered artwork regressions failed');
