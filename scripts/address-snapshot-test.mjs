import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';

const base=process.env.BASE_URL||'http://127.0.0.1:4315',out=process.env.ADDRESS_OUTPUT||'reports/address-snapshots/browser',baseline=process.env.ADDRESS_BASELINE==='1';
const a='0x'+'a'.repeat(40),b='0x'+'b'.repeat(40),token='0x'+'c'.repeat(40),tx='0x'+'d'.repeat(64),results=[];
await mkdir(out,{recursive:true});
for(const engine of(process.env.ADDRESS_ENGINES||'chromium,firefox,webkit').split(',')){
 const browser=await({chromium,firefox,webkit})[engine].launch(engine==='chromium'?{args:['--no-sandbox']}:engine==='firefox'&&process.env.ADDRESS_FONT_MIN?{firefoxUserPrefs:{'font.minimum-size.x-western':Number(process.env.ADDRESS_FONT_MIN)}}:{});
 try{for(const prefix of baseline?['']:['','/testnet'])for(const[width,locale]of baseline?[[390,'en']]:process.env.ADDRESS_FONT_MIN?[[320,'fr']]:[[320,'en'],[768,'ar'],[1440,'fr']]){
  const context=await browser.newContext({viewport:{width,height:1000},colorScheme:width===320?'dark':'light'}),page=await context.newPage(),errors=[],held=[];
  const row={engine,prefix,width,locale,passed:false};
  let now=Date.now(),mode='fresh',bad='all',version=1,balance='1234567890123456789',counter='101',balanceStatus='matched';
  const calls={profile:0,counters:0,assets:0,activity:0};
  page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error.message));
  const headers=kind=>mode==='undated'&&(bad==='all'||bad===kind)?{}:{date:new Date(now).toUTCString(),'x-ink-data-status':mode==='stale'&&(bad==='all'||bad===kind)?'stale':'fresh','x-ink-data-fetched-at':new Date(now-((bad==='all'||bad===kind)?({old:180000,aging:85000,flight:20000}[mode]||0):0)).toISOString()};
  const data=(kind,id)=>kind==='profile'?{hash:mode==='wrong'?b:id,chain_id:mode==='wrong-chain'?1:prefix?763373:57073,coin_balance:balance,is_contract:true,is_verified:true,name:id===a?'Account A':'Account B',exchange_rate:String(version*2),block_number_balance_updated_at:100,balance_check:{source:balanceStatus==='unavailable'?undefined:'local',status:balanceStatus}}:kind==='counters'?{transactions_count:counter,token_transfers_count:'23',gas_usage_count:'9007199254740993'}:[{token:{address_hash:token},value:'1'}];
  await context.routeWebSocket(/\/api\/live$/,ws=>ws.close());
  await context.route('**/api/**',route=>{
   const url=new URL(route.request().url()),path=url.pathname.replace(/^\/testnet/,'');
   if(path.includes('/contract-info/pools/'))return route.fulfill({json:null});
   if(path.startsWith('/api/explorer/addresses/')){
    const kind=path.endsWith('/counters')?'counters':path.endsWith('/token-balances')?'assets':path.endsWith(a)||path.endsWith(b)?'profile':null;
    if(kind){
     calls[kind]++;const invalid=bad==='all'||bad===kind;
     if(mode==='hold'&&invalid){held.push(route);return;}
     let json=data(kind,path.includes(b)?b:a);
     if(mode==='malformed'&&invalid)json=kind==='assets'?{items:[null]}:[];
     return route.fulfill({status:mode==='error'&&invalid?503:200,headers:headers(kind),json:mode==='error'&&invalid?{error:'Data source unavailable'}:json});
    }
    calls.activity++;
    return route.fulfill({json:{items:[{hash:tx,status:'ok',timestamp:'2026-10-01T12:00:00Z',from:{hash:a},to:{hash:b,name:'Destination'},block_number:100,value:'0',fee:{value:'1'},method:'transfer',transaction_types:['contract_call']}],next_page_params:url.search?null:{block_number:0,index:0}}});
   }
   if(path.startsWith('/api/explorer/smart-contracts/')){calls.activity++;return route.fulfill({json:{name:'Source fixture',file_path:'Example.sol',source_code:'contract Example {}',abi:[]}});}
   return route.fulfill({status:503,json:{error:'Controlled unrelated source'}});
  });
  const tick=async ms=>{now+=ms;await page.clock.fastForward(ms);await page.waitForTimeout(100);};
  const metric=index=>page.locator('.address-summary .metric > strong').nth(index);
  const ready=async()=>page.waitForFunction(()=>document.querySelector('.address-summary .metric > strong')?.textContent.includes('ETH'));
  const unavailable=async()=>{await page.waitForFunction(()=>document.querySelector('.address-summary .metric > strong')?.textContent==='N/A');assert.deepEqual(await page.locator('.address-summary .metric > strong').allTextContents(),['N/A','N/A','N/A']);};
  const choose=async value=>{const select=page.locator('.section-picker select');if(await select.isVisible())await select.selectOption(value);else await page.locator('.section-navigation .tabs').getByRole('button',{name:await select.locator(`option[value="${value}"]`).textContent(),exact:true}).click();};
  const retry=async()=>{mode='fresh';bad='all';await page.locator('.address-refresh-error button').click();await ready();};
  const hidden=async value=>page.evaluate(value=>{if(value)Object.defineProperty(document,'hidden',{configurable:true,value:true});else delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));},value);
  try{
   await page.clock.install({time:new Date(now)});
   await page.goto(`${base}${prefix}/address/${a}?lang=${locale}`,{waitUntil:'domcontentloaded'});await ready();await page.locator('.address-activity .tx-row').waitFor();
   if(baseline){
    const before={...calls};await tick(180001);assert.deepEqual(calls,before);await context.setOffline(true);await ready();
    row.reproduced=['Native balance and account counters never refresh or expire','Account snapshot remains visible offline'];
    await page.screenshot({path:`${out}/offline-baseline.png`});
   }else{
    const activityBefore=calls.activity;await page.locator('.address-pagination button').click();await page.waitForFunction(()=>document.querySelectorAll('.address-activity .tx-row').length===2);const loaded=calls.activity;
    for(const invalid of ['error','stale','old','undated','malformed','wrong','wrong-chain']){
     mode=invalid;await tick(60001);
     if(invalid==='wrong'||invalid==='wrong-chain'){await page.waitForFunction(()=>document.querySelector('.address-summary .metric > strong')?.textContent==='N/A');assert.notEqual(await metric(1).textContent(),'N/A');}
     else await unavailable();
     assert.equal(await page.locator('.detail-header h1').textContent(),'Account A');await retry();
     assert.equal(calls.activity,loaded,'Summary retry must preserve loaded activity');assert.equal(await page.locator('.address-activity .tx-row').count(),2);
    }
    assert(loaded>activityBefore);
    // Independent failures never hide other healthy sources.
    for(const[kind,index]of[['profile',0],['counters',1],['assets',2]]){
     mode='error';bad=kind;await tick(60001);await page.waitForFunction(index=>document.querySelectorAll('.address-summary .metric > strong')[index]?.textContent==='N/A',index);
     for(let i=0;i<3;i++)if(i!==index)assert.notEqual(await metric(i).textContent(),'N/A');
     const before={...calls};await retry();await page.waitForFunction(index=>document.querySelectorAll('.address-summary .metric > strong')[index]?.textContent!=='N/A',index);
     for(const other of ['profile','counters','assets'])if(other!==kind)assert.equal(calls[other],before[other],'Retry only failed resources');
    }
    bad='all';mode='aging';await tick(60001);await ready();const before={...calls};await tick(6001);await unavailable();assert.deepEqual(calls,before,'Expiration must not depend on a new request');
    await page.locator('.address-summary .info-button').first().click();await page.locator('.info-floating').waitFor();assert.equal((await page.locator('.info-floating .info-body').textContent()).trim(),'N/A');await page.keyboard.press('Escape');
    await retry();mode='flight';await tick(60001);await ready();mode='hold';await tick(60001);assert(held.length);await tick(11001);await unavailable();await retry();
    await choose('overview');
    const gas=await page.evaluate(locale=>new Intl.NumberFormat(locale).format(9007199254740993n),locale);assert((await page.locator('.address-facts').textContent()).includes(gas));
    await context.setOffline(true);await unavailable();assert(!(await page.locator('.address-facts').textContent()).includes(gas));await context.setOffline(false);await ready();
    await hidden(true);await unavailable();const paused={...calls};await tick(180001);assert.deepEqual(calls,paused);mode='hold';await hidden(false);await page.waitForTimeout(100);await unavailable();await hidden(true);mode='fresh';await hidden(false);await ready();
    await choose('contract');await page.locator('.source-file').first().waitFor();const sourceCalls=calls.activity;await tick(60001);assert.equal(calls.activity,sourceCalls);
    await choose('overview');
    balance='0';counter='0';await tick(60001);await ready();assert.match(await metric(0).textContent(),/[0٠].*ETH/);assert.notEqual(await metric(1).textContent(),'N/A');
    balance='1';counter='9007199254740993';await tick(60001);await ready();assert((await metric(0).textContent()).includes('<'));assert.equal((await metric(1).textContent()),gas);
    await page.locator('.address-summary .info-button').first().click();await page.locator('.info-floating').waitFor();assert((await page.locator('.info-floating').textContent()).includes(await page.evaluate(locale=>new Intl.NumberFormat(locale,{maximumFractionDigits:18}).format(1e-18),locale)));await page.keyboard.press('Escape');
    for(const invalid of ['',false,{},-1,9007199254740992]){balance=invalid;counter=invalid;await tick(60001);await page.waitForFunction(()=>document.querySelector('.address-summary .metric > strong')?.textContent==='N/A');assert.equal(await metric(1).textContent(),'N/A');}
    balance='1234567890123456789';counter='101';balanceStatus='unavailable';await tick(60001);await ready();
    await page.locator('.address-summary .info-button').first().click();await page.locator('.info-floating').waitFor();await page.screenshot({path:`${out}/${engine}-${prefix?'sepolia':'mainnet'}-${width}-help.png`});await page.keyboard.press('Escape');
    mode='hold';await tick(60001);const cancelled=[...held];mode='fresh';await page.evaluate(({prefix,id,locale})=>{history.pushState({},'',prefix+'/address/'+id+'?lang='+locale);dispatchEvent(new PopStateEvent('popstate'));},{prefix,id:b,locale});
    await page.waitForFunction(()=>document.querySelector('.detail-header h1')?.textContent==='Account B');await ready();
    for(const route of cancelled)await route.fulfill({headers:headers('profile'),json:data('profile',a)}).catch(()=>{});
    await page.waitForTimeout(100);assert.equal(await page.locator('.detail-header h1').textContent(),'Account B');
    const geometry=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth-innerWidth,clipped:[...document.querySelectorAll('.address-summary .metric > strong,.address-summary .metric-top > span,.address-summary .info-visible-label')].filter(el=>el.scrollWidth>el.clientWidth+1).map(el=>el.textContent)}));
    assert(geometry.overflow<=1);assert.deepEqual(geometry.clipped,[]);row.geometry=geometry;
   }
   assert.deepEqual(errors,[]);row.passed=true;row.calls={...calls};await page.screenshot({path:`${out}/${engine}-${prefix?'sepolia':'mainnet'}-${width}.png`});
  }catch(error){row.error=error.stack;await page.screenshot({path:`${out}/failure-${engine}-${prefix?'sepolia':'mainnet'}-${width}.png`}).catch(()=>{});}
  finally{for(const route of held)await route.abort().catch(()=>{});await context.close();}
  results.push(row);console.log(JSON.stringify(row));await writeFile(`${out}/results.json`,JSON.stringify({base,complete:false,results},null,2));
 }}finally{await browser.close();}
}
await writeFile(`${out}/results.json`,JSON.stringify({base,complete:true,passed:results.every(row=>row.passed),baseline,mockedApi:true,physicalDeviceTest:false,results},null,2));
if(results.some(row=>!row.passed))process.exitCode=1;
