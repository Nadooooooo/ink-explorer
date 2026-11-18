import assert from'node:assert/strict';import{test}from'node:test';import{mkdtemp,mkdir,writeFile,readFile,rm}from'node:fs/promises';import path from'node:path';import{tmpdir}from'node:os';
import{sha256,prepareRelease}from'./release-artifacts.mjs';import{prepareCompatibility}from'./prepare-compatibility.mjs';
test('compatibility release keeps old interface and mutable resources while serving both immutable bundles',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'ink-compatible-'));
 try{
  const previous=path.join(root,'previous'),candidate=path.join(root,'candidate'),output=path.join(root,'compatible');
  for(const dir of['src','cloudflare','server','dist/assets','dist/brand','dist/snapshots'])await mkdir(path.join(previous,dir),{recursive:true});await mkdir(path.join(candidate,'assets'),{recursive:true});await mkdir(path.join(candidate,'brand'));
  const oldFiles={'index.html':'<script src="/assets/old-a1.js"></script>','assets/old-a1.js':'old code','assets/old-b2.css':'old style','brand/logo.svg':'old logo','snapshots/home-mainnet-en.html':'old home'};
  for(const[name,bytes]of Object.entries(oldFiles))await writeFile(path.join(previous,'dist',name),bytes);
  await writeFile(path.join(previous,'dist/release-artifacts.json'),JSON.stringify({schema:1,active:Object.fromEntries(Object.entries(oldFiles).map(([n,b])=>[n,{sha256:sha256(b)}])),retained:{}}));
  await writeFile(path.join(previous,'wrangler.jsonc'),JSON.stringify({name:'inkexplorer',version_metadata:{binding:'DEPLOYMENT'},assets:{directory:'./dist'}}));await writeFile(path.join(previous,'cloudflare/worker.mjs'),'old worker');
  await writeFile(path.join(candidate,'index.html'),'<script src="/assets/new-c3.js"></script>');await writeFile(path.join(candidate,'assets/new-c3.js'),'new code');await writeFile(path.join(candidate,'brand/logo.svg'),'new logo');await prepareRelease(candidate,path.join(previous,'dist'));
  const m=await prepareCompatibility(previous,candidate,output);assert.equal(await readFile(path.join(output,'dist/index.html'),'utf8'),oldFiles['index.html']);assert.equal(await readFile(path.join(output,'dist/brand/logo.svg'),'utf8'),'old logo');assert.equal(await readFile(path.join(output,'cloudflare/worker.mjs'),'utf8'),'old worker');assert.equal(await readFile(path.join(output,'dist/assets/new-c3.js'),'utf8'),'new code');assert(m.active['assets/old-a1.js']);assert(m.active['assets/new-c3.js']);assert.equal(await readFile(path.join(output,'dist/snapshots/home-mainnet-en.html'),'utf8'),'old home');
 }finally{await rm(root,{recursive:true,force:true});}
});
