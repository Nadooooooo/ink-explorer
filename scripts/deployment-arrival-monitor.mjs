import{init,parse}from'es-module-lexer';import{mkdir,appendFile,writeFile}from'node:fs/promises';
const origin=process.env.BASE_URL,output=process.env.MONITOR_OUTPUT;if(!origin||!output)throw Error('BASE_URL and MONITOR_OUTPUT are required');await init;await mkdir(output,{recursive:true});let stopped=false;for(const signal of['SIGINT','SIGTERM'])process.on(signal,()=>stopped=true);
const started=Date.now(),samples=[],duration=Math.max(1000,Math.min(1800000,Number(process.env.MONITOR_DURATION_MS)||600000));
const failure=error=>({error:error.message,...(error.cause?{cause:{name:error.cause.name,code:error.cause.code,message:error.cause.message,syscall:error.cause.syscall}}:{})});
while(!stopped&&Date.now()-started<duration){
 const sample={at:new Date().toISOString(),errors:[],assets:[]};
 try{
  const response=await fetch(origin+'/?lang=fr',{signal:AbortSignal.timeout(10000)}),html=await response.text();sample.version=response.headers.get('x-ink-version');if(response.status!==200)throw Error('Document HTTP '+response.status);
  const queue=[...new Set([...html.slice(0,html.indexOf('</head>')).matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)].map(m=>m[1]))];
  for(let i=0;i<queue.length;i++){
   const asset=queue[i];try{const r=await fetch(origin+asset,{signal:AbortSignal.timeout(10000)});const bytes=await r.arrayBuffer();sample.assets.push({path:asset,status:r.status,bytes:bytes.byteLength});if(r.status!==200)throw Error('HTTP '+r.status);
    if(asset.endsWith('.js'))for(const imported of parse(Buffer.from(bytes).toString())[0])if(['static','reexport-star'].includes(imported.type)&&imported.specifier?.startsWith('.')){const dep=new URL(imported.specifier,origin+asset).pathname;if(!queue.includes(dep))queue.push(dep);}
   }catch(error){sample.errors.push({path:asset,...failure(error)});}
  }
 }catch(error){sample.errors.push({path:'/',...failure(error)});}
 sample.durationMs=Date.now()-Date.parse(sample.at);samples.push(sample);await appendFile(output+'/samples.jsonl',JSON.stringify(sample)+'\n');
 if(sample.errors.length||samples.length%10===0)console.log(`Observed ${samples.length} arrivals; ${samples.filter(s=>s.errors.length).length} with failures; version ${sample.version}`);
 if(!stopped)await new Promise(r=>setTimeout(r,1000));
}
const summary={startedAt:new Date(started).toISOString(),finishedAt:new Date().toISOString(),origin,samples:samples.length,failedSamples:samples.filter(s=>s.errors.length).length,versions:[...new Set(samples.map(s=>s.version))],browserExecution:false,geographicCoverage:'Single client location'};await writeFile(output+'/summary.json',JSON.stringify(summary,null,2));console.log(summary);if(summary.failedSamples)process.exitCode=1;
