import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
import {formatChainAmount} from '../src/explorer-data.ts';
const base=process.env.BASE_URL||'http://127.0.0.1:4317',out=process.env.INVENTORY_HISTORY_OUTPUT||'reports/account-inventory/history',results=[];
const accounts={'':'0xCDB1a51936011a8FaBb457a558582E92818d7ceD','/testnet':'0x5f2059D6a9F0FA2c67af88FB3877A7719CB5cC4b'};
await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox'],ignoreDefaultArgs:['--disable-back-forward-cache']});
try{for(const prefix of['','/testnet'])for(const width of[390,1440])for(const kind of['tokens','nft']){
 const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage(),row={prefix,width,kind,passed:false},errors=[];
 page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));const account=accounts[prefix],path=prefix+'/api/explorer/addresses/'+account+'/'+kind;
 const cards=()=>page.locator(kind==='tokens'?'.asset-row':'.nft-item');
 const identities=()=>cards().evaluateAll(es=>es.map(e=>new URL(e.href).pathname.toLowerCase()));
 const selector=kind==='tokens'?'.asset-row > span:nth-child(2) > strong > bdi':'.nft-holding-balance bdi';
 try{
  const firstResponse=page.waitForResponse(r=>new URL(r.url()).pathname===path);
  await page.goto(`${base}${prefix}/address/${account}?tab=${kind}&lang=fr`,{waitUntil:'domcontentloaded'});
  let response=await firstResponse,data=await response.json(),cursor=response.url();assert(data.items?.length);await cards().first().waitFor();
  if(data.next_page_params){const nextResponse=page.waitForResponse(r=>new URL(r.url()).pathname===path);await page.locator('.account-inventory .token-list-controls .cursor-pagination button').last().click();response=await nextResponse;data=await response.json();cursor=response.url();assert(data.items?.length);await page.waitForFunction(selector=>document.querySelectorAll(selector).length>0,kind==='tokens'?'.asset-row':'.nft-item');row.page=2;}else row.page=1;
  const saved=await identities();await page.waitForFunction(selector=>[...document.querySelectorAll(selector)].length&&[...document.querySelectorAll(selector)].every(el=>el.textContent!=='N/A'),selector);
  await page.waitForFunction(()=>document.querySelector('[data-live-transport]')?.getAttribute('data-live-transport')==='websocket');
  const marker=await page.evaluate(path=>{
   window.inventoryMarker=crypto.randomUUID();window.inventoryReturns=[];window.inventoryReads=[];window.inventoryResponses=[];
   addEventListener('pageshow',event=>window.inventoryReturns.push(event.persisted));const original=fetch;
   window.fetch=async(...args)=>{
    const url=new URL(String(args[0]),location.href);
    if(url.pathname===path){window.inventoryReads.push(url.href);await new Promise(resolve=>setTimeout(resolve,2000));const response=await original(...args),data=await response.clone().json();window.inventoryResponses.push({url:url.href,data,status:response.headers.get('x-ink-data-status')});return response;}
    return original(...args);
   };return window.inventoryMarker;
  },path);
  await page.goto(base+prefix+'/robots.txt',{waitUntil:'load'});await page.goBack({waitUntil:'commit'});
  await page.waitForFunction(()=>window.inventoryReturns?.includes(true));assert.equal(await page.evaluate(()=>window.inventoryMarker),marker);
  await page.waitForFunction(selector=>[...document.querySelectorAll(selector)].length&&[...document.querySelectorAll(selector)].every(el=>el.textContent==='N/A'),selector);
  assert.deepEqual(await identities(),saved);assert.equal(await page.locator('.section-picker select').inputValue(),kind);
  await page.screenshot({path:`${out}/${prefix?'sepolia':'mainnet'}-${width}-${kind}-pending.png`});
  await page.waitForFunction(()=>window.inventoryResponses?.length===1);await page.waitForFunction(()=>!document.querySelector('.inventory-refresh-button')?.disabled);
  const snapshot=await page.evaluate(()=>({reads:window.inventoryReads,responses:window.inventoryResponses}));assert.deepEqual(snapshot.reads,[cursor]);assert.equal(snapshot.responses[0].status,'fresh');
  const update=await page.locator('.inventory-refresh-button.has-updates').count();if(update){assert.deepEqual(await identities(),saved);await page.locator('.inventory-refresh-button').click();}
  await page.waitForFunction(selector=>[...document.querySelectorAll(selector)].length&&[...document.querySelectorAll(selector)].every(el=>el.textContent!=='N/A'),selector);
  const items=snapshot.responses[0].data.items;
  assert.deepEqual(await identities(),items.map(item=>prefix+'/token/'+item.token.address_hash.toLowerCase()+(kind==='nft'?'/instance/'+item.id:'')));
  assert.deepEqual(await page.locator(selector).allTextContents(),items.map(item=>formatChainAmount(item.value,kind==='nft'?0:item.token.decimals??0,'fr',kind==='nft'?undefined:6)));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);
  await page.screenshot({path:`${out}/${prefix?'sepolia':'mainnet'}-${width}-${kind}-recovered.png`});row.passed=true;row.appliedUpdates=!!update;row.requests=snapshot.reads.length;row.items=items.length;
 }catch(error){row.error=error.stack;await page.screenshot({path:`${out}/failure-${prefix?'sepolia':'mainnet'}-${width}-${kind}.png`}).catch(()=>{});}finally{await context.close();}
 results.push(row);console.log(JSON.stringify(row));await writeFile(`${out}/results.json`,JSON.stringify({base,complete:false,results},null,2));
}}finally{await browser.close();}
await writeFile(`${out}/results.json`,JSON.stringify({base,complete:true,passed:results.every(row=>row.passed),realApi:true,realBFCache:true,delayedClientFetch:true,physicalDeviceTest:false,results},null,2));
if(results.some(row=>!row.passed))process.exitCode=1;
