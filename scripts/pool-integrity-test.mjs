import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4311',out=process.env.POOL_INTEGRITY_OUTPUT||'reports/pool-freshness/integrity',results=[];
const id=n=>'0x'+n.toString(16).padStart(64,'0');
await mkdir(out,{recursive:true});
const b=await chromium.launch({args:['--no-sandbox']});
try{for(const prefix of ['','/testnet'])for(const scenario of ['duplicate','cycle','invalid','wrong-chain','unknown-values','missing-date','mixed-age','navigation']){
 const c=await b.newContext({viewport:{width:390,height:900}}),p=await c.newPage(),r={prefix,scenario,passed:false},held=[];
 let now=Date.now(),calls=0,mode=scenario;
 const market=(n,value='10001')=>({pool_id:id(n),chain_id:mode==='wrong-chain'?1:prefix?763373:57073,is_contract:false,base_token_symbol:'AAA'+n,quote_token_symbol:'BBB',base_token_address:'0x'+'1'.repeat(40),quote_token_address:'0x'+'2'.repeat(40),liquidity:mode==='unknown-values'?'Infinity':value,volume_usd_24h:mode==='unknown-values'?'NaN':'2000',fee:mode==='unknown-values'?-1:null});
 await c.routeWebSocket(/\/api\/live$/,ws=>ws.close());
 await c.route('**/api/**',route=>{
  const u=new URL(route.request().url());
  if(!u.pathname.includes('/contract-info/pools'))return route.fulfill({status:503,json:{error:'Controlled other source'}});
  calls++;if(mode==='hold'){held.push(route);return;}
  const second=u.searchParams.has('page_token');
  let data=scenario==='navigation'?market(Number(BigInt(u.pathname.split('/').at(-1)))):{items:[market(1)],next_page_params:null};
  if(mode==='invalid')data={items:{invalid:true}};
  if(['duplicate','mixed-age'].includes(mode))data={items:second?[market(1,'99999'),market(3)]:[market(1),market(2)],next_page_params:second?null:{page_token:'next'}};
  if(mode==='cycle')data={items:[],next_page_params:calls%2?{page_size:100,page_token:'same'}:{page_token:'same',page_size:100}};
  const headers=mode==='missing-date'?{}:{date:new Date(now).toUTCString(),'x-ink-data-status':'fresh','x-ink-data-fetched-at':new Date(now-(mode==='mixed-age'&&!second?85000:0)).toISOString()};
  return route.fulfill({headers,json:data});
 });
 try{
  p.setDefaultTimeout(10000);await p.clock.install({time:new Date(now)});
  await p.goto(base+prefix+'/pools'+(scenario==='navigation'?'/'+id(1):'')+'?lang=en&sort=liquidity');
  if(['cycle','invalid','wrong-chain','missing-date'].includes(scenario)){
   await p.getByRole('alert').waitFor();assert.equal(await p.locator('.pool-row').count(),0);
   assert.equal(await p.locator('.pool-result-bar strong').innerText(),'N/A pools');
   if(scenario==='cycle')assert(calls<=3,'Repeated cursors should stop promptly');
   mode='fresh';await p.getByRole('button',{name:'Retry',exact:true}).click();
   await p.locator('.pool-row').waitFor();assert.equal(await p.locator('.pool-result-bar strong').innerText(),'1 pools');
  }else if(scenario==='unknown-values'){
   await p.locator('.pool-row').waitFor();assert.deepEqual(await p.locator('.pool-row > strong').allInnerTexts(),['N/A','N/A']);
   assert.equal(await p.locator('.pool-result-bar strong').innerText(),'1 pools');
  }else if(scenario==='navigation'){
   await p.locator('.pool-hero').waitFor();mode='hold';now+=10001;await p.clock.fastForward(10001);await p.waitForTimeout(80);
   assert.equal(held.length,1);
   await p.evaluate(path=>{history.pushState({},'',path);dispatchEvent(new PopStateEvent('popstate'));},prefix+'/pools/'+id(2)+'?lang=en');
   await p.waitForFunction(()=>!document.querySelector('.pool-hero'));
   await p.waitForTimeout(100);assert.equal(held.length,2);
   const headers={date:new Date(now).toUTCString(),'x-ink-data-status':'fresh','x-ink-data-fetched-at':new Date(now).toISOString()};
   await held[0].fulfill({headers,json:market(1,'99999')}).catch(()=>{});
   await p.waitForTimeout(100);assert.equal(await p.locator('.pool-hero').count(),0);
   await held[1].fulfill({headers,json:market(2,'50000')});await p.locator('.pool-hero').waitFor();
   assert.match(await p.locator('h1').innerText(),/AAA2/);
   assert.equal(await p.locator('.address-summary .metric > strong').first().innerText(),'$50,000');
  }else{
   await p.locator('.pool-row').first().waitFor();assert.equal(await p.locator('.pool-row').count(),3);
   assert.equal(await p.locator('.pool-result-bar strong').innerText(),'3 pools');
   assert.equal(await p.locator('.pool-row').first().getAttribute('data-pool-id'),id(1));
   if(scenario==='mixed-age'){
    now+=6001;await p.clock.fastForward(6001);
    await p.waitForFunction(()=>document.querySelector('.pool-result-bar strong')?.textContent==='N/A pools');
    assert((await p.locator('.pool-row > strong').allInnerTexts()).every(t=>t==='N/A'));
   }
  }
  r.calls=calls;r.passed=true;
 }catch(e){r.error=e.stack;}finally{for(const route of held)await route.abort().catch(()=>{});await c.close();}
 results.push(r);console.log(JSON.stringify(r));await writeFile(`${out}/results.json`,JSON.stringify({base,complete:false,results},null,2));
}}finally{await b.close();}
await writeFile(`${out}/results.json`,JSON.stringify({base,complete:true,passed:results.every(r=>r.passed),mockedApi:true,results},null,2));
if(results.some(r=>!r.passed))process.exitCode=1;
