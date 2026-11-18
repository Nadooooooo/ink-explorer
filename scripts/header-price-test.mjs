import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';

const base=process.env.BASE_URL||'http://127.0.0.1:4312';
const out=process.env.HEADER_OUTPUT||'reports/header-price/browser',baseline=process.env.HEADER_BASELINE==='1',results=[];
await mkdir(out,{recursive:true});
for(const engine of (process.env.HEADER_ENGINES||'chromium,firefox,webkit').split(',')){
 const browser=await({chromium,firefox,webkit})[engine].launch(engine==='chromium'?{args:['--no-sandbox']}:{});
 try{for(const prefix of baseline?['']:['','/testnet'])for(const[width,locale]of baseline?[[390,'en']]:[[320,'en'],[390,'fr'],[1440,'ar']]){
  const context=await browser.newContext({viewport:{width,height:900},colorScheme:width<400?'dark':'light'}),page=await context.newPage();
  const row={engine,prefix,width,locale,baseline,passed:false},errors=[],held=[];
  let now=Date.now(),mode='fresh',quote='2434.78',calls=0;
  page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error.message));
  const headers=()=>mode==='undated'?{}:{date:new Date(now).toUTCString(),'x-ink-data-status':mode==='stale'?'stale':'fresh','x-ink-data-fetched-at':new Date(now-({old:180000,aging:85000,flight:20000}[mode]||0)).toISOString()};
  await context.routeWebSocket(/\/api\/live$/,ws=>ws.close());
  await context.route('**/api/**',route=>{
   const url=new URL(route.request().url()),path=url.pathname.replace(/^\/testnet/,'');
   if(path==='/api/explorer/stats'){
    calls++;if(mode==='hold'){held.push(route);return;}
    return route.fulfill({status:mode==='error'?503:200,headers:headers(),json:mode==='malformed'?[]:mode==='error'?{error:'Controlled source failure'}:{coin_price:quote}});
   }
   if(path==='/api/explorer/tokens')return route.fulfill({json:{items:[],next_page_params:null}});
   return route.fulfill({status:503,json:{error:'Controlled unrelated source'}});
  });
  const label=page.locator('.market-eth strong');
  const waitText=async text=>page.waitForFunction(text=>document.querySelector('.market-eth strong')?.textContent===text,text);
  const price=async(value=quote)=>page.evaluate(({locale,value})=>new Intl.NumberFormat(locale,{style:'currency',currency:'USD',currencyDisplay:'narrowSymbol',maximumFractionDigits:2}).format(Number(value)),{locale,value});
  const tick=async ms=>{now+=ms;await page.clock.fastForward(ms);await page.waitForTimeout(100);};
  const fresh=async()=>{mode='fresh';quote=String(Number(quote||0)+1);await tick(60001);await waitText(await price());};
  const hidden=async value=>page.evaluate(value=>{if(value)Object.defineProperty(document,'hidden',{configurable:true,value:true});else delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));},value);
  try{
   await page.clock.install({time:new Date(now)});
   await page.goto(`${base}${prefix}/tokens?lang=${locale}`,{waitUntil:'domcontentloaded'});
   await page.locator('.token-directory .empty').waitFor();
   if(prefix){
    const testnet=await label.textContent();assert(testnet&&testnet!=='N/A'&&!testnet.includes('$'));
    await tick(180001);assert.equal(calls,0,'Sepolia should not request an unused ETH market quote');assert.equal(await label.textContent(),testnet);
   }else{
    await waitText(await price());
    if(baseline){
     mode='stale';quote='9999';await tick(60001);await waitText(await price());
     await context.setOffline(true);assert.equal(await label.textContent(),await price());
     row.reproduced=['Stale header quote accepted','Price remains visible offline'];
    }else{
     for(const invalid of ['error','stale','old','undated','malformed']){
      mode=invalid;await tick(60001);await waitText('N/A');await fresh();
     }
     for(const invalid of [null,' ',false,-1,'0x10','1e-400',{}]){
      quote=invalid;await tick(60001);await waitText('N/A');
     }
     for(const zero of [0,'0']){quote=zero;await tick(60001);await waitText(await price());}
     quote='1e-10';await tick(60001);
     const tiny=await page.evaluate(locale=>'< '+new Intl.NumberFormat(locale,{style:'currency',currency:'USD',currencyDisplay:'narrowSymbol',minimumFractionDigits:0,maximumFractionDigits:2}).format(.01),locale);await waitText(tiny);
     quote='2434.78';mode='aging';await tick(60001);await waitText(await price());
     const before=calls;mode='hold';await tick(6001);await waitText('N/A');assert.equal(calls,before,'Expiry must not wait for the next request');
     await fresh();
     mode='flight';await tick(60001);await waitText(await price());
     mode='hold';await tick(60001);assert(held.length);await tick(11001);await waitText('N/A');
     await context.setOffline(true);mode='fresh';quote='3333.25';await context.setOffline(false);await waitText(await price());
     await context.setOffline(true);await waitText('N/A');
     quote='3456.75';await context.setOffline(false);await waitText(await price());
     await hidden(true);await waitText('N/A');const paused=calls;
     await tick(180001);assert.equal(calls,paused,'No polling while hidden');
     mode='hold';await hidden(false);await waitText('N/A');await page.waitForTimeout(100);
     const cancelled=held.at(-1);assert(cancelled);
     await hidden(true);mode='fresh';quote='4567.89';await hidden(false);await waitText(await price());
     await cancelled.fulfill({headers:headers(),json:{coin_price:'99999'}}).catch(()=>{});
     await page.waitForTimeout(100);assert.equal(await label.textContent(),await price(),'Cancelled request must not replace the new quote');
     // A burst of resume/focus events must not create multiple requests.
     const resumed=calls;await page.evaluate(()=>{dispatchEvent(new Event('focus'));dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));document.dispatchEvent(new Event('visibilitychange'));});
     await page.waitForTimeout(100);assert.equal(calls,resumed);
    }
   }
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   assert.deepEqual(errors,[]);
   await page.screenshot({path:`${out}/${engine}-${prefix?'sepolia':'mainnet'}-${width}.png`});
   row.passed=true;row.requests=calls;
  }catch(error){row.error=error.stack;await page.screenshot({path:`${out}/failure-${engine}-${prefix?'sepolia':'mainnet'}-${width}.png`}).catch(()=>{});}
  finally{for(const route of held)await route.abort().catch(()=>{});await context.close();}
  results.push(row);console.log(JSON.stringify(row));await writeFile(`${out}/results.json`,JSON.stringify({base,complete:false,results},null,2));
 }}finally{await browser.close();}
}
await writeFile(`${out}/results.json`,JSON.stringify({base,complete:true,passed:results.every(row=>row.passed),baseline,mockedApi:true,physicalDeviceTest:false,results},null,2));
if(results.some(row=>!row.passed))process.exitCode=1;
