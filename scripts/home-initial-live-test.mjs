import{chromium}from'playwright-core';import assert from'node:assert/strict';import{mkdir,writeFile}from'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4310',results=[],hash='0x'+'f'.repeat(64),txHash='0x'+'e'.repeat(64),height=90000000;
const browser=await chromium.launch({args:['--no-sandbox']});try{for(const prefix of ['', '/testnet']){
 const chainId=prefix?763373:57073;const original=await fetch(base+prefix+'/api/overview').then(r=>r.json());
 const block={...original.blocks[0],height,hash,timestamp:new Date().toISOString(),transaction_hashes:[txHash]};const tx={...original.transactions[0],hash:txHash,block_number:height,block_hash:hash,timestamp:block.timestamp};
 const frame={protocol:'ink-observer.live.v1',type:'welcome',sequence:1,network:{...original.network,chainId,expectedChainId:chainId,head:height,online:true,synced:true,stale:false},block,blocks:[block],transactions:[tx]};
 const context=await browser.newContext(),page=await context.newPage();let release;const gate=new Promise(r=>release=r);
 await context.route(`**${prefix}/api/overview`,async r=>{await gate;await r.fulfill({json:original});});
 await context.route(`**${prefix}/api/stats/counters`,r=>r.fulfill({json:{counters:[]}}));
 await context.route(`**${prefix}/api/live/snapshot`,r=>r.fulfill({json:frame}));
 await context.route(`**${prefix}/api/live/config`,r=>r.fulfill({json:{url:`ws://127.0.0.1:4310${prefix}/api/live`}}));
 await page.routeWebSocket(`**${prefix}/api/live`,ws=>ws.send(JSON.stringify(frame)));
 try{await page.goto(base+prefix+'/',{waitUntil:'domcontentloaded'});await page.waitForFunction(h=>Number(document.querySelector('[data-live-head]')?.getAttribute('data-live-head'))===h,height);release();await page.locator('.compact-block-row').first().waitFor();assert.equal(await page.locator('.compact-block-row a[href*="/block/"]').first().getAttribute('href'),`${prefix}/block/${height}`);assert.equal(await page.locator('.compact-tx-row a[href*="/tx/"]').first().getAttribute('href'),`${prefix}/tx/${txHash}`);results.push({chainId,passed:true,proof:'Single live frame before delayed overview; first rendered rows use live identities without waiting for another event'});}finally{release();await context.close();}
}}finally{await browser.close();await mkdir('reports/redesign/initial-live',{recursive:true});await writeFile('reports/redesign/initial-live/results.json',JSON.stringify({passed:results.length===2,results},null,2));}console.log(results);
