import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
import {formatChainAmount} from '../src/explorer-data.ts';
const base=process.env.BASE_URL||'http://127.0.0.1:4315',out=process.env.ADDRESS_HISTORY_OUTPUT||'reports/address-snapshots/history',results=[];
const address='0x4200000000000000000000000000000000000006';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox'],ignoreDefaultArgs:['--disable-back-forward-cache']});
try{for(const prefix of['','/testnet'])for(const width of[390,1440]){
 const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage(),row={prefix,width,passed:false},errors=[];
 page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));
 const identities=()=>page.locator('.address-activity .tx-row').evaluateAll(es=>es.map(el=>el.querySelector('a[href*="/tx/"]')?.getAttribute('href')));
 try{
  await page.goto(`${base}${prefix}/address/${address}?lang=fr`,{waitUntil:'domcontentloaded'});
  await page.locator('.address-activity .tx-row').first().waitFor();const initial=await identities();
  await page.locator('.address-pagination button').click();
  await page.waitForFunction(count=>document.querySelectorAll('.address-activity .tx-row').length>count,initial.length);
  const saved=await identities();
  const ready=()=>page.waitForFunction(()=>[...document.querySelectorAll('.address-summary .metric > strong')].length===3&&[...document.querySelectorAll('.address-summary .metric > strong')].every(el=>el.textContent!=='N/A'));
  await ready();await page.waitForFunction(()=>document.querySelector('[data-live-transport]')?.getAttribute('data-live-transport')==='websocket');
  const marker=await page.evaluate(({prefix,address})=>{
   window.accountMarker=crypto.randomUUID();window.accountReturns=[];window.accountReads=[];window.accountResponses=[];
   addEventListener('pageshow',event=>window.accountReturns.push(event.persisted));
   const original=fetch;
   window.fetch=async(...args)=>{
    const path=new URL(String(args[0]),location.href).pathname;
    if(path.startsWith(prefix+'/api/explorer/addresses/'+address)){
     window.accountReads.push(path);await new Promise(resolve=>setTimeout(resolve,2000));
     const response=await original(...args),data=await response.clone().json();
     window.accountResponses.push({path,data,status:response.headers.get('x-ink-data-status')});return response;
    }
    return original(...args);
   };
   return window.accountMarker;
  },{prefix,address});
  await page.goto(base+prefix+'/robots.txt',{waitUntil:'load'});await page.goBack({waitUntil:'commit'});
  await page.waitForFunction(()=>window.accountReturns?.includes(true));assert.equal(await page.evaluate(()=>window.accountMarker),marker);
  await page.waitForFunction(()=>[...document.querySelectorAll('.address-summary .metric > strong')].every(el=>el.textContent==='N/A'));
  assert.equal(await page.locator('.section-picker select').inputValue(),'transactions');assert.deepEqual(await identities(),saved);
  await page.screenshot({path:`${out}/${prefix?'sepolia':'mainnet'}-${width}-pending.png`});await ready();
  const snapshot=await page.evaluate(()=>({reads:window.accountReads,responses:window.accountResponses}));
  const root=prefix+'/api/explorer/addresses/'+address;
  assert.deepEqual(snapshot.reads.sort(),[root,root+'/counters',root+'/token-balances'].sort());
  assert.equal(snapshot.responses.length,3);assert(snapshot.responses.every(response=>response.status==='fresh'));
  const profile=snapshot.responses.find(response=>response.path===root).data;
  const counts=snapshot.responses.find(response=>response.path===root+'/counters').data;
  const assets=snapshot.responses.find(response=>response.path===root+'/token-balances').data;
  assert.deepEqual(await page.locator('.address-summary .metric > strong').allTextContents(),[
   formatChainAmount(profile.coin_balance,18,'fr',6)+' ETH',formatChainAmount(counts.transactions_count,0,'fr'),new Intl.NumberFormat('fr').format(Array.isArray(assets)?assets.length:assets.items.length),
  ]);
  assert.deepEqual(await identities(),saved);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);
  await page.screenshot({path:`${out}/${prefix?'sepolia':'mainnet'}-${width}-recovered.png`});row.passed=true;row.requests=snapshot.reads.length;row.retainedTransactions=saved.length;
 }catch(error){row.error=error.stack;}finally{await context.close();}
 results.push(row);console.log(JSON.stringify(row));await writeFile(`${out}/results.json`,JSON.stringify({base,complete:false,results},null,2));
}}finally{await browser.close();}
await writeFile(`${out}/results.json`,JSON.stringify({base,complete:true,passed:results.every(row=>row.passed),realApi:true,realBFCache:true,delayedClientFetch:true,physicalDeviceTest:false,results},null,2));
if(results.some(row=>!row.passed))process.exitCode=1;
