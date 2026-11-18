import assert from 'node:assert/strict';import{mkdir,appendFile,writeFile,readFile}from'node:fs/promises';import{createHash}from'node:crypto';
const base=process.env.BASE_URL,output=process.env.HOSTING_MONITOR_OUTPUT,duration=Math.max(1000,Math.min(3600000,Number(process.env.HOSTING_MONITOR_DURATION_MS)||600000));
assert(base&&output,'Explicit BASE_URL and HOSTING_MONITOR_OUTPUT required');assert(/^https:\/\/[^/]+$/.test(base)||/^http:\/\/127\.0\.0\.1:\d+$/.test(base),'Unexpected monitoring origin');await mkdir(output,{recursive:true});
const manifestBytes=await readFile('dist/release-artifacts.json');
const version=process.env.EXPECTED_VERSION||process.env.INK_SITE_VERSION||createHash('sha256').update(manifestBytes).digest('hex');
const started=Date.now();let stopped=false,samples=0,hostingFailures=0,dataFailures=0,maxDocumentMs=0;const heads=new Map();
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>stopped=true);
async function get(path){const start=Date.now(),response=await fetch(base+path,{signal:AbortSignal.timeout(10000),redirect:'manual'});return {response,body:Buffer.from(await response.arrayBuffer()),ms:Date.now()-start};}
// Stop on the old Worker or an unrelated target before starting repeated probes.
const ready=await get('/__site/health');assert.equal(ready.response.status,200,'New origin health endpoint not reachable; no polling started');assert.equal(ready.response.headers.get('x-ink-hosting'),'server');assert.equal(JSON.parse(ready.body).version,version);
const template=await readFile('dist/index.html','utf8'),asset=template.match(/<script[^>]*src="(\/assets\/[^"?]+\.js)"/)[1],manifest=JSON.parse(manifestBytes);
while(!stopped&&Date.now()-started<duration){
 const sample={at:new Date().toISOString(),documents:[],snapshots:[],errors:[]};
 for(const path of ['/?lang=fr','/testnet/txs?lang=fr']){
  try{const {response:r,body,ms}=await get(path),html=body.toString();assert.equal(r.status,200);assert.equal(r.headers.get('x-ink-hosting'),'server');assert.equal(r.headers.get('x-ink-version'),version);assert(html.includes('rel="canonical" href="https://inkexplorer.xyz'));assert(html.includes('<h1'));const robots=r.headers.get('x-robots-tag');assert.match(robots,base==='https://inkexplorer.xyz'?/^index,/:/^noindex/);maxDocumentMs=Math.max(maxDocumentMs,ms);sample.documents.push({path,ms,cache:r.headers.get('x-ink-site-cache'),edgeCache:r.headers.get('cf-cache-status')});}
  catch(e){sample.errors.push({kind:'hosting',path,error:e.message});}
 }
 for(const[prefix,chainId]of [['',57073],['/testnet',763373]]){
  const path=prefix+'/api/live/snapshot';try{const {response:r,body,ms}=await get(path),j=JSON.parse(body);assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(j.network.chainId,chainId);assert.equal(j.network.synced,true);assert.equal(j.network.stale,false);assert.equal(j.block.height,j.network.head);assert(Date.now()-Date.parse(j.network.sampledAt)<15000);assert(/^0x[\da-f]{64}$/i.test(j.block.hash));let observed=heads.get(chainId);if(!observed)heads.set(chainId,observed=new Set());observed.add(j.block.height);sample.snapshots.push({chainId,head:j.block.height,blockHash:j.block.hash,ms});}
  catch(e){sample.errors.push({kind:'data',path,error:e.message});}
 }
 if(samples%12===0){try{const {response:r,body}=await get(asset);assert.equal(r.status,200);assert.equal(createHash('sha256').update(body).digest('hex'),manifest.active[asset.slice(1)].sha256);assert.match(r.headers.get('cache-control'),/immutable/);sample.asset={path:asset,edgeCache:r.headers.get('cf-cache-status'),bytes:body.length};}catch(e){sample.errors.push({kind:'hosting',path:asset,error:e.message});}}
 samples++;hostingFailures+=Number(sample.errors.some(e=>e.kind==='hosting'));dataFailures+=Number(sample.errors.some(e=>e.kind==='data'));await appendFile(output+'/samples.jsonl',JSON.stringify(sample)+'\n');if(sample.errors.length||samples%12===0)console.log(JSON.stringify({samples,hostingFailures,dataFailures}));
 if(!stopped)await new Promise(r=>setTimeout(r,Math.min(5000,Math.max(0,duration-(Date.now()-started)))));
}
const report={complete:true,startedAt:new Date(started).toISOString(),finishedAt:new Date().toISOString(),base,samples,hostingFailures,dataFailures,maxDocumentMs,observedHeads:Object.fromEntries([...heads].map(([id,values])=>[id,values.size])),passed:hostingFailures===0&&dataFailures===0,browserExecution:false,scope:'One client location; HTTP hosting, static byte integrity and current network snapshots. Search Console and field Core Web Vitals not measured.'};await writeFile(output+'/summary.json',JSON.stringify(report,null,2));console.log(report);if(!report.passed)process.exitCode=1;
