import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'https://inkexplorer.xyz',out='reports/pool-freshness/baseline',id='0x'+'a'.repeat(64),results=[];
await mkdir(out,{recursive:true});
const b=await chromium.launch({args:['--no-sandbox']});
try{for(const detail of [false,true])for(const scenario of ['old','expiry','offline',...(detail?['poll']:[])]){
 const c=await b.newContext(),p=await c.newPage(),r={detail,scenario,passed:false};
 let now=Date.now(),calls=0;
 await c.routeWebSocket(/\/api\/live$/,ws=>ws.close());
 await c.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.includes('/contract-info/pools')){
   calls++;
   const item={pool_id:id,chain_id:'57073',is_contract:false,base_token_symbol:'AAA',quote_token_symbol:'BBB',base_token_address:'0x'+'1'.repeat(40),quote_token_address:'0x'+'2'.repeat(40),liquidity:'12345',volume_usd_24h:'4321',fee:'0.05',dex:{name:'Fixture DEX'}};
   return route.fulfill({headers:{date:new Date(now).toUTCString(),'x-ink-data-status':'fresh','x-ink-data-fetched-at':new Date(now-(scenario==='old'?180000:scenario==='expiry'?85000:0)).toISOString()},json:detail?item:{items:[item],next_page_params:null}});
  }
  return route.fulfill({status:503,json:{error:'Controlled unavailable source'}});
 });
 try{
  await p.clock.install({time:new Date(now)});
  await p.goto(base+'/pools'+(detail?'/'+id:'')+'?lang=en');
  const value=p.locator(detail?'.address-summary .metric > strong':'.pool-row > strong').first();
  await value.waitFor();assert.match(await value.innerText(),/12,345/);
  if(scenario==='expiry'){now+=6001;await p.clock.fastForward(6001);}
  if(scenario==='offline')await p.evaluate(()=>dispatchEvent(new Event('offline')));
  if(scenario==='poll'){now+=61000;await p.clock.fastForward(61000);assert.equal(calls,1);}
  assert.match(await value.innerText(),/12,345/);
  r.reproduced=scenario==='poll'?'Pool detail never polls':`Visible amount survives ${scenario}`;
  r.calls=calls;r.passed=true;
  await p.screenshot({path:`${out}/${detail?'detail':'directory'}-${scenario}.png`});
 }catch(e){r.error=e.stack;}finally{await c.close();}
 results.push(r);console.log(JSON.stringify(r));
}}finally{await b.close();}
await writeFile(`${out}/results.json`,JSON.stringify({base,complete:true,passed:results.every(x=>x.passed),results},null,2));
if(results.some(x=>!x.passed))process.exitCode=1;
