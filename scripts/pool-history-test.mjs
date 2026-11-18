import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4311',out=process.env.POOL_HISTORY_OUTPUT||'reports/pool-freshness/history',results=[];
await mkdir(out,{recursive:true});
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox'],ignoreDefaultArgs:['--disable-back-forward-cache']});
try{for(const prefix of ['','/testnet']){
 const catalogue=await(await fetch(`${base}${prefix}/api/contract-info/pools?page_size=100`)).json();
 const id=catalogue.items?.find(p=>/^0x[0-9a-f]{40}$/i.test(p.pool_id)&&p.is_contract!==false)?.pool_id;
 for(const width of [390,1440])for(const detail of id?[false,true]:[false]){
  const c=await b.newContext({viewport:{width,height:900}}),p=await c.newPage(),row={prefix,width,detail,passed:false},reasons=[];
  p.setDefaultTimeout(30000);
  const cdp=await c.newCDPSession(p);await cdp.send('Page.enable');cdp.on('Page.backForwardCacheNotUsed',e=>reasons.push(e));
  const ready=()=>p.waitForFunction(detail=>{
   const values=detail?[...document.querySelectorAll('.address-summary .metric > strong')]:[document.querySelector('.pool-result-bar strong')];
   return values.length&&values.every(e=>e&&!e.textContent.includes('N/A'));
  },detail);
  try{
   await p.goto(`${base}${prefix}/pools${detail?'/'+id:'?sort=liquidity&order=asc&q=US'}`,{waitUntil:'domcontentloaded'});
   await ready();await p.waitForFunction(()=>document.querySelector('[data-live-transport]')?.getAttribute('data-live-transport')==='websocket');
   const filters=detail?[]:await p.locator('.pool-workbench select').evaluateAll(es=>es.map(e=>e.value));
   const marker=await p.evaluate(()=>{
    window.poolMarker=crypto.randomUUID();window.poolReturns=[];window.poolReads=[];
    addEventListener('pageshow',event=>window.poolReturns.push(event.persisted));
    const original=fetch;window.fetch=async(...args)=>{
     if(/\/api\/(?:contract-info\/pools|explorer\/addresses\/)/.test(String(args[0]))){
      window.poolReads.push(String(args[0]));await new Promise(resolve=>setTimeout(resolve,2000));
     }
     return original(...args);
    };
    return window.poolMarker;
   });
   await p.goto(base+prefix+'/robots.txt',{waitUntil:'load'});await p.goBack({waitUntil:'commit'});
   await p.waitForFunction(()=>window.poolReturns?.includes(true));
   assert.equal(await p.evaluate(()=>window.poolMarker),marker,'The original document must be restored from BFCache');
   await p.waitForFunction(detail=>document.querySelector(detail?'.address-summary .metric > strong':'.pool-result-bar strong')?.textContent.includes('N/A'),detail);
   await p.screenshot({path:`${out}/${prefix?'sepolia':'mainnet'}-${width}-${detail?'detail':'directory'}-pending.png`});
   await ready();row.reads=await p.evaluate(()=>window.poolReads);
   assert.equal(new Set(row.reads).size,row.reads.length,'Resume creates overlapping reads of the same resource');
   if(!detail){
    assert.equal(await p.locator('.pool-search input').inputValue(),'US');
    assert.deepEqual(await p.locator('.pool-workbench select').evaluateAll(es=>es.map(e=>e.value)),filters);
   }
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   await p.screenshot({path:`${out}/${prefix?'sepolia':'mainnet'}-${width}-${detail?'detail':'directory'}.png`});
   row.passed=true;
  }catch(e){row.error=e.stack;row.reasons=reasons;}finally{await c.close();}
  results.push(row);console.log(JSON.stringify(row));await writeFile(`${out}/results.json`,JSON.stringify({base,complete:false,results},null,2));
 }
}}finally{await b.close();}
await writeFile(`${out}/results.json`,JSON.stringify({base,complete:true,passed:results.every(r=>r.passed),realApi:true,delayedClientFetch:true,realBFCache:true,results},null,2));
if(results.some(r=>!r.passed))process.exitCode=1;
