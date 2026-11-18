import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4310',out=process.env.BLOCK_CONTROL_OUTPUT||'reports/journeys/new-blocks';await mkdir(out,{recursive:true});const results=[];
const hash=n=>'0x'+n.toString(16).padStart(64,'0'),address='0x'+'1'.repeat(40);
for(const [engine,launcher] of Object.entries({chromium,firefox,webkit})){
 const browser=await launcher.launch(engine==='chromium'?{args:['--no-sandbox']}:{});
 try{for(const prefix of ['', '/testnet'])for(const path of ['/blocks','/txs']){
  const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),row={engine,prefix,path,passed:false};
  const chainId=prefix?763373:57073,baseHeight=90000000;let socket,sequence=1,height=baseHeight,stale=false;
  const block=n=>({height:n,hash:hash(n),timestamp:new Date().toISOString(),transactions_count:1,gas_limit:10000000,gas_used:20000,miner:{hash:address}});
  const tx=n=>({hash:hash(n+100),block_hash:hash(n),block_number:n,timestamp:new Date().toISOString(),status:'ok',value:'0',from:{hash:address},to:{hash:address},fee:{value:'0'},transaction_types:['COIN_TRANSFER']});
  const frame=()=>({type:'snapshot',protocol:'ink-observer.live.v1',sequence:sequence++,sentAt:new Date().toISOString(),network:{chainId,expectedChainId:chainId,online:true,synced:true,head:height,stale},block:block(height),blocks:[block(height)],transactions:[tx(height)]});
  const socketUrl=base.replace(/^http/,'ws')+prefix+'/api/live';
  await context.route(`**${prefix}/api/live/config`,r=>r.fulfill({json:{url:socketUrl}}));await context.route(`**${prefix}/api/live/snapshot`,r=>r.fulfill({json:frame()}));
  await context.route(`**${prefix}/api/explorer/${path==='/blocks'?'blocks*':'transactions*'}`,r=>r.fulfill({json:{items:[path==='/blocks'?block(baseHeight):tx(baseHeight)],next_page_params:null}}));
  await page.routeWebSocket(socketUrl,ws=>{socket=ws;ws.send(JSON.stringify(frame()));});
  try{
   await page.goto(base+prefix+path+'?lang=fr');const link=page.locator(path==='/blocks'?'.block-height a':'.tx-primary a').first();await link.waitFor();await page.waitForFunction(()=>document.querySelector('[data-live-head]')?.getAttribute('data-live-head')==='90000000');
   await link.focus();const original=await link.getAttribute('href');height+=2;socket.send(JSON.stringify(frame()));await page.locator('.new-rows-button').waitFor();
   assert.equal(await page.locator('.new-rows-button').innerText(),'Afficher 2 nouveaux blocs');assert.equal(await link.getAttribute('href'),original);
   stale=true;socket.send(JSON.stringify(frame()));await page.locator('.new-rows-button').waitFor({state:'hidden'});
   stale=false;socket.send(JSON.stringify(frame()));await page.locator('.new-rows-button').click();
   const suffix=path==='/blocks'?'/block/'+height:'/tx/'+hash(height+100);await page.locator(`.table-shell a[href*="${suffix}"]`).first().waitFor();
   assert.equal(await page.locator('.new-rows-button').count(),0);row.passed=true;
  }catch(e){row.error=e.message;}
  results.push(row);console.log(JSON.stringify(row));await writeFile(out+'/results.json',JSON.stringify({base,complete:false,results},null,2));await context.close();
 }}finally{await browser.close();}
}
await writeFile(out+'/results.json',JSON.stringify({base,complete:true,passed:results.every(r=>r.passed),results},null,2));if(results.some(r=>!r.passed))process.exitCode=1;
