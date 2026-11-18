import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
const base='https://inkexplorer.xyz',results=[];
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
try{
 for(const prefix of ['','/testnet'])for(const crawler of [false,true]){
  const context=await browser.newContext(crawler?{userAgent:'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'}:{});
  await context.addInitScript(()=>{window.testHidden=false;Object.defineProperty(document,'visibilityState',{get:()=>window.testHidden?'hidden':'visible'});});
  const page=await context.newPage(),errors=[],sockets=[];let config=0,snapshots=0;
  page.on('pageerror',e=>errors.push(e.message));
  page.on('websocket',socket=>sockets.push(socket));
  page.on('request',req=>{const path=new URL(req.url()).pathname;if(path.endsWith('/api/live/config'))config++;if(path.endsWith('/api/live/snapshot'))snapshots++;});
  try{
   await page.goto(base+prefix+'/developers',{waitUntil:'networkidle'});await page.locator('h1').waitFor();
   if(crawler){await page.waitForTimeout(4500);assert.deepEqual({config,snapshots,sockets:sockets.length},{config:0,snapshots:0,sockets:0});}
   else{
    await page.waitForFunction(()=>document.querySelector('[data-live-transport]')?.getAttribute('data-live-transport')==='websocket');
    assert.equal(sockets.length,1);assert(sockets.every(ws=>ws.url()===locationPlaceholder(prefix)));
    await page.evaluate(()=>{window.testHidden=true;document.dispatchEvent(new Event('visibilitychange'));});
    const before={config,snapshots,sockets:sockets.length};await page.waitForTimeout(5000);
    assert.deepEqual({config,snapshots,sockets:sockets.length},before);assert(sockets.every(socket=>socket.isClosed()));
    await page.evaluate(()=>{window.testHidden=false;document.dispatchEvent(new Event('visibilitychange'));document.dispatchEvent(new Event('visibilitychange'));});
    await page.waitForFunction(()=>document.querySelector('[data-live-transport]')?.getAttribute('data-live-transport')==='websocket');
    assert.equal(sockets.length,2);assert.equal(config,before.config+1);assert.equal(sockets.filter(socket=>!socket.isClosed()).length,1);
   }
   assert.deepEqual(errors,[]);results.push({prefix,crawler,passed:true,realPublicWebSockets:true,config,snapshots,sockets:sockets.length});console.log('PASS production',prefix||'mainnet',crawler?'crawler suppression':'real WSS visibility pause/resume');
  }finally{await context.close();}
 }
}finally{
 await browser.close();
 await mkdir('reports/spam-guard',{recursive:true});
 await writeFile('reports/spam-guard/production-browser.json',JSON.stringify({checkedAt:new Date().toISOString(),passed:results.length===4,results},null,2));
}
function locationPlaceholder(prefix){return 'wss://inkexplorer.xyz'+prefix+'/api/live';}
