import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir}from'node:fs/promises';
import path from'node:path';
import {sha256,verifyLocalManifest}from'./release-artifacts.mjs';
export async function verifyRelease({origin,dist,version,override=false,fetcher=fetch,concurrency=4}){
 const manifest=JSON.parse(await readFile(path.join(dist,'release-artifacts.json'),'utf8'));await verifyLocalManifest(dist,manifest);
 const headers=override?{'Cloudflare-Workers-Version-Overrides':`inkexplorer="${version}"`}:{};
 const tasks=[];
 const get=async route=>{const r=await fetcher(new URL(route,origin),{headers,redirect:'error',signal:AbortSignal.timeout(15000)});const body=Buffer.from(await r.arrayBuffer());assert.equal(r.status,200,`${route}: HTTP ${r.status}`);return{r,body};};
 for(const name of Object.keys({...manifest.active,...manifest.retained}).filter(name=>/^(assets\/|brand\/|licenses\/|theme\.js$|manifest\.webmanifest$|favicon\.ico$)/.test(name)))tasks.push({name:'asset /'+name,run:async()=>{const{r,body}=await get('/'+name);assert.equal(sha256(body),manifest.active[name]?.sha256||manifest.retained[name].sha256,'Published bytes differ');return{bytes:body.length,ray:r.headers.get('cf-ray')};}});
 for(const network of['mainnet','sepolia'])for(const language of['en','fr','es','pt','ar','ru','hi','bn','zh','ja']){
  const route=(network==='sepolia'?'/testnet':'')+'/?lang='+language;
  tasks.push({name:'home '+route,run:async()=>{const{r,body}=await get(route),html=body.toString();assert.equal(r.headers.get('x-ink-version'),version,'Version override or propagation not applied');const snapshot=await readFile(path.join(dist,`snapshots/home-${network}-${language}.html`),'utf8');assert(html.includes(snapshot),'Wrong home snapshot');assert(r.headers.get('content-security-policy'),'Document CSP missing');return{version,ray:r.headers.get('cf-ray')};}});
 }
 let pages=[];
 try{pages=JSON.parse(await readFile(path.join(dist,'snapshots/pages-manifest.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
 for(const page of pages){
  const route=(page.network==='sepolia'?'/testnet':'')+page.route+'?lang='+page.language;
  tasks.push({name:'page '+route,run:async()=>{const{r,body}=await get(route),html=body.toString();assert.equal(r.headers.get('x-ink-version'),version,'Version override or propagation not applied');const snapshot=JSON.parse(await readFile(path.join(dist,page.path),'utf8'));assert(html.includes(snapshot.html),'Wrong initial page snapshot');for(const style of snapshot.styles)assert(html.includes(`href="${style}"`),'Missing page stylesheet');return{version,ray:r.headers.get('cf-ray')};}});
 }
 const checks=[];let next=0;
 await Promise.all(Array.from({length:Math.min(concurrency,tasks.length)},async()=>{while(next<tasks.length){const task=tasks[next++];try{checks.push({name:task.name,passed:true,details:await task.run()});}catch(error){checks.push({name:task.name,passed:false,error:error.message});}}}));
 return{at:new Date().toISOString(),origin,version,override,passed:checks.every(c=>c.passed),checks};
}
if(process.argv[1]&&path.resolve(process.argv[1])===new URL(import.meta.url).pathname){
 const[origin,version,output,mode]=process.argv.slice(2);assert(origin&&version&&output,'Usage: ORIGIN VERSION OUTPUT [override]');
 const report=await verifyRelease({origin,dist:process.env.RELEASE_DIST||'dist',version,override:mode==='override'});await mkdir(path.dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2));
 for(const check of report.checks.filter(c=>!c.passed))console.log('FAIL',check.name,check.error);
 console.log(`${report.checks.filter(c=>c.passed).length}/${report.checks.length} release checks passed`);if(!report.passed)process.exitCode=1;
}
