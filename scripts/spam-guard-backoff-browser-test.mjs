import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { WebSocketServer } from 'ws';
import { mkdir, writeFile } from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4201',results=[];
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
try {
 for(const scenario of ['initially-hidden','quota','invalid-socket']){
  const context=await browser.newContext(),page=await context.newPage(),server=new WebSocketServer({host:'127.0.0.1',port:0});
  await new Promise(r=>server.once('listening',r));
  let connections=0,configs=0,snapshots=0;const opened=[];
  await context.addInitScript(hidden=>{window.testHidden=hidden;Object.defineProperty(document,'visibilityState',{get:()=>window.testHidden?'hidden':'visible'});},scenario==='initially-hidden');
  server.on('connection',socket=>{connections++;opened.push(Date.now());if(scenario==='invalid-socket')setTimeout(()=>socket.close(),20);});
  await context.route('**/api/**',async r=>{
   const path=new URL(r.request().url()).pathname;
   if(path.endsWith('/live/config')){configs++;return r.fulfill({json:{url:`ws://127.0.0.1:${server.address().port}/api/live`}});}
   if(path.endsWith('/live/snapshot')){snapshots++;return r.fulfill(scenario==='quota'?{status:429,headers:{'retry-after':'120'},body:'quota exceeded'}:{json:{}});}
   return r.fulfill({json:{items:[],counters:[]}});
  });
  try{
   await page.goto(base+'/developers',{waitUntil:'networkidle'});await page.locator('h1').waitFor();
   if(scenario==='initially-hidden'){
    await page.waitForTimeout(4500);assert.deepEqual({configs,snapshots,connections},{configs:0,snapshots:0,connections:0});
    await page.evaluate(()=>{window.testHidden=false;document.dispatchEvent(new Event('visibilitychange'));});
    await page.waitForFunction(()=>document.querySelector('[data-live-transport]'));
    for(let i=0;i<60&&connections<1;i++)await page.waitForTimeout(50);
    assert.equal(connections,1);assert.equal(configs,1);assert.equal(snapshots,1);
   }else if(scenario==='quota'){
    await page.waitForTimeout(10500);assert.equal(snapshots,1,'Polling timers must not issue another request during Retry-After');
   }else{
    await page.waitForTimeout(8500);assert(connections>=3&&connections<=4,`Unexpected reconnect volume: ${connections}`);
    assert(opened[2]-opened[1]>=1800,'Opening without a valid frame must not reset backoff');
    if(opened[3])assert(opened[3]-opened[2]>=3800);
   }
   results.push({scenario,passed:true,configs,snapshots,connections,reconnectIntervals:opened.slice(1).map((t,i)=>t-opened[i])});console.log('PASS',scenario);
  }finally{await context.close();for(const socket of server.clients)socket.terminate();await new Promise(r=>server.close(r));}
 }
}finally{await browser.close();await mkdir('reports/spam-guard',{recursive:true});await writeFile('reports/spam-guard/backoff-browser.json',JSON.stringify({passed:results.length===3,results},null,2));}
