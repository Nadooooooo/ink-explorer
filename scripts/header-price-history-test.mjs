import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4312',out=process.env.HEADER_HISTORY_OUTPUT||'reports/header-price/history',results=[];
await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox'],ignoreDefaultArgs:['--disable-back-forward-cache']});
try{for(const width of[320,1440]){
 const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),row={width,passed:false},errors=[];
 page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));
 try{
  await page.goto(base+'/tokens?lang=fr',{waitUntil:'domcontentloaded'});
  const ready=()=>page.waitForFunction(()=>document.querySelector('.market-eth strong')?.textContent.includes('$'));
  await ready();await page.waitForFunction(()=>document.querySelector('[data-live-transport]')?.getAttribute('data-live-transport')==='websocket');
  const marker=await page.evaluate(()=>{
   window.priceMarker=crypto.randomUUID();window.priceReturns=[];window.priceReads=[];window.priceResponses=[];
   addEventListener('pageshow',event=>window.priceReturns.push(event.persisted));
   const original=fetch;
   window.fetch=async(...args)=>{
    if(new URL(String(args[0]),location.href).pathname==='/api/explorer/stats'){
     window.priceReads.push(String(args[0]));await new Promise(resolve=>setTimeout(resolve,2000));
     const response=await original(...args),data=await response.clone().json();
     window.priceResponses.push({quote:data.coin_price,status:response.headers.get('x-ink-data-status')});
     return response;
    }
    return original(...args);
   };
   return window.priceMarker;
  });
  await page.goto(base+'/robots.txt',{waitUntil:'load'});await page.goBack({waitUntil:'commit'});
  await page.waitForFunction(()=>window.priceReturns?.includes(true));
  assert.equal(await page.evaluate(()=>window.priceMarker),marker);
  await page.waitForFunction(()=>document.querySelector('.market-eth strong')?.textContent==='N/A');
  await page.screenshot({path:`${out}/${width}-pending.png`});await ready();
  const snapshot=await page.evaluate(()=>({reads:window.priceReads,responses:window.priceResponses}));
  assert.equal(snapshot.reads.length,1);assert.equal(snapshot.responses.length,1);assert.equal(snapshot.responses[0].status,'fresh');
  const expected=await page.evaluate(value=>new Intl.NumberFormat('fr',{style:'currency',currency:'USD',currencyDisplay:'narrowSymbol',maximumFractionDigits:2}).format(Number(value)),snapshot.responses[0].quote);
  assert.equal(await page.locator('.market-eth strong').textContent(),expected);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);
  await page.screenshot({path:`${out}/${width}-recovered.png`});row.passed=true;row.price=expected;row.requests=snapshot.reads.length;
 }catch(error){row.error=error.stack;}finally{await context.close();}
 results.push(row);console.log(JSON.stringify(row));await writeFile(`${out}/results.json`,JSON.stringify({base,complete:false,results},null,2));
}}finally{await browser.close();}
await writeFile(`${out}/results.json`,JSON.stringify({base,complete:true,passed:results.every(row=>row.passed),realApi:true,realBFCache:true,delayedClientFetch:true,results},null,2));
if(results.some(row=>!row.passed))process.exitCode=1;
