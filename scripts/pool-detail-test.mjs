import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4298', output=process.env.POOL_REVIEW_DIR||'reports/pool-detail';
await mkdir(output,{recursive:true});
const id='0x'+'a'.repeat(64),address='0x'+'1'.repeat(40),token='0x'+'2'.repeat(40),quote='0x'+'3'.repeat(40),results=[];
for(const [engine,type]of [['chromium',chromium],['firefox',firefox],['webkit',webkit]]){
 const browser=await type.launch(engine==='chromium'?{executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']}:{});
 try{for(const prefix of ['', '/testnet'])for(const width of [390,1440]){
  const chainId=prefix?763373:57073;
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[],addressRequests=[];
  let mismatch=false;
  page.on('pageerror',error=>errors.push(error.message));
  await context.routeWebSocket(/\/api\/live$/,socket=>socket.close());
  const market=(key)=>({pool_id:key,contract_address:key,chain_id:String(mismatch?1:chainId),is_contract:key===address,base_token_address:token,base_token_symbol:'AAA',quote_token_address:quote,quote_token_symbol:'BBB',liquidity:'123456',volume_usd_24h:'5000',fee:key===id?null:'0.05',dex:{name:key===id?'Singleton DEX':'Contract DEX'},coin_gecko_terminal_url:'https://www.geckoterminal.com/ink/pools/'+key});
  await context.route(/\/api\/contract-info\/pools(?:\/[^?]+)?(?:\?|$)/,route=>{
   const path=new URL(route.request().url()).pathname;
   return route.fulfill({headers:{date:new Date().toUTCString(),'x-ink-data-status':'fresh','x-ink-data-fetched-at':new Date().toISOString()},json:path.endsWith('/pools')?{items:[market(id),market(address)],next_page_params:null}:market(path.split('/').at(-1))});
  });
  await context.route(/\/api\/explorer\/addresses\//,route=>{
   const path=new URL(route.request().url()).pathname;addressRequests.push(path);
   const data=path.endsWith('/counters')?{transactions_count:'12',token_transfers_count:'8'}:path.endsWith('/transactions')?{items:[],next_page_params:null}:{hash:address,is_contract:true,is_verified:true,name:'Fixture pool',reputation:'ok'};
   return route.fulfill({headers:{date:new Date().toUTCString(),'x-ink-data-status':'fresh','x-ink-data-fetched-at':new Date().toISOString()},json:data});
  });
  await page.goto(base+prefix+'/pools?q='+id);await page.locator('.pool-row').waitFor();assert.equal(await page.locator('.pool-row').count(),1);
  await page.locator('.pool-row').click();await page.waitForURL(base+prefix+'/pools/'+id);await page.locator('.pool-hero').waitFor();
  assert.match(await page.locator('h1').innerText(),/AAA \/ BBB/);assert.match(await page.locator('.address-summary').innerText(),/123,456/);
  assert.equal(await page.locator('.pool-contract,.pool-activity').count(),0);
  assert.equal(await page.locator('.pool-actions a[href*="/address/"]').count(),0);
  assert.match(await page.locator('.pool-identifier-note').innerText(),/No separate pool contract address/);
  assert.equal(await page.locator(`a[href="${prefix}/token/${token}"]`).count(),1);
  assert.equal(await page.locator('.pool-actions a[target="_blank"]').count(),1);
  assert.deepEqual(addressRequests,[],'Singleton pool IDs must not trigger address endpoints');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  mismatch=true;await page.reload();await page.getByRole('alert').waitFor();assert.equal(await page.locator('.pool-hero').count(),0,'Other-chain market data must not display');
  mismatch=false;await page.getByRole('button',{name:'Retry',exact:true}).click();await page.locator('.pool-hero').waitFor();
  await page.goto(base+prefix+'/pools/'+address);await page.locator('.pool-contract').waitFor();
  assert.equal(await page.locator('.pool-activity').count(),1);assert.equal(await page.locator(`.pool-actions a[href="${prefix}/address/${address}"]`).count(),1);
  assert.equal(await page.locator('.pool-identifier-note').count(),0);
  assert(addressRequests.length>=3);assert(addressRequests.every(path=>path.startsWith(prefix+'/api/explorer/addresses/'+address)));
  assert.deepEqual(errors,[]);results.push({engine,prefix,width,passed:true,checks:'catalogue bytes32 ID link, market detail, contract distinction, no invalid address requests, token/terminal links, chain validation/retry, ordinary address pools, overflow'});
  await writeFile(output+'/results.json',JSON.stringify({results},null,2));console.log(`Pool detail passed ${engine} ${prefix||'mainnet'} ${width}px`);await context.close();
 }}finally{await browser.close();}
}
