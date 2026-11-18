import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright-core';
import {WebSocketServer} from 'ws';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4310',out=process.env.TOUCH_RACE_OUTPUT||'reports/activity-controls/touch-race',baseline=process.env.COPY_RACE_BASELINE==='1',results=[];
await mkdir(out,{recursive:true});
const hash=n=>'0x'+n.toString(16).padStart(64,'0'),address=n=>'0x'+n.toString(16).padStart(40,'0');
for(const engine of(process.env.TOUCH_RACE_ENGINES||'chromium,firefox,webkit').split(',')){
 const browser=await({chromium,firefox,webkit})[engine].launch(engine==='chromium'?{args:['--no-sandbox']}:{});
 try{for(const prefix of['','/testnet'])for(const width of[390,768])for(const route of(process.env.TOUCH_RACE_ROUTES||'txs,blocks').split(',')){
  const chainId=prefix?763373:57073,context=await browser.newContext({viewport:{width,height:1000},hasTouch:true,bypassCSP:true}),page=await context.newPage(),server=new WebSocketServer({host:'127.0.0.1',port:0}),row={engine,prefix,width,route,baseline,passed:false};
  await new Promise(resolve=>server.once('listening',resolve));let head=100;
  const tx=n=>({hash:hash(n),block_number:n,block_hash:hash(n+1000),status:'ok',timestamp:new Date().toISOString(),from:{hash:address(n)},to:{hash:address(2)},value:'0',method:'transfer',fee:{value:'0'},transaction_types:['coin_transfer']});
  const block=n=>({height:n,hash:hash(n+1000),miner:{hash:address(n)},timestamp:new Date().toISOString(),gas_limit:'100',gas_used:'10',size:100,transactions_count:1,transaction_hashes:[hash(n)]});
  const expected=n=>route==='txs'?hash(n):address(n);
  const frame=()=>({protocol:'ink-observer.live.v1',type:'block',sequence:head,sentAt:new Date().toISOString(),network:{chainId,expectedChainId:chainId,head,online:true,synced:true,stale:false,safeBlock:head-2,finalizedBlock:head-4,derivation:{online:true,synced:true}},block:block(head),blocks:[block(head)],transactions:[tx(head)]});
  server.on('connection',socket=>socket.send(JSON.stringify(frame())));
  await page.route('**/api/live/config',route=>route.fulfill({json:{url:`ws://127.0.0.1:${server.address().port}${prefix}/api/live`}}));
  await page.route('**/api/live/snapshot',route=>route.fulfill({json:frame()}));
  await page.route(/\/api\/explorer\/transactions(?:\?|$)/,route=>route.fulfill({json:{items:[tx(100)],next_page_params:null}}));
  await page.route(/\/api\/explorer\/blocks(?:\?|$)/,route=>route.fulfill({json:{items:[block(100)],next_page_params:null}}));
  await page.addInitScript(()=>{window.copies=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>window.copies.push(value)}})});
  try{
   await page.goto(base+prefix+'/'+route+'?lang=en',{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>document.querySelector('[data-live-head]')?.getAttribute('data-live-head')==='100');
   const target=route==='txs'?'.tx-row .tx-primary':'.block-row .block-beneficiary',button=page.locator(target+' .copy-button').first(),identity=()=>page.locator(target+' .text-link').first().getAttribute('title');
   if(route==='txs')await page.locator('.transaction-summary[aria-busy=false]').waitFor();await page.evaluate(()=>document.fonts.ready);await button.scrollIntoViewIfNeeded();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert.equal(await identity(),expected(100));
   const box=await button.boundingBox();let cdp;
   if(engine==='chromium'){cdp=await context.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2}]});}
   else await button.dispatchEvent('pointerdown',{pointerType:'touch',pointerId:1,isPrimary:true,bubbles:true});
   head=101;for(const socket of server.clients)socket.send(JSON.stringify(frame()));
   await page.waitForFunction(()=>document.querySelector('[data-live-head]')?.getAttribute('data-live-head')==='101');await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   row.identityWhilePressed=await identity();const after=await button.boundingBox();row.shift={x:after.x-box.x,y:after.y-box.y};if(!baseline)assert(Math.abs(row.shift.x)<1&&Math.abs(row.shift.y)<1,'The pressed control moved when the update action appeared');
   if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   else {await button.dispatchEvent('pointerup',{pointerType:'touch',pointerId:1,isPrimary:true,bubbles:true});await button.evaluate(element=>element.click());}
   await page.waitForFunction(()=>window.copies.length>0);row.copied=await page.evaluate(()=>window.copies.at(-1));
   assert.equal(row.identityWhilePressed,expected(baseline?101:100));assert.equal(row.copied,expected(baseline?101:100));
   if(!baseline){await page.locator('.new-rows-button').click();await page.waitForFunction(({target,value})=>document.querySelector(target+' .text-link')?.getAttribute('title')===value,{target,value:expected(101)});row.resumed=true;}
   if(cdp && !baseline && process.env.TOUCH_RACE_CANCEL==='1'){
    const count=await page.evaluate(()=>window.copies.length),pressed=await button.boundingBox();
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:pressed.x+pressed.width/2,y:pressed.y+pressed.height/2}]});
    head=102;for(const socket of server.clients)socket.send(JSON.stringify(frame()));
    await page.waitForFunction(()=>document.querySelector('[data-live-head]')?.getAttribute('data-live-head')==='102');
    await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    assert.equal(await page.evaluate(()=>window.copies.length),count,'A canceled gesture must not copy');
    await page.locator('.new-rows-button').click();await page.waitForFunction(({target,value})=>document.querySelector(target+' .text-link')?.getAttribute('title')===value,{target,value:expected(102)});row.cancelledHoldNoCopy=true;
   }
   row.nativeTouch=engine==='chromium';row.passed=true;
  }catch(error){row.error=error.stack;}finally{await context.close();for(const socket of server.clients)socket.terminate();await new Promise(resolve=>server.close(resolve));}
  results.push(row);console.log(JSON.stringify(row));await writeFile(out+'/results.json',JSON.stringify({base,complete:false,results},null,2));
 }}finally{await browser.close();}
}
await writeFile(out+'/results.json',JSON.stringify({base,baseline,complete:true,passed:results.every(r=>r.passed),results},null,2));if(results.some(r=>!r.passed))process.exitCode=1;
