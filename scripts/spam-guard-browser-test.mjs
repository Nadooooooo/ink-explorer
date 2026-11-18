import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { WebSocketServer } from 'ws';
import { mkdir, writeFile } from 'node:fs/promises';
const base = process.env.BASE_URL || 'http://127.0.0.1:4201';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const results = [];
const frame = chainId => ({ protocol:'ink-observer.live.v1',type:'welcome',sequence:1,sentAt:new Date().toISOString(),network:{chainId,expectedChainId:chainId,head:90000000,online:true,synced:true,stale:false},block:{height:90000000,hash:'0x'+'a'.repeat(64)},blocks:[],transactions:[] });
try {
 for (const prefix of ['', '/testnet']) {
  const chainId = prefix ? 763373 : 57073;
  for (const crawler of [false,true]) {
   const context = await browser.newContext(crawler ? {userAgent:'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'} : {});
   const page = await context.newPage(), errors = [];
   page.on('pageerror', e => errors.push(e.message));
   await context.addInitScript(() => {
    window.testHidden = false;
    Object.defineProperty(document,'visibilityState',{get:()=>window.testHidden?'hidden':'visible'});
   });
   const server = new WebSocketServer({host:'127.0.0.1',port:0});
   await new Promise(r=>server.once('listening',r));
   let sockets = 0, config = 0, snapshots = 0;
   server.on('connection',socket=>{sockets++;socket.send(JSON.stringify(frame(chainId)));});
   await context.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if(path.endsWith('/live/config')){config++;return route.fulfill({json:{url:`ws://127.0.0.1:${server.address().port}${prefix}/api/live`}});}
    if(path.endsWith('/live/snapshot')){snapshots++;return route.fulfill({json:frame(chainId)});}
    return route.fulfill({json:{counters:[],items:[]}});
   });
   try {
    await page.goto(base+prefix+'/developers',{waitUntil:'networkidle'});
    await page.locator('h1').waitFor();
    if(crawler){
     await page.waitForTimeout(4500);
     assert.deepEqual({config,snapshots,sockets},{config:0,snapshots:0,sockets:0});
    }else{
     await page.waitForFunction(()=>document.querySelector('[data-live-transport]')?.getAttribute('data-live-transport')==='websocket');
     assert.equal(sockets,1);
     await page.evaluate(()=>{window.testHidden=true;document.dispatchEvent(new Event('visibilitychange'));});
     const hidden={config,snapshots,sockets};
     await page.waitForTimeout(5000);
     assert.deepEqual({config,snapshots,sockets},hidden);
     assert.equal([...server.clients].filter(x=>x.readyState===1).length,0);
     await page.evaluate(()=>{window.testHidden=false;document.dispatchEvent(new Event('visibilitychange'));document.dispatchEvent(new Event('visibilitychange'));});
     await page.waitForFunction(()=>document.querySelector('[data-live-transport]')?.getAttribute('data-live-transport')==='websocket');
     assert.equal(sockets,2);
     assert.equal(config,hidden.config+1);
     assert.equal([...server.clients].filter(x=>x.readyState===1).length,1);
    }
    assert.deepEqual(errors,[]);
    results.push({prefix,crawler,passed:true,config,snapshots,sockets});
    console.log('PASS',prefix||'mainnet',crawler?'crawler has no live requests':'hidden pause and single resumed connection');
   }finally{await context.close();for(const s of server.clients)s.terminate();await new Promise(r=>server.close(r));}
  }
 }
}finally{
 await browser.close();await mkdir('reports/spam-guard',{recursive:true});
 await writeFile('reports/spam-guard/browser.json',JSON.stringify({passed:results.length===4,results},null,2));
}
