import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4317',out=process.env.INVENTORY_OUTPUT||'reports/account-inventory/browser',baseline=process.env.INVENTORY_BASELINE==='1',results=[];
const account='0x'+'a'.repeat(40),other='0x'+'b'.repeat(40),token='0x'+'1'.repeat(40),second='0x'+'2'.repeat(40),third='0x'+'3'.repeat(40);
await mkdir(out,{recursive:true});
for(const engine of(process.env.INVENTORY_ENGINES||'chromium,firefox,webkit').split(',')){
 const browser=await({chromium,firefox,webkit})[engine].launch(engine==='chromium'?{args:['--no-sandbox']}:engine==='firefox'&&process.env.INVENTORY_FONT_MIN?{firefoxUserPrefs:{'font.minimum-size.x-western':Number(process.env.INVENTORY_FONT_MIN)}}:{});
 try{for(const prefix of baseline?['']:['','/testnet'])for(const[width,locale]of baseline?[[390,'en']]:process.env.INVENTORY_FONT_MIN?[[320,'fr']]:[[320,'en'],[768,'ar'],[1440,'fr']])for(const kind of['tokens','nft']){
  const context=await browser.newContext({viewport:{width,height:1000},colorScheme:width===320?'dark':'light'}),page=await context.newPage(),errors=[],held=[],queries=[];
  const row={engine,prefix,width,locale,kind,passed:false};let now=Date.now(),mode='fresh',version=1,quantity='1000000',precision='6';
  page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error.message));
  const headers=(summary=false)=>!summary&&mode==='undated'?{}:{date:new Date(now).toUTCString(),'x-ink-data-status':!summary&&mode==='stale'?'stale':'fresh','x-ink-data-fetched-at':new Date(now-(summary?0:({old:180000,aging:85000,flight:20000}[mode]||0))).toISOString()};
  const data=url=>{
   const later=url.searchParams.has('value'),id=later?third:version===1?token:second;
   const item={id:0,value:kind==='tokens'?quantity:'1',owner:{hash:url.pathname.includes(other)?other:account,name:'Current owner'},token:{address_hash:id,name:later?'Asset page 2':version===1?'Asset A':'Asset B',symbol:'TOK',type:kind==='tokens'?'ERC-20':'ERC-721',decimals:precision,exchange_rate:'3',icon_url:'https://invalid.example/missing.png'}};
   if(mode==='bad-id')item.token.address_hash='bad';if(mode==='bad-nft-id')item.id=false;
   const items=mode==='empty'?[]:mode==='unknown'?[{value:'0'}, {...item,token:{...item.token,name:null,exchange_rate:null}}]:[item];
   if(mode==='duplicate')items.push(item);
   return{items,address_hash:mode==='wrong-account'?other:url.pathname.includes(other)?other:account,chain_id:mode==='wrong-chain'?1:prefix?763373:57073,next_page_params:mode==='bad-cursor'?{nested:{bad:true}}:later?null:{value:0,fiat_value:null,flag:false}};
  };
  await context.routeWebSocket(/\/api\/live$/,ws=>ws.close());
  await context.route('**/api/**',route=>{
   const url=new URL(route.request().url()),path=url.pathname.replace(/^\/testnet/,'');
   if(path.endsWith('/'+kind)&&path.includes('/addresses/')){
    queries.push(path+url.search);if(mode==='hold'){held.push(route);return;}
    return route.fulfill({status:mode==='error'?503:200,headers:headers(),json:mode==='error'?{error:'Data source unavailable'}:data(url)});
   }
   if(path.endsWith('/token-balances'))return route.fulfill({headers:headers(true),json:[]});
   if(path.endsWith('/counters'))return route.fulfill({headers:headers(true),json:{transactions_count:'1'}});
   if(path.endsWith(account)||path.endsWith(other))return route.fulfill({headers:headers(true),json:{hash:path.endsWith(other)?other:account,is_contract:false,coin_balance:'1'}});
   return route.fulfill({status:503,json:{error:'Controlled unrelated source'}});
  });
  const tick=async ms=>{now+=ms;await page.clock.fastForward(ms);await page.waitForTimeout(100);};
  const cards=()=>page.locator(kind==='tokens'?'.asset-row':'.nft-item');
  const values=()=>page.locator(kind==='tokens'?'.asset-row > span:nth-child(2) > strong bdi':'.nft-holding-balance bdi');
  const ready=()=>page.waitForFunction(selector=>{const el=document.querySelector(selector);return el&&!['N/A','—'].includes(el.textContent);},kind==='tokens'?'.asset-row > span:nth-child(2) > strong bdi':'.nft-holding-balance bdi');
  const unavailable=()=>page.waitForFunction(selector=>{const es=[...document.querySelectorAll(selector)];return es.length>0&&es.every(el=>el.textContent==='N/A');},kind==='tokens'?'.asset-row > span:nth-child(2) > strong bdi':'.nft-holding-balance bdi');
  const refresh=async()=>{mode='fresh';await page.locator('.inventory-refresh-button').click();await ready();};
  const hidden=async value=>page.evaluate(value=>{if(value)Object.defineProperty(document,'hidden',{configurable:true,value:true});else delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));},value);
  try{
   await page.clock.install({time:new Date(now)});await page.goto(`${base}${prefix}/address/${account}?tab=${kind}&lang=${locale}`,{waitUntil:'domcontentloaded'});await cards().first().waitFor();
   if(baseline){const initial=await cards().allTextContents();await tick(180001);assert.equal(queries.length,1);await context.setOffline(true);assert.deepEqual(await cards().allTextContents(),initial);row.reproduced=['Inventory never refreshes or expires','Offline balances or ownership remain displayed'];}
   else{
    await ready();if(kind==='tokens'){await cards().first().scrollIntoViewIfNeeded();await page.locator('.asset-row .token-logo img').waitFor({state:'detached'});assert.equal(await page.locator('.asset-row .token-logo svg').count(),1,'Broken logos use the local icon fallback');}
    const initial=await cards().allTextContents();await cards().first().focus();version=2;await tick(60001);await page.locator('.inventory-refresh-button.has-updates').waitFor();assert.deepEqual(await cards().allTextContents(),initial);assert(await cards().first().evaluate(el=>document.activeElement===el));
    const before=queries.length;await tick(30001);await unavailable();assert.equal(queries.length,before);
    if(kind==='nft')assert(!(await cards().allTextContents()).join('').includes('Current owner'));
    else assert.equal(await cards().first().locator('strong[title]').getAttribute('title'),'N/A');
    await refresh();assert.equal(queries.length,before);assert((await cards().allTextContents()).join('').includes('Asset B'));
    for(const invalid of ['error','stale','old','undated','duplicate','bad-id','bad-cursor','wrong-account','wrong-chain',...(kind==='nft'?['bad-nft-id']:[])]){mode=invalid;await tick(60001);await unavailable();await page.locator('.inventory-refresh-error').waitFor();await refresh();}
    mode='aging';await tick(60001);await ready();const expiring=queries.length;await tick(6001);await unavailable();assert.equal(queries.length,expiring);await refresh();
    mode='flight';await tick(60001);await ready();mode='hold';await tick(60001);assert(held.length);await tick(11001);await unavailable();mode='fresh';await page.locator('.inventory-refresh-error button').click();await ready();
    await page.locator('.account-inventory .token-list-controls .cursor-pagination button').last().click();await page.waitForFunction(selector=>document.querySelector(selector)?.textContent.includes('Asset page 2'),kind==='tokens'?'.asset-row':'.nft-item');await ready();
    const cursor=queries.at(-1);assert(cursor.includes('value=0')&&cursor.includes('fiat_value=null')&&cursor.includes('flag=false'));
    await context.setOffline(true);await unavailable();await context.setOffline(false);await ready();assert.equal(queries.at(-1),cursor);
    await hidden(true);await unavailable();const paused=queries.length;await tick(180001);assert.equal(queries.length,paused);mode='hold';await hidden(false);await page.waitForTimeout(100);await unavailable();await hidden(true);mode='fresh';await hidden(false);await ready();
    assert(await page.locator('.account-inventory .token-list-controls .cursor-pagination button').first().isEnabled());
    if(kind==='tokens'){
     for(const raw of ['0','1','9007199254740993',false]){quantity=raw;precision=raw==='9007199254740993'?null:'18';await tick(60001);await page.locator('.inventory-refresh-button.has-updates').waitFor();await page.locator('.inventory-refresh-button').click();if(raw===false)await unavailable();else{await ready();if(raw==='1')assert((await values().allTextContents())[0].includes('<'));}}
    }else assert((await cards().allTextContents())[0].includes('#0'));
    mode='unknown';await tick(60001);await page.locator('.inventory-refresh-button.has-updates').waitFor();await page.locator('.inventory-refresh-button').click();await page.waitForFunction(selector=>document.querySelectorAll(selector).length===2,kind==='tokens'?'.asset-row':'.nft-item');assert.equal(await cards().first().isDisabled(),true);assert.equal(await values().first().textContent(),'N/A');
    quantity='1000000';mode='hold';await tick(60001);const cancelled=held.at(-1);mode='fresh';
    await page.evaluate(({prefix,id,kind,locale})=>{history.pushState({},'',prefix+'/address/'+id+'?tab='+kind+'&lang='+locale);dispatchEvent(new PopStateEvent('popstate'));},{prefix,id:other,kind,locale});await ready();assert(!queries.at(-1).includes('?'));await cancelled.fulfill({headers:headers(),json:data(new URL(base+cursor))}).catch(()=>{});await page.waitForTimeout(100);assert((await cards().allTextContents()).join('').includes('Asset B'));
    const geometry=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth-innerWidth,buttons:[...document.querySelectorAll('.account-inventory .token-list-controls button')].map(el=>({w:el.getBoundingClientRect().width,h:el.getBoundingClientRect().height}))}));const clipped=await page.locator('.account-inventory .nft-item > span,.account-inventory .nft-placeholder small:not(.sr-only)').evaluateAll(es=>es.filter(el=>el.scrollWidth>el.clientWidth+1||el.scrollHeight>el.clientHeight+1).map(el=>el.textContent));assert.deepEqual(clipped,[],'NFT captions or placeholder text are clipped');assert(geometry.overflow<=1);assert(geometry.buttons.every(b=>b.w>=44&&b.h>=44));row.geometry=geometry;
    await page.screenshot({path:`${out}/${engine}-${prefix?'sepolia':'mainnet'}-${width}-${kind}.png`});
    mode='empty';await tick(60001);await page.locator('.inventory-refresh-button.has-updates').waitFor();await page.locator('.inventory-refresh-button').click();await page.locator('.account-inventory .empty').waitFor();await context.setOffline(true);await page.waitForFunction(()=>document.querySelector('.account-inventory .empty')?.textContent==='N/A');
   }
   assert.deepEqual(errors,[]);row.passed=true;row.requests=queries.length;
  }catch(error){row.error=error.stack;await page.screenshot({path:`${out}/failure-${engine}-${prefix?'sepolia':'mainnet'}-${width}-${kind}.png`}).catch(()=>{});}
  finally{for(const route of held)await route.abort().catch(()=>{});await context.close();}
  results.push(row);console.log(JSON.stringify(row));await writeFile(`${out}/results.json`,JSON.stringify({base,complete:false,results},null,2));
 }}finally{await browser.close();}
}
await writeFile(`${out}/results.json`,JSON.stringify({base,complete:true,passed:results.every(row=>row.passed),baseline,mockedApi:true,physicalDeviceTest:false,results},null,2));
if(results.some(row=>!row.passed))process.exitCode=1;
