import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium,firefox,webkit} from 'playwright';

const root=resolve(import.meta.dirname,'..');
const output=process.env.NFT_DETAIL_MEDIA_OUTPUT||resolve(root,'reports/nft-detail-media');
const png=await readFile(resolve(root,'public/brand/ink-symbol.png'));
const rows=[],errors=[];
const labels={loadingMedia:'Chargement du média',mediaUnavailable:'Média indisponible'};
const fixture=`<!doctype html><html lang="fr"><head><meta charset="utf-8"></head><body><div id="fixture"></div><script type="module" src="/__nft-media-entry.jsx"></script></body></html>`;
const entry=resolve(root,'__nft-media-entry.jsx');
const entrySource=`import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {NftMedia} from '/src/NftMedia.tsx';
const labels=${JSON.stringify(labels)};
function Fixture(){const [source,setSource]=useState(new URL(location.href).searchParams.get('source')||undefined);window.setArtwork=value=>flushSync(()=>setSource(value));return React.createElement(NftMedia,{source,name:'Artwork test',t:key=>labels[key]||key});}
createRoot(document.getElementById('fixture')).render(React.createElement(Fixture));`;
const server=await createServer({root,configFile:false,cacheDir:resolve(output,'.vite'),plugins:[react(),{
  name:'nft-media-component-fixture',
  resolveId(id){if(id==='/__nft-media-entry.jsx')return entry;},
  load(id){if(id===entry)return entrySource;},
  configureServer(server){server.middlewares.use(async(req,res,next)=>{
    if(!/^\/(?:testnet\/)?__nft-media-fixture(?:\?|$)/.test(req.url||''))return next();
    try {res.setHeader('content-type','text/html');res.end(await server.transformIndexHtml(req.url,fixture));}
    catch(error){next(error);}
  });},
}],server:{host:'127.0.0.1',port:0}});
await mkdir(output,{recursive:true});
await server.listen();
const base=`http://127.0.0.1:${server.httpServer.address().port}`;
const deferred=()=>{let release;const promise=new Promise(resolve=>release=resolve);return{promise,release};};
const mediaState=page=>page.evaluate(()=>({html:document.querySelector('.nft-media')?.outerHTML,
  images:[...document.querySelectorAll('.nft-media img')].map(image=>({src:image.src,complete:image.complete,width:image.naturalWidth}))}));
const save=async complete=>writeFile(resolve(output,'results.json'),JSON.stringify({at:new Date().toISOString(),complete,
  passed:complete&&rows.length===66&&rows.every(row=>row.passed),scope:'Real isolated NftMedia component, controlled media HTTP responses; no public deployment or physical-device claim.',
  sourceSha256:createHash('sha256').update(await readFile(resolve(root,'src/NftMedia.tsx'))).digest('hex'),rows},null,2));
