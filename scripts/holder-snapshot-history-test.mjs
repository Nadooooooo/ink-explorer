import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
import {formatChainAmount} from '../src/explorer-data.ts';
import {tokenUsd} from '../src/token-data.ts';
const base=process.env.BASE_URL||'http://127.0.0.1:4316',out=process.env.HOLDER_HISTORY_OUTPUT||'reports/holder-snapshots/history',results=[];
const address='0x4200000000000000000000000000000000000006';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox'],ignoreDefaultArgs:['--disable-back-forward-cache']});
try{for(const prefix of['','/testnet'])for(const width of[390,1440]){
 const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage(),row={prefix,width,passed:false},errors=[];
 page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));
 const identities=()=>page.locator('.holder-identity .copyable a').evaluateAll(es=>es.map(e=>new URL(e.href).pathname.toLowerCase()));
 try{
  await page.goto(`${base}${prefix}/token/${address}?tab=holders&lang=fr`,{waitUntil:'domcontentloaded'});
  await page.locator('.holder-row').first().waitFor();
  const nextResponse=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/holders'));
  await page.locator('.token-list-controls .cursor-pagination button').last().click();
  const response=await nextResponse,next=await response.json(),cursor=response.url();assert(next.items?.length);
  await page.waitForFunction(hash=>document.querySelector('.holder-identity .copyable a')?.getAttribute('href').toLowerCase().includes(hash),next.items[0].address.hash.toLowerCase());
  const saved=await identities();
  await page.waitForFunction(()=>document.querySelector('.holder-row > strong > bdi')?.textContent!=='N/A');
  await page.waitForFunction(()=>document.querySelector('[data-live-transport]')?.getAttribute('data-live-transport')==='websocket');
  const marker=await page.evaluate(({prefix,address})=>{
   window.holderMarker=crypto.randomUUID();window.holderReturns=[];window.holderReads=[];window.holderResponses=[];
   addEventListener('pageshow',event=>window.holderReturns.push(event.persisted));const original=fetch;
   window.fetch=async(...args)=>{
    const url=new URL(String(args[0]),location.href);
    if(url.pathname.startsWith(prefix+'/api/explorer/tokens/'+address)){
     window.holderReads.push(url.href);await new Promise(resolve=>setTimeout(resolve,2000));
     const response=await original(...args),data=await response.clone().json();
     window.holderResponses.push({url:url.href,data,status:response.headers.get('x-ink-data-status')});return response;
    }
    return original(...args);
   };return window.holderMarker;
  },{prefix,address});
  await page.goto(base+prefix+'/robots.txt',{waitUntil:'load'});await page.goBack({waitUntil:'commit'});
  await page.waitForFunction(()=>window.holderReturns?.includes(true));assert.equal(await page.evaluate(()=>window.holderMarker),marker);
  await page.waitForFunction(()=>[...document.querySelectorAll('.holder-row > strong > bdi')].length&&[...document.querySelectorAll('.holder-row > strong > bdi')].every(el=>el.textContent==='N/A'));
  assert.deepEqual(await identities(),saved);assert.equal(await page.locator('.section-picker select').inputValue(),'holders');
  await page.screenshot({path:`${out}/${prefix?'sepolia':'mainnet'}-${width}-pending.png`});
  await page.waitForFunction(()=>window.holderResponses?.length===2);await page.waitForFunction(()=>!document.querySelector('.holder-refresh-button')?.disabled);
  const snapshot=await page.evaluate(()=>({reads:window.holderReads,responses:window.holderResponses}));
  assert.deepEqual(snapshot.reads.sort(),[base+prefix+'/api/explorer/tokens/'+address,cursor].sort());assert(snapshot.responses.every(r=>r.status==='fresh'));
  const hasUpdates=await page.locator('.holder-refresh-button.has-updates').count();if(hasUpdates){assert.deepEqual(await identities(),saved);await page.locator('.holder-refresh-button').click();}
  const data=snapshot.responses.find(r=>r.url===cursor).data,profile=snapshot.responses.find(r=>r.url!==cursor).data;
  await page.waitForFunction(()=>document.querySelector('.holder-row > strong > bdi')?.textContent!=='N/A');
  assert.equal(await page.locator('.token-price strong').textContent(),tokenUsd(profile.exchange_rate,'fr','price'));
  assert.deepEqual(await identities(),data.items.map(item=>prefix+'/address/'+item.address.hash.toLowerCase()));
  assert.deepEqual(await page.locator('.holder-row > strong > bdi').allTextContents(),data.items.map(item=>formatChainAmount(item.value,profile.decimals??0,'fr',6)));
  assert(await page.locator('.token-list-controls .cursor-pagination button').first().isEnabled());assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);
  await page.screenshot({path:`${out}/${prefix?'sepolia':'mainnet'}-${width}-recovered.png`});row.passed=true;row.appliedUpdates=!!hasUpdates;row.requests=snapshot.reads.length;row.holders=data.items.length;
 }catch(error){row.error=error.stack;}finally{await context.close();}
 results.push(row);console.log(JSON.stringify(row));await writeFile(`${out}/results.json`,JSON.stringify({base,complete:false,results},null,2));
}}finally{await browser.close();}
await writeFile(`${out}/results.json`,JSON.stringify({base,complete:true,passed:results.every(row=>row.passed),realApi:true,realBFCache:true,delayedClientFetch:true,physicalDeviceTest:false,results},null,2));
if(results.some(row=>!row.passed))process.exitCode=1;
