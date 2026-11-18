import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){try{return n(s,c)}catch(e){if(s.startsWith('./')&&c.parentURL?.includes('/src/')&&!/\.[a-z]+$/.test(s))return n(s+'.ts',c);throw e;}}});
const {recordSourceMaxAge,validRecordArrival}=await import('../src/record-arrival.ts');
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'https://inkexplorer.xyz',out=process.env.RECORD_LOCALES_OUTPUT||'reports/detail-arrival/locales';
// Discover independent references on the nodes; a new checkout must not need
// an untracked report from a previous publication to validate its documents.
const samples=[];
async function rpc(port,method,params){const r=await fetch('http://127.0.0.1:'+port,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:1,jsonrpc:'2.0',method,params}),signal:AbortSignal.timeout(10000)});assert.equal(r.status,200);const data=await r.json();assert(!data.error);return data.result;}
for(const[prefix,chainId,port]of[['',57073,8545],['/testnet',763373,8645]]){
 const head=Number(BigInt(await rpc(port,'eth_blockNumber',[]))),height=head-600,block=await rpc(port,'eth_getBlockByNumber',['0x'+height.toString(16),false]);assert(block?.hash&&block.transactions.length);
 const tx=await rpc(port,'eth_getTransactionByHash',[block.transactions[0]]);assert.equal(tx?.blockHash,block.hash);
 samples.push({chainId,kind:'block',hash:block.hash,path:prefix+'/block/'+height,passed:true},{chainId,kind:'transaction',hash:tx.hash,path:prefix+'/tx/'+tx.hash,passed:true});
}
for(const [prefix,chainId] of [['',57073],['/testnet',763373]])for(const kind of ['address','token'])samples.push({chainId,kind,hash:'0x4200000000000000000000000000000000000006',path:prefix+'/'+kind+'/0x4200000000000000000000000000000000000006',passed:true});
const shells=JSON.parse(await readFile('dist/snapshots/records-manifest.json','utf8'));
const headers=process.env.INK_RELEASE_VERSION?{'Cloudflare-Workers-Version-Overrides':`inkexplorer="${process.env.INK_RELEASE_VERSION}"`}:{};
const results=[];let next=0;await mkdir(out,{recursive:true});assert.equal(shells.length,80);
await Promise.all(Array.from({length:4},async()=>{while(next<shells.length){
 const shell=shells[next++],chainId=shell.network==='sepolia'?763373:57073;
 const sample=samples.find(x=>x.kind===shell.kind&&x.chainId===chainId&&x.passed);assert(sample);
 const path=sample.path.split('?')[0],url=base+path+'?lang='+shell.language,row={kind:shell.kind,chainId,language:shell.language,path};
 try{
  const start=Date.now(),r=await fetch(url,{headers,redirect:'error',signal:AbortSignal.timeout(10000)}),html=await r.text();row.documentMs=Date.now()-start;row.status=r.status;row.version=r.headers.get('x-ink-version');
  assert.equal(r.status,200);if(process.env.EXPECTED_VERSION)assert.equal(row.version,process.env.EXPECTED_VERSION);
  assert.equal(r.headers.get('cache-control'),'no-store');assert.match(r.headers.get('x-robots-tag'),/^index,/);assert(html.includes(`lang="${shell.language}"`));assert(html.includes('href="'+base+path+(shell.language==='en'?'':'?lang='+shell.language)+'"'));
  const packet=JSON.parse(html.match(/id="ink-initial-record" type="application\/json">([^<]+)<\/script>/)[1]);assert.equal(packet.phase,'ready');assert.equal(packet.kind,shell.kind);assert.equal(packet.chainId,chainId);assert.equal(shell.kind==='token'?packet.data.address_hash:shell.kind==='token'?packet.data.address_hash:packet.data.hash,sample.hash);assert(validRecordArrival(packet,shell.kind,packet.id,chainId,packet.issuedAt));
  const snapshot=JSON.parse(await readFile('dist/'+shell.path,'utf8')),parts=snapshot.html.split('<main id="main-content" tabindex="-1" data-record-shell=""></main>');assert.equal(parts.length,2);for(const part of parts)assert(html.includes(part),'Published page must use the matching built shell');for(const style of snapshot.styles)assert(html.includes(`href="${style}"`));
  const main=html.match(/<main id="main-content"[^>]*>([\s\S]*?)<\/main>/)?.[1];assert(main?.includes(sample.hash),'The visible HTML, not just its JSON, must contain the requested record');assert(main.includes('data-record-phase="ready"'));assert(main.includes('<h1>'));assert(main.includes('<dl '));Object.assign(row,{sourceAt:packet.sourceAt,hash:shell.kind==='token'?packet.data.address_hash:packet.data.hash,passed:true});
 }catch(e){Object.assign(row,{passed:false,error:e.stack});}
 results.push(row);console.log(JSON.stringify(row));
}}));
const report={base,at:new Date().toISOString(),documentMocked:false,apiMocked:false,browserExecution:false,complete:true,passed:results.every(r=>r.passed),results};await writeFile(out+'/results.json',JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;
