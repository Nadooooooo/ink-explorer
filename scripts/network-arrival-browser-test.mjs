import assert from 'node:assert/strict';
import { chromium, firefox, webkit } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import axe from 'axe-core';
const base=process.env.BASE_URL||'http://127.0.0.1:4310',out=process.env.NETWORK_ARRIVAL_OUTPUT||'reports/network-arrival/browser';
await mkdir(out,{recursive:true});const results=[];
for(const [engine,launcher] of Object.entries({chromium,firefox,webkit}).filter(([name])=>!process.env.NETWORK_ARRIVAL_ENGINES||process.env.NETWORK_ARRIVAL_ENGINES.split(',').includes(name))){
 const browser=await launcher.launch(engine==='chromium'?{args:['--no-sandbox']}:{});
 try{for(const [prefix,chainId,width]of[['',57073,320],['/testnet',763373,1440]]){
  const context=await browser.newContext({viewport:{width,height:1000},...(process.env.INK_RELEASE_VERSION?{extraHTTPHeaders:{'Cloudflare-Workers-Version-Overrides':`inkexplorer="${process.env.INK_RELEASE_VERSION}"`}}:{})}),page=await context.newPage(),errors=[],assetFailures=[],row={engine,prefix,width,checks:[]};
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&['script','stylesheet','font'].includes(r.request().resourceType()))assetFailures.push({url:r.url(),status:r.status()});});page.setDefaultTimeout(8000);
  let now=Date.now(),sequence=0,socket,failSnapshot=false,releaseRest,restReads=0;
  const restGate=new Promise(resolve=>releaseRest=resolve);
  const network=(head=9000000)=>({chainId,expectedChainId:chainId,head,online:true,synced:true,stale:false,sampledAt:new Date(now).toISOString(),safeBlock:head-3,finalizedBlock:head-10,finalityLag:10,executionPeers:7,rollupPeers:20,topicPeers:18,knownPeers:100,routingTablePeers:90,l1Head:100000,gasPriceWei:1000000,derivation:{online:true,synced:true},l1Rpc:{online:true,upstreams:[{available:true}]},disk:{total:1000000000,free:500000000}});
  const frame=(head=9000000)=>({type:'snapshot',protocol:'ink-observer.live.v1',sequence:++sequence,sentAt:new Date(now).toISOString(),network:network(head),block:{height:head,hash:'0x'+'a'.repeat(64),timestamp:new Date(now).toISOString()},blocks:[],transactions:[]});
  let current=frame();
  await context.route('**/api/**',async route=>{
   const path=new URL(route.request().url()).pathname.replace(/^\/testnet/,'');
   if(path==='/api/live/config')return route.fulfill({json:{url:base.replace(/^http/,'ws')+prefix+'/api/live'}});
   if(path==='/api/live/snapshot')return route.fulfill(failSnapshot?{status:503,json:{error:'Controlled silence'}}:{json:current});
   if(path==='/api/network'){restReads++;const response=network(8000000);await restGate;return route.fulfill({json:response}).catch(()=>{});}
   return route.fulfill({json:{items:[]}});
  });
  await context.routeWebSocket(/\/api\/live$/,ws=>{socket=ws;if(!failSnapshot)ws.send(JSON.stringify(current));});
  const values=()=>page.locator('.health-grid .metric > strong').allTextContents();
  const head=async()=>Number((await values())[0]?.replace(/\D/g,''));
  const waitHead=n=>page.waitForFunction(n=>document.querySelector('.health-grid .metric > strong')?.textContent.replace(/\D/g,'')===String(n),n);
  const send=async(edit)=>{current=frame();edit?.(current);socket.send(JSON.stringify(current));await page.waitForTimeout(75);};
  const check=async(name,fn)=>{try{await fn();row.checks.push({name,passed:true});}catch(e){row.checks.push({name,passed:false,error:e.message});}};
  try{
   await page.clock.install({time:new Date(now)});await page.goto(base+prefix+'/network?lang=en');await waitHead(9000000);
   // Leave a full second for the browser protocol round trip before pausing.
   // A 10 ms lead can already be in the past by the time WebKit receives it.
   now=await page.evaluate(()=>Date.now());await page.clock.pauseAt(new Date(now+1000));now+=1000;
   releaseRest();await page.waitForTimeout(200);
   await check('Late REST response cannot replace an observed head',async()=>assert.equal(await head(),9000000));
   await send();await waitHead(9000000);
   await page.evaluate(()=>dispatchEvent(new Event('offline')));await page.waitForTimeout(150);
   await check('Offline clears all health metrics and positive status',async()=>{assert.deepEqual(await values(),['N/A','N/A','N/A','N/A']);assert(!(await page.locator('.health-banner').innerText()).includes('Operational'));assert.equal(await page.locator('.storage').count(),0);});
   await page.evaluate(()=>dispatchEvent(new Event('online')));await waitHead(9000000);
   await check('Transport recovery restores fresh head',async()=>assert.equal(await head(),9000000));
   await send(f=>f.network.sampledAt=new Date(now-60000).toISOString());
   await check('Repeated expired observation is unavailable',async()=>assert.deepEqual(await values(),['N/A','N/A','N/A','N/A']));
   await send();await waitHead(9000000);
   await send(f=>f.network.sampledAt=new Date(now+60000).toISOString());
   await check('Implausibly future observation is unavailable',async()=>assert.deepEqual(await values(),['N/A','N/A','N/A','N/A']));
   await send();await waitHead(9000000);
   await send(f=>f.network.sampledAt=new Date(now-14000).toISOString());await waitHead(9000000);
   now+=1002;await page.clock.fastForward(1002);await page.waitForTimeout(75);
   await check('A report expires while the transport is still connected',async()=>{assert.deepEqual(await values(),['N/A','N/A','N/A','N/A']);assert.equal(await page.locator('[data-live-transport]').getAttribute('data-live-transport'),'websocket');});
   await send();await waitHead(9000000);
   await send(f=>{delete f.network.sampledAt;});
   await check('Undated observation is unavailable',async()=>assert.deepEqual(await values(),['N/A','N/A','N/A','N/A']));
   await send();await waitHead(9000000);
   await send(f=>{f.network.synced=false;f.network.stale=true;});
   await check('Fresh behind-node observation is distinguished from connection loss',async()=>{assert.equal(await head(),9000000);assert((await page.locator('.health-banner').innerText()).toLowerCase().includes('behind'));});
   await send();await waitHead(9000000);
   failSnapshot=true;now+=16000;await page.clock.fastForward(16000);await page.waitForTimeout(200);
   await check('Silent stream and failed fallback cannot retain current metrics',async()=>assert.deepEqual(await values(),['N/A','N/A','N/A','N/A']));
   failSnapshot=false;await page.evaluate(()=>dispatchEvent(new Event('offline')));current=frame(9000010);await page.evaluate(()=>dispatchEvent(new Event('online')));await waitHead(9000010);
   await check('Resume uses new observation without reload',async()=>assert.equal(await head(),9000010));
   await page.clock.resume();await page.evaluate(axe.source);await check('Network page remains accessible',async()=>assert.deepEqual(await page.evaluate(async()=>(await axe.run(document)).violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}))),[]));
   await check('No overflow or script error',async()=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);assert.deepEqual(assetFailures,[]);});
   row.restReads=restReads;row.values=await values();await page.screenshot({path:`${out}/${engine}-${chainId}.png`});
  }catch(e){row.checks.push({name:'Scenario completion',passed:false,error:e.stack});}
  finally{releaseRest();await context.close();}
  row.passed=row.checks.every(c=>c.passed);results.push(row);console.log(JSON.stringify(row));await writeFile(out+'/results.json',JSON.stringify({base,apiMocked:true,physicalDevices:false,complete:false,results},null,2));
 }}finally{await browser.close();}
}
await writeFile(out+'/results.json',JSON.stringify({base,apiMocked:true,physicalDevices:false,complete:true,passed:results.every(r=>r.passed),results},null,2));if(results.some(r=>!r.passed))process.exitCode=1;
