import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright-core';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import axe from 'axe-core';
const base=process.env.BASE_URL||'http://127.0.0.1:4212',out=process.env.MARKET_SCOPE_OUTPUT||'reports/market-scope/browser';
const address='0x'+'a'.repeat(40),results=[];
await mkdir(out,{recursive:true});
for(const engine of [chromium,webkit]) {
 const browser=await engine.launch(engine===chromium?{args:['--no-sandbox']}:{});
 try {for(const prefix of ['', '/testnet'])for(const [width,locale] of [[320,'fr'],[390,'ar'],[1440,'en']]) {
  const context=await browser.newContext({viewport:{width,height:900},bypassCSP:true}),page=await context.newPage(),errors=[];
  const dict=JSON.parse(await readFile(`src/locales/${locale}.json`,'utf8'));
  let now=Date.now(),price='2',supply='1000000',decimals='6',mode='fresh';
  const token=()=>({address_hash:address,chain_id:prefix?763373:57073,name:'Scope test',symbol:'SCOPE',type:'ERC-20',decimals,total_supply:supply,exchange_rate:price,circulating_market_cap:'1000000000',volume_24h:'9000000000',holders_count:'10'});
  page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date(now)});
  await context.routeWebSocket(/\/api\/live$/,ws=>ws.close());
  await context.route('**/api/**',route=>{
   const path=new URL(route.request().url()).pathname.replace(/^\/testnet/,'');
   const headers={'x-ink-data-status':mode,'x-ink-data-fetched-at':new Date(now).toISOString(),date:new Date(now).toUTCString()};
   if(path==='/api/explorer/tokens')return route.fulfill({headers,json:{items:[token()],next_page_params:null}});
   if(path==='/api/explorer/tokens/'+address)return route.fulfill({headers,json:token()});
   if(path.endsWith('/transfers'))return route.fulfill({headers,json:{items:[]}});
   return route.fulfill({status:503,json:{error:'Controlled unrelated source'}});
  });
  try {
   await page.goto(base+prefix+'/tokens?lang='+locale);
   const row=page.locator('.token-row');await row.waitFor();
   const currency=number=>new Intl.NumberFormat(locale,{style:'currency',currency:'USD',currencyDisplay:'narrowSymbol',maximumFractionDigits:2}).format(number);
   assert.equal(await row.locator(':scope > span').last().getAttribute('title'),currency(2));
   assert.equal(await page.locator('option[value="circulating_market_cap:desc"]').textContent(),dict['Circulating cap']);
   await row.click();await page.locator('.token-summary').waitFor();
   const card=page.locator('.token-summary .metric').nth(2),value=card.locator(':scope > strong'),volume=page.locator('.token-summary .metric').nth(3);
   assert.equal(await value.innerText(),currency(2));
   await card.getByRole('button').click();await page.locator('.info-floating').filter({hasText:dict['This market cap may include other networks.']}).waitFor();
   assert((await page.locator('.info-floating').innerText()).includes(currency(1000000000)));
   await page.keyboard.press('Escape');
   await volume.getByRole('button').click();await page.getByText(dict['Trading volume reported by the token price source across its tracked markets. This is not the value transferred on Ink.'],{exact:true}).waitFor();
   await page.addScriptTag({content:axe.source});
   const violations=await page.evaluate(async()=>(await axe.run(document)).violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>v.id));assert.deepEqual(violations,[]);
   await page.screenshot({path:`${out}/${engine.name()}-${prefix?'sepolia':'mainnet'}-${width}.png`});await page.keyboard.press('Escape');
   const refresh=async expected=>{now+=60001;await page.clock.fastForward(60001);await page.waitForFunction(expected=>document.querySelectorAll('.token-summary .metric > strong')[2]?.textContent===expected,expected);};
   price=null;await refresh('N/A');
   price='2';supply='invalid';await refresh('N/A');
   supply='1000000';decimals=null;await refresh('N/A');
   decimals='6';supply='0';await refresh(currency(0));
   supply='1000000';mode='stale';await refresh('N/A');
   mode='fresh';await refresh(currency(2));
   assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   results.push({engine:engine.name(),prefix,width,locale,passed:true,checks:'list/detail Ink valuation, explicit circulating sort, reported cap in help, market volume scope, unknown price/supply/precision, zero supply, stale expiry and recovery, accessibility and layout'});
   console.log('PASS',engine.name(),prefix||'mainnet',width);
  }catch(error){await page.screenshot({path:`${out}/failure-${engine.name()}-${prefix?'sepolia':'mainnet'}-${width}.png`}).catch(()=>{});throw error;}
  finally {await context.close();}
 }}finally {await browser.close();}
}
await writeFile(out+'/results.json',JSON.stringify({base,mockedApi:true,results},null,2));
