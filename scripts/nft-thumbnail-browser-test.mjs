import assert from 'node:assert/strict';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium,firefox,webkit} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';

// Mount the real transfer thumbnail with incomplete indexer records. These
// responses deliberately differ from the complete inventory used by live tests.
const output=process.env.NFT_THUMBNAIL_OUTPUT||'reports/nft-thumbnails';
const html=`<!doctype html><html><head></head><body><div id="root"></div><script type="module">
import React from 'react';
import {createRoot} from 'react-dom/client';
const {NftThumbnail}=await import('/src/NftThumbnail.tsx');
const root=createRoot(document.getElementById('root'));
window.reads=[];
const get=async path=>{window.reads.push(path);return window.instance;};
window.renderFixture=props=>root.render(React.createElement(NftThumbnail,{...props,get}));
</script></body></html>`;
const server=await createServer({configFile:false,cacheDir:output+'/.vite',plugins:[react(),{
  name:'nft-thumbnail-fixture',configureServer(server){server.middlewares.use('/__fixture',async(req,res)=>{
    res.setHeader('content-type','text/html');res.end(await server.transformIndexHtml('/__fixture',html));
  });}
}],server:{host:'127.0.0.1',port:0},optimizeDeps:{include:['react','react-dom/client']}});
await server.listen();
const base=`http://127.0.0.1:${server.httpServer.address().port}`;
await mkdir(output,{recursive:true});
const address='0x'+'1'.repeat(40),other='0x'+'2'.repeat(40);
const image='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><path fill="red" d="M0 0h2v2H0z"/></svg>');
const cases=[
  {name:'partial indexed record recovers artwork',record:{id:'7'},instance:{id:'7',image_url:image},reads:1},
  {name:'recovered identity must match collection',record:{id:'7'},instance:{id:'7',token:{address_hash:other},image_url:image},reads:1,missing:true},
  {name:'supplied identity must match collection',record:{id:'7',token:{address_hash:other},image_url:image},instance:{id:'7',image_url:image},reads:1},
  {name:'metadata image URL is displayed',record:{id:'7',metadata:{image_url:image}},reads:0},
  {name:'media URL is displayed',record:{id:'7',media_url:image},reads:0},
  {name:'animation URL can supply a frame',record:{id:'7',animation_url:image},reads:0},
  {name:'malformed image field does not hide valid fallback',record:{id:'7',image_url:{},metadata:{image:image}},reads:0},
];
const results=[];
try{
  for(const [engine,launcher] of Object.entries({chromium,firefox,webkit})){
    const browser=await launcher.launch(engine==='chromium'?{executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']}:{});
    try{for(const scenario of cases){
      const page=await browser.newPage(),errors=[];page.setDefaultTimeout(5000);page.on('pageerror',e=>errors.push(e.message));
      const result={engine,name:scenario.name,passed:false};
      try{
        await page.goto(base+'/__fixture');await page.waitForFunction(()=>typeof window.renderFixture==='function');
        await page.evaluate(({address,record,instance})=>{window.instance=instance;window.renderFixture({address,id:'7',record});},{address,record:scenario.record,instance:scenario.instance});
        if(scenario.reads)await page.waitForFunction(()=>window.reads.length>0);
        if(scenario.missing){await page.locator('.nft-thumbnail').waitFor();await page.waitForTimeout(100);assert.equal(await page.locator('.nft-thumbnail img').count(),0);}
        else await page.waitForFunction(()=>{const image=document.querySelector('.nft-thumbnail img');return image?.complete&&image.naturalWidth>0;},null,{timeout:2500});
        assert.equal(await page.evaluate(()=>window.reads.length),scenario.reads);
        assert.deepEqual(errors,[]);result.passed=true;
      }catch(error){result.error=error.message;result.errors=errors;}
      finally{await page.close();}
      results.push(result);console.log(JSON.stringify(result));
    }}finally{await browser.close();}
  }
}finally{await server.close();await writeFile(output+'/results.json',JSON.stringify({passed:results.length===21&&results.every(r=>r.passed),results},null,2));}
assert.equal(results.length,21);assert(results.every(r=>r.passed),'NFT thumbnail regressions failed');
