import assert from 'node:assert/strict';
import {mkdtemp,cp,symlink,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
const temp=await mkdtemp(join(tmpdir(),'ink-filter-boundary-'));
let failure=true, seen=[];
const upstream=createServer((req,res)=>{
 if(req.url.startsWith('/advanced-filters')) {
  seen.push(req.url);res.writeHead(failure?503:200,{'content-type':'application/json'});
  res.end(JSON.stringify(failure?{error:'Controlled outage'}:{items:[{hash:'fresh'}],next_page_params:null}));
 }else{res.writeHead(200,{'content-type':'application/json'});res.end('{}');}
});
await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));
const api=`http://127.0.0.1:${upstream.address().port}`;
const query='/advanced-filters?amount_from=0.01&methods=0xa9059cbb';
const url=api+query;
const probe=createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));
const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
let child,log='';
try {
 await cp('server',join(temp,'server'),{recursive:true});
 await cp('dist',join(temp,'dist'),{recursive:true});
 await symlink(resolve('node_modules'),join(temp,'node_modules'));
 await mkdir(join(temp,'data/upstream-cache'),{recursive:true});
 await writeFile(join(temp,'data/upstream-cache',createHash('sha256').update(url).digest('hex')+'.json'),JSON.stringify({url,at:Date.now()-20000,value:{items:[{hash:'old'}]}}));
 child=spawn(process.execPath,['server/server.mjs'],{cwd:temp,env:{...process.env,PORT:String(port),HOST:'127.0.0.1',BLOCKSCOUT_API:api,INK_RPC:api,INK_OP_NODE_RPC:api,INK_METRICS_URL:api},stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',data=>log+=data);child.stderr.on('data',data=>log+=data);
 const base=`http://127.0.0.1:${port}`;
 let ready=false;for(let i=0;i<100;i++){try{ready=(await fetch(base+'/api/health')).ok;if(ready)break;}catch{}await new Promise(r=>setTimeout(r,50));}
 assert.ok(ready,log);
 const failed=await fetch(base+'/api/explorer'+query);assert.equal(failed.status,502,'Old filtered snapshots must not hide an outage');
 failure=false;
 const recovered=await fetch(base+'/api/explorer'+query);assert.equal(recovered.status,200);assert.deepEqual((await recovered.json()).items,[{hash:'fresh'}]);
 assert.ok(seen.every(path=>path===query),'Query semantics must survive the facade');
 assert.equal((await fetch(base+'/api/explorer/advanced-filters',{method:'POST'})).status,405);
 console.log('Advanced-filter server boundary passed: real upstream outage, old disk cache, recovery, query preservation and read-only method.');
}finally{
 if(child){child.kill('SIGTERM');await new Promise(resolve=>child.once('close',resolve));}
 await new Promise(resolve=>upstream.close(resolve));await rm(temp,{recursive:true,force:true});
}
