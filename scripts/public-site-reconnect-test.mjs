import assert from 'node:assert/strict';import {chromium,webkit}from'playwright';import{execFile}from'node:child_process';import{promisify}from'node:util';const run=promisify(execFile);import{mkdir,writeFile}from'node:fs/promises';
const out='reports/server-migration/local-reconnect';await mkdir(out,{recursive:true});const results=[];
for(const[engine,launcher]of Object.entries({chromium,webkit})){
 const browser=await launcher.launch(engine==='chromium'?{args:['--no-sandbox']}:{});
 try{for(const[prefix,width]of [['',390],['/testnet',1440]]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];let documents=0,sockets=0;const row={engine,prefix,width};
  page.on('pageerror',e=>errors.push(e.message));page.on('websocket',()=>sockets++);page.on('request',r=>{if(r.isNavigationRequest()&&r.frame()===page.mainFrame())documents++;});
  try{await page.goto('http://127.0.0.1:4197'+prefix+'/?lang=fr');await page.waitForFunction(()=>document.querySelector('[data-live-transport]')?.getAttribute('data-live-transport')==='websocket');const first=Number(await page.locator('[data-live-head]').getAttribute('data-live-head')),before=sockets;
   const started=Date.now(),nextSocket=page.waitForEvent('websocket',{timeout:30000});const oldPid=Number((await run('pm2',['pid','inkexplorer-site'])).stdout.trim());await run('pm2',['restart','inkexplorer-site','--silent'],{cwd:process.cwd()});await nextSocket;const newPid=Number((await run('pm2',['pid','inkexplorer-site'])).stdout.trim());assert(oldPid>0&&newPid>0&&oldPid!==newPid);Object.assign(row,{oldPid,newPid});
   await page.waitForFunction(first=>Number(document.querySelector('[data-live-head]')?.getAttribute('data-live-head'))>=first+2&&document.querySelector('[data-live-transport]')?.getAttribute('data-live-transport')==='websocket',first,{timeout:30000});
   assert(sockets>before);assert.equal(documents,1);assert.deepEqual(errors,[]);Object.assign(row,{passed:true,documents,sockets,firstHead:first,lastHead:Number(await page.locator('[data-live-head]').getAttribute('data-live-head')),recoveryMs:Date.now()-started});await page.screenshot({path:`${out}/${engine}-${prefix?'sepolia':'mainnet'}.png`});
  }catch(e){Object.assign(row,{passed:false,error:e.stack,documents,sockets,errors});}finally{await context.close();}results.push(row);
 }}finally{await browser.close();}
}
const report={complete:true,passed:results.every(x=>x.passed),scope:'Restart of the new loopback site only; old public Worker and API services unchanged',results};await writeFile(out+'/results.json',JSON.stringify(report,null,2));console.log(report);if(!report.passed)process.exitCode=1;
