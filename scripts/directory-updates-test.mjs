import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4324',out=process.env.DIRECTORY_UPDATES_OUTPUT||'reports/directory-history/updates';await mkdir(out,{recursive:true});const results=[];
const hash=n=>'0x'+n.toString(16).padStart(64,'0'),address=n=>'0x'+n.toString(16).padStart(40,'0');
for(const[engine,launcher]of[['chromium',chromium],['webkit',webkit]]){
 const browser=await launcher.launch(engine==='chromium'?{args:['--no-sandbox']}:{});
 try{for(const prefix of['','/testnet'])for(const routeName of['contracts','ops']){
  const c=await browser.newContext({viewport:{width:390,height:900},colorScheme:'dark'}),p=await c.newPage(),row={engine,prefix,route:routeName,passed:false};
  let revision=1,head=100,sequence=0,socket,requests=0,stale=false,offline=false;
  const chainId=prefix?763373:57073,frame=()=>({type:'snapshot',protocol:'ink-observer.live.v1',sequence:++sequence,sentAt:new Date().toISOString(),network:{chainId,expectedChainId:chainId,online:!offline,synced:true,stale:offline,head},block:{height:head,hash:hash(head),timestamp:new Date().toISOString()},blocks:[],transactions:[]});
  const api=routeName==='contracts'?'smart-contracts':'proxy/account-abstraction/operations';
  await c.routeWebSocket(/\/api\/live$/,ws=>{socket=ws;ws.send(JSON.stringify(frame()));});
  await c.route('**/api/**',async route=>{const u=new URL(route.request().url()),path=u.pathname.replace(/^\/testnet/,'');if(path==='/api/live/config')return route.fulfill({json:{url:base.replace(/^http/,'ws')+prefix+'/api/live'}});if(path==='/api/live/snapshot')return route.fulfill({json:frame()});if(path==='/api/explorer/'+api){requests++;const n=u.searchParams.has('cursor')?99:revision;const item=routeName==='contracts'?{address:{hash:address(n),name:'Contract '+n},language:'solidity'}:{hash:hash(n),address:{hash:address(1)},transaction_hash:hash(200),status:true,fee:'100',timestamp:'2026-10-22T00:00:00Z'};return route.fulfill({headers:{'x-ink-data-status':stale?'stale':'fresh','x-ink-data-fetched-at':new Date().toISOString()},json:{items:[item],next_page_params:n===99?null:{cursor:'second'}}});}return route.fulfill({json:{items:[]}});});
  const selector=routeName==='contracts'?'.contract-card':'.protocol-row a[href*="/op/"]',wait=async n=>p.locator(`${selector}[href*="${routeName==='contracts'?address(n):hash(n)}"]`).waitFor();
  const advance=async()=>{for(let i=0;i<3;i++){head++;socket.send(JSON.stringify(frame()));await p.clock.fastForward(8000);await p.waitForTimeout(30);}};
  try{
   await p.clock.install();await p.goto(base+prefix+'/'+routeName+'?lang=fr',{waitUntil:'domcontentloaded'});await wait(1);
   revision=2;await advance();const update=p.locator('.directory-page .indexed-update-button');await update.waitFor();await wait(1);await update.click();await wait(2);
   const expectedFocus=routeName==='contracts'?'contract-grid':'user-operation-ledger';await p.waitForFunction(name=>document.activeElement?.classList.contains(name),expectedFocus);
   const pager=p.locator('.directory-controls .ledger-top-pagination');await pager.locator('button').nth(2).click();await wait(99);const before=requests;revision=3;await advance();assert.equal(requests,before);await wait(99);
   await pager.locator('button').nth(1).click();await wait(3);stale=true;revision=4;await advance();await p.locator('.directory-page .data-unavailable').waitFor();assert.equal(await update.count(),0);await wait(3);
   stale=false;await advance();await advance();await update.waitFor();await update.click();await wait(4);offline=true;await advance();await p.locator('.directory-page .data-unavailable').waitFor();await wait(4);assert.equal(await update.count(),0);
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);row.passed=true;
  }catch(error){row.error=error.stack;await p.screenshot({path:`${out}/failure-${engine}-${prefix?'sepolia':'mainnet'}-${routeName}.png`}).catch(()=>{});}results.push(row);console.log(JSON.stringify(row));await c.close();
 }}finally{await browser.close();}
}
await writeFile(out+'/results.json',JSON.stringify({base,complete:true,passed:results.every(row=>row.passed),results},null,2));if(results.some(row=>!row.passed))process.exitCode=1;
