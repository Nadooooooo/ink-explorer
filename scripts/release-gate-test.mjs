import assert from'node:assert/strict';import{test}from'node:test';import{mkdtemp,mkdir,writeFile,readFile,rm}from'node:fs/promises';import{tmpdir}from'node:os';import path from'node:path';
import{prepareRelease,verifyLocalManifest}from'./release-artifacts.mjs';import{verifyRelease}from'./release-gate.mjs';
async function build(root,name,assets){const dir=path.join(root,name);await mkdir(path.join(dir,'assets'),{recursive:true});await writeFile(path.join(dir,'index.html'),name);for(const[file,value]of Object.entries(assets))await writeFile(path.join(dir,'assets',file),value);return dir;}
test('retain immutable assets for 24 hours, preserve their original expiration, never retain old mutable API files',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'ink-retention-')),now=Date.parse('2026-10-23T00:00:00Z');
 try{
  const first=await build(root,'first',{'old-a1.js':'old','openapi.json':'obsolete'}),second=await build(root,'second',{'current-b2.js':'new'});
  const m=await prepareRelease(second,first,now);assert.deepEqual(Object.keys(m.retained),['assets/old-a1.js']);assert.equal(m.retained['assets/old-a1.js'].expiresAt,'2026-10-24T00:00:00.000Z');await verifyLocalManifest(second,m);
  const third=await build(root,'third',{'next-c3.js':'next'}),m3=await prepareRelease(third,second,now+3600000);assert.equal(m3.retained['assets/old-a1.js'].expiresAt,m.retained['assets/old-a1.js'].expiresAt);assert.equal(m3.retained['assets/current-b2.js'].expiresAt,'2026-10-24T01:00:00.000Z');
  const fourth=await build(root,'fourth',{'latest-d4.js':'latest'}),m4=await prepareRelease(fourth,third,now+26*3600000);assert.deepEqual(Object.keys(m4.retained),['assets/next-c3.js']);
  await writeFile(path.join(fourth,'assets/latest-d4.js'),'changed');await assert.rejects(verifyLocalManifest(fourth,m4),/Changed artifact/);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('immutable collisions and damaged previous release manifests stop preparation',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'ink-collision-'));
 try{const old=await build(root,'old',{'same-a1.js':'old'}),current=await build(root,'new',{'same-a1.js':'different'});await assert.rejects(prepareRelease(current,old),/Immutable URL reused/);const next=await build(root,'next',{'new-b1.js':'new'});await prepareRelease(next,old);await rm(path.join(next,'assets/same-a1.js'));const last=await build(root,'last',{});await assert.rejects(prepareRelease(last,next),/Build changed/);}finally{await rm(root,{recursive:true,force:true});}
});
test('release gate rejects missing dependencies, altered bytes and ignored version overrides',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'ink-gate-'));
 try{
  const old=await build(root,'old',{'old-a1.js':'old'}),dist=await build(root,'new',{'entry-b2.js':'entry','lazy-c3.js':'deferred'});await mkdir(path.join(dist,'snapshots'));
  for(const net of['mainnet','sepolia'])for(const lang of['en','fr','es','pt','ar','ru','hi','bn','zh','ja'])await writeFile(path.join(dist,`snapshots/home-${net}-${lang}.html`),`<main>${net} ${lang}</main>`);
  await prepareRelease(dist,old);let mode='ok';
  const fetcher=async(url,options)=>{
   assert.equal(options.headers['Cloudflare-Workers-Version-Overrides'],'inkexplorer="test-version"');
   if(url.pathname.startsWith('/assets/')){if(mode==='missing'&&url.pathname.endsWith('lazy-c3.js'))return new Response('Missing',{status:404});const bytes=await readFile(path.join(dist,url.pathname));return new Response(mode==='wrong-bytes'&&url.pathname.endsWith('entry-b2.js')?'wrong':bytes);}
   const net=url.pathname.startsWith('/testnet')?'sepolia':'mainnet',lang=url.searchParams.get('lang');return new Response(`<html><main>${net} ${lang}</main></html>`,{headers:{'x-ink-version':mode==='old-version'?'previous':'test-version','content-security-policy':"default-src 'self'"}});
  };
  const options={origin:'https://example.invalid',dist,version:'test-version',override:true,fetcher};let report=await verifyRelease(options);assert.equal(report.passed,true);assert.equal(report.checks.length,23);
  for(mode of['missing','wrong-bytes','old-version']){report=await verifyRelease(options);assert.equal(report.passed,false,mode);assert(report.checks.some(c=>!c.passed));}
 }finally{await rm(root,{recursive:true,force:true});}
});
