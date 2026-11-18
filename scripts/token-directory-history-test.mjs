import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4314',out=process.env.DIRECTORY_HISTORY_OUTPUT||'reports/token-directory-current/history',results=[];
await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox'],ignoreDefaultArgs:['--disable-back-forward-cache']});
try{for(const prefix of['','/testnet'])for(const width of[390,1440]){
 const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage(),row={prefix,width,passed:false},errors=[];
 page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));
 const names=()=>page.locator('.token-row').evaluateAll(es=>es.map(e=>new URL(e.href).pathname));
 try{
  await page.goto(base+prefix+'/tokens?lang=fr&type=ERC-20&sort=holders_count',{waitUntil:'domcontentloaded'});
  await page.locator('.token-row').first().waitFor();
  const nextResponse=page.waitForResponse(response=>new URL(response.url()).pathname===prefix+'/api/explorer/tokens');
  await page.locator('.token-list-controls .cursor-pagination button').last().click();
  const response=await nextResponse,data=await response.json();assert(data.items?.length);
  await page.locator(`.token-row[href*="/token/${data.items[0].address_hash}?"]`).waitFor();
  const saved=await names(),cursor=response.url();
  await page.waitForFunction(()=>document.querySelector('[data-live-transport]')?.getAttribute('data-live-transport')==='websocket');
  const marker=await page.evaluate(prefix=>{
   window.directoryMarker=crypto.randomUUID();window.directoryReturns=[];window.directoryReads=[];window.directoryResults=[];
   addEventListener('pageshow',event=>window.directoryReturns.push(event.persisted));const original=fetch;
   window.fetch=async(...args)=>{
    const url=new URL(String(args[0]),location.href);
    if(url.pathname===prefix+'/api/explorer/tokens'){
     window.directoryReads.push(url.href);await new Promise(resolve=>setTimeout(resolve,2000));
     const response=await original(...args),data=await response.clone().json();
     window.directoryResults.push({data,status:response.headers.get('x-ink-data-status')});return response;
    }
    return original(...args);
   };
   return window.directoryMarker;
  },prefix);
  await page.goto(base+prefix+'/robots.txt',{waitUntil:'load'});await page.goBack({waitUntil:'commit'});
  await page.waitForFunction(()=>window.directoryReturns?.includes(true));assert.equal(await page.evaluate(()=>window.directoryMarker),marker);
  await page.waitForFunction(()=>[...document.querySelectorAll('.token-row > span:not(.token-name) bdi')].every(e=>e.textContent==='N/A'));
  assert.deepEqual(await names(),saved);assert.equal(await page.locator('.token-directory-filters select').first().inputValue(),'ERC-20');
  await page.screenshot({path:`${out}/${prefix?'sepolia':'mainnet'}-${width}-pending.png`});
  await page.waitForFunction(()=>window.directoryResults?.length===1);
  await page.waitForFunction(()=>!document.querySelector('.token-refresh-button')?.disabled);
  const updated=await page.locator('.token-refresh-button.has-updates').count();
  if(updated){assert.deepEqual(await names(),saved);await page.locator('.token-refresh-button').click();}
  const snapshot=await page.evaluate(()=>({reads:window.directoryReads,results:window.directoryResults}));
  assert.deepEqual(snapshot.reads,[cursor]);assert.equal(snapshot.results[0].status,'fresh');
  const expected=snapshot.results[0].data.items.map(token=>prefix+'/token/'+token.address_hash);
  await page.waitForFunction(path=>document.querySelector('.token-row')&&new URL(document.querySelector('.token-row').href).pathname===path,expected[0]);
  assert.deepEqual(await names(),expected);assert(await page.locator('.token-list-controls .cursor-pagination button').first().isEnabled());
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);
  await page.screenshot({path:`${out}/${prefix?'sepolia':'mainnet'}-${width}-recovered.png`});
  row.passed=true;row.appliedUpdate=!!updated;row.requests=snapshot.reads.length;
 }catch(error){row.error=error.stack;}finally{await context.close();}
 results.push(row);console.log(JSON.stringify(row));await writeFile(`${out}/results.json`,JSON.stringify({base,complete:false,results},null,2));
}}finally{await browser.close();}
await writeFile(`${out}/results.json`,JSON.stringify({base,complete:true,passed:results.every(row=>row.passed),realApi:true,realBFCache:true,delayedClientFetch:true,results},null,2));
if(results.some(row=>!row.passed))process.exitCode=1;
