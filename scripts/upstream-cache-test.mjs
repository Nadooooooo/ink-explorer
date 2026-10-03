import assert from 'node:assert/strict';
import {mkdtemp,cp,symlink,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';

const temp=await mkdtemp(join(tmpdir(),'ink-cache-age-'));
let status=503, hits=0, oracleHits=0, child, log='';
const upstream=createServer((req,res)=>{
  if(req.url==='/blocks/12345'){
    hits++;res.writeHead(status,{'content-type':'application/json'});
    res.end(JSON.stringify(status===200?{height:12345,marker:'fresh'}:{error:'Controlled failure'}));
  }else if(req.url==='/stats'){
    res.writeHead(200,{'content-type':'application/json'});
    if(req.headers['updated-gas-oracle']==='true'){oracleHits++;res.end(JSON.stringify({gas_prices:{average:{wei:'172840',time:3000,priority_fee_wei:'172559'}}}));}
    else res.end(JSON.stringify({gas_prices:{average:0.01}}));
  }else{res.writeHead(200,{'content-type':'application/json'});res.end('{}');}
});
await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));
const api=`http://127.0.0.1:${upstream.address().port}`, url=api+'/blocks/12345';
const probe=createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));
const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
try{
  await cp('server',join(temp,'server'),{recursive:true});
  await cp('dist',join(temp,'dist'),{recursive:true});
  await symlink(resolve('node_modules'),join(temp,'node_modules'));
  await mkdir(join(temp,'data/upstream-cache'),{recursive:true});
  const now=Date.now(), originalAt=now-24*3600000+60000;
  const cachePath=join(temp,'data/upstream-cache',createHash('sha256').update(url).digest('hex')+'.json');
  const clockPath=join(temp,'clock.txt'), clockImport=join(temp,'clock.mjs');
  await writeFile(clockPath,String(now));
  await writeFile(clockImport,`import {readFileSync} from 'node:fs';\nDate.now=()=>Number(readFileSync(${JSON.stringify(clockPath)},'utf8'));\n`);
  await writeFile(cachePath,JSON.stringify({url,at:originalAt,value:{height:12345,marker:'old'}}));
  const statsUrl=api+'/stats';
  await writeFile(join(temp,'data/upstream-cache',createHash('sha256').update(statsUrl).digest('hex')+'.json'),JSON.stringify({url:statsUrl,at:now,value:{gas_prices:{average:0.01}}}));
  child=spawn(process.execPath,['--import',pathToFileURL(clockImport).href,'server/server.mjs'],{cwd:temp,env:{...process.env,PORT:String(port),HOST:'127.0.0.1',INK_NETWORK:'mainnet',BLOCKSCOUT_API:api,INK_RPC:api,INK_OP_NODE_RPC:api,INK_METRICS_URL:api},stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',data=>log+=data);child.stderr.on('data',data=>log+=data);
  const base=`http://127.0.0.1:${port}`;
  let ready=false;for(let i=0;i<100;i++){try{ready=(await fetch(base+'/api/health')).ok;if(ready)break;}catch{}await new Promise(r=>setTimeout(r,50));}
  assert(ready,log);
  const legacy=await fetch(base+'/api/explorer/stats').then(response=>response.json());
  assert.equal(legacy.gas_prices.average,0.01,'Existing clients retain numeric gas estimates');
  const oracle=await fetch(base+'/api/explorer/stats?gas_oracle=updated').then(response=>response.json());
  assert.deepEqual(oracle.gas_prices.average,{wei:'172840',time:3000,priority_fee_wei:'172559'},'Detailed gas requires the oracle header and must not reuse the legacy numeric cache');
  assert.equal(oracleHits,1);
  await fetch(base+'/api/explorer/stats?gas_oracle=updated');
  assert.equal(oracleHits,1,'Detailed oracle responses should still share their own cache');
  assert.equal((await fetch(base+'/api/explorer/stats').then(response=>response.json())).gas_prices.average,0.01,'Detailed requests must not overwrite the legacy response');
  const first=await fetch(base+'/api/explorer/blocks/12345');
  assert.equal(first.status,200);assert.equal((await first.json()).marker,'old');
  // Wait for the asynchronous disk write before checking original provenance.
  await new Promise(r=>setTimeout(r,30));
  assert.equal(JSON.parse(await readFile(cachePath,'utf8')).at,originalAt,'Serving a fallback must not renew its original fetch time');
  await writeFile(clockPath,String(now+120000));
  const expired=await fetch(base+'/api/explorer/blocks/12345');
  assert.equal(expired.status,502,'An outage cannot keep renewing an expired snapshot');
  status=200;
  const recovered=await fetch(base+'/api/explorer/blocks/12345');
  assert.equal(recovered.status,200);assert.equal((await recovered.json()).marker,'fresh');
  await new Promise(r=>setTimeout(r,30));
  assert.equal(JSON.parse(await readFile(cachePath,'utf8')).at,now+120000);
  status=404;await writeFile(clockPath,String(now+140000));
  const missing=await fetch(base+'/api/explorer/blocks/12345');
  assert.equal(missing.status,502,'Permanent index errors cannot resurrect cached records');
  assert.match((await missing.json()).error,/404/);
  status=200;
  const concurrent=await Promise.all(Array.from({length:6},()=>fetch(base+'/api/explorer/blocks/12345').then(r=>r.json())));
  assert(concurrent.every(value=>value.height===12345 && value.marker==='fresh'),'Inflight sharing must return the public JSON shape');
  assert(hits>0);
  console.log('Upstream cache passed: original snapshot age preserved through outage; 24-hour expiry enforced; recovery, permanent errors and concurrent public responses verified.');
}finally{
  if(child){child.kill('SIGTERM');await new Promise(resolve=>child.once('close',resolve));}
  upstream.closeAllConnections();await new Promise(resolve=>upstream.close(resolve));
  await rm(temp,{recursive:true,force:true});
}