const cases=['preview-failure-video','preview-failure-image','info-failure-image','original-failure','preview-handoff','original-failure-preview','video-failure-preview','video-failure-no-preview','source-change-pending','source-change-video','missing-source'];
try {
  for(const [engine,launcher]of Object.entries({chromium,firefox,webkit})){
    const browser=await launcher.launch(engine==='chromium'?{args:['--no-sandbox']}:{});
    try {for(const prefix of ['','/testnet'])for(const scenario of cases){
      const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
      const row={engine,network:prefix?'sepolia':'mainnet',scenario,passed:false},runtime=[],failedRequests=[];
      const first='https://art.example/first',second='https://art.example/second';
      const infoFirst=deferred(),infoSecond=deferred(),thumbSecond=deferred(),originalFirst=deferred(),requests=[];
      page.on('pageerror',error=>runtime.push(error.message));
      page.on('requestfailed',request=>failedRequests.push({url:request.url(),error:request.failure()?.errorText}));
      await context.route('**/api/media?*',async route=>{
        const url=new URL(route.request().url()),kind=url.searchParams.get('kind')||'original',source=url.searchParams.get('url');
        requests.push({kind,source,path:url.pathname});
        try {
          if(kind==='info'){
            if(source===second)await infoSecond.promise;
            else if(scenario!=='info-failure-image')await infoFirst.promise;
            return await route.fulfill(scenario==='info-failure-image'?{status:500,json:{error:'Controlled inspection failure'}}:
              {json:{type:source===first&&['preview-failure-video','video-failure-preview','video-failure-no-preview','source-change-pending','source-change-video'].includes(scenario)?'video/mp4':'image/png'}});
          }
          if(kind==='thumbnail'&&source===second)await thumbSecond.promise;
          if(kind==='original'&&['preview-handoff','original-failure-preview'].includes(scenario))await originalFirst.promise;
          const fail=kind==='thumbnail'&&!['preview-handoff','original-failure-preview','video-failure-preview','source-change-pending','source-change-video'].includes(scenario)||
            kind==='original'&&['original-failure','original-failure-preview','video-failure-preview','video-failure-no-preview'].includes(scenario);
          await route.fulfill(fail?{status:500,body:'Controlled artwork failure'}:{contentType:'image/png',body:png});
        } catch(error){if(!page.isClosed()&&!/already handled|Target closed|has been closed|Invalid InterceptionId/i.test(String(error)))errors.push(String(error));}
      });
      try {
        const source=scenario==='missing-source'?'':first;
        await page.goto(`${base}${prefix}/__nft-media-fixture?source=${encodeURIComponent(source)}`,{waitUntil:'domcontentloaded'});
        const media=page.locator('.nft-media');await media.waitFor();
        if(scenario==='missing-source'){
          await page.waitForFunction(()=>document.querySelector('.nft-media')?.textContent==='Média indisponible');
          assert.equal(await media.getAttribute('aria-busy'),'false');assert.equal(requests.length,0);
        }else if(scenario==='preview-handoff'||scenario==='original-failure-preview'){
          await page.waitForFunction(()=>document.querySelector('.nft-media-preview')?.classList.contains('is-ready'));
          infoFirst.release();await media.locator('.nft-media-original').waitFor({state:'attached'});
          assert(await media.locator('.nft-media-preview').evaluate(image=>image.classList.contains('is-ready')),'The loaded preview stays visible until the original image loads');
          assert.equal(await media.locator('.nft-placeholder').count(),0,'Inspection must not flash a loading placeholder over a successful preview');
          assert.equal(await media.getAttribute('aria-busy'),'false');
          originalFirst.release();
          if(scenario==='original-failure-preview'){
            await media.locator('.nft-media-original').waitFor({state:'detached'});
            const preview=media.locator('.nft-media-preview');assert(await preview.evaluate(image=>image.complete&&image.naturalWidth>0&&image.classList.contains('is-ready')));
            assert.equal(await preview.getAttribute('alt'),'Artwork test');assert.notEqual(await preview.getAttribute('aria-hidden'),'true');
            assert.equal(await media.locator('.nft-placeholder').count(),0);assert.equal(await media.getAttribute('aria-busy'),'false');
          }else{
            await page.waitForFunction(()=>document.querySelector('.nft-media-original')?.classList.contains('is-ready'));
            assert.equal(await media.locator('.nft-media-preview').count(),0);
          }
        }else if(scenario==='video-failure-preview'||scenario==='video-failure-no-preview'){
          if(scenario==='video-failure-preview')await page.waitForFunction(()=>document.querySelector('.nft-media-preview')?.classList.contains('is-ready'));
          else await media.locator('img').waitFor({state:'detached'});
          infoFirst.release();const video=media.locator('video');await video.waitFor();
          await video.evaluate(video=>{video.muted=true;void video.play().catch(()=>{});});
          await video.waitFor({state:'detached'});
          if(scenario==='video-failure-preview'){
            const preview=media.locator('.nft-media-preview');await page.waitForFunction(()=>document.querySelector('.nft-media-preview')?.classList.contains('is-ready'));
            assert.equal(await preview.getAttribute('alt'),'Artwork test');assert.notEqual(await preview.getAttribute('aria-hidden'),'true');
            assert.equal(await media.locator('.nft-placeholder').count(),0);
          }else assert.equal(await media.innerText(),labels.mediaUnavailable);
          assert.equal(await media.getAttribute('aria-busy'),'false');
        }else if(scenario==='source-change-pending'||scenario==='source-change-video'){
          if(scenario==='source-change-video'){
            infoFirst.release();await media.locator('video').waitFor();assert.equal(await media.getAttribute('aria-busy'),'false');
          }else await page.waitForFunction(()=>document.querySelector('.nft-media img')?.classList.contains('is-ready'));
          const transition=await page.evaluate(source=>{
            window.setArtwork(source);
            const media=document.querySelector('.nft-media'),image=media.querySelector('img');
            return {video:!!media.querySelector('video'),source:image?.getAttribute('src'),className:image?.className,busy:media.getAttribute('aria-busy')};
          },second);
          assert.equal(transition.video,false,'Previous video must disappear with its source');
          assert.equal(new URL(transition.source,base).searchParams.get('url'),second);
          assert.equal(transition.className.includes('is-ready'),false,'Previous loaded state must not apply to the new image');
          assert.equal(transition.busy,'true');
          infoFirst.release();thumbSecond.release();
          await page.waitForFunction(()=>document.querySelector('.nft-media img')?.classList.contains('is-ready'));
          assert.equal(await media.locator('video').count(),0,'Late old inspection must not change the new media type');
          infoSecond.release();
          await page.waitForFunction(source=>{const image=document.querySelector('.nft-media img');return image?.complete&&image.naturalWidth>0&&new URL(image.src).searchParams.get('url')===source&&!new URL(image.src).searchParams.has('kind');},second);
          assert.equal(await media.getAttribute('aria-busy'),'false');
        }else{
          if(scenario!=='info-failure-image'){
            await media.locator('img').waitFor({state:'detached'});
            assert.equal(await media.innerText(),labels.loadingMedia,'A preview failure must await original identification');
            infoFirst.release();
          }
          if(scenario==='preview-failure-video'){
            const video=media.locator('video');await video.waitFor();
            assert.equal(await video.getAttribute('preload'),'none');assert.equal(await video.getAttribute('controls'),'');
            assert.equal(new URL(await video.getAttribute('src'),base).searchParams.get('url'),first);
            assert.equal(new URL(await video.getAttribute('src'),base).searchParams.has('kind'),false);
            assert.equal(await media.getAttribute('aria-busy'),'false','An idle playable video must not remain busy');
            assert.equal(await media.locator('.nft-placeholder').count(),0);
          }else if(scenario==='original-failure'){
            await page.waitForFunction(()=>document.querySelector('.nft-media')?.textContent==='Média indisponible');
            assert.equal(await media.getAttribute('aria-busy'),'false');assert.equal(await media.locator('img,video').count(),0);
          }else{
            await page.waitForFunction(()=>{const image=document.querySelector('.nft-media img');return image?.complete&&image.naturalWidth>0&&!new URL(image.src).searchParams.has('kind');});
            assert.equal(await media.getAttribute('aria-busy'),'false');assert.equal(await media.locator('.nft-placeholder').count(),0);
          }
        }
        assert.deepEqual(runtime,[]);assert(requests.every(request=>request.path===`${prefix}/api/media`));row.passed=true;
      }catch(error){
        row.error=error.stack;row.requests=requests;row.failedRequests=failedRequests;row.runtime=runtime;
        row.dom=await mediaState(page).catch(()=>null);
        await page.screenshot({path:resolve(output,`${engine}-${row.network}-${scenario}.png`)}).catch(()=>{});
      }
      finally {infoFirst.release();infoSecond.release();thumbSecond.release();originalFirst.release();await context.close();}
      rows.push(row);console.log(`${row.passed?'PASS':'FAIL'} ${engine} ${row.network} ${scenario}`);await save(false);
    }}finally{await browser.close();}
  }
}finally{await server.close();await save(true);}
assert.deepEqual(errors,[]);assert.equal(rows.length,66);assert(rows.every(row=>row.passed),JSON.stringify(rows.filter(row=>!row.passed),null,2));
