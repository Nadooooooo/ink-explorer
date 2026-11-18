import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4316',out=process.env.HOLDER_OUTPUT||'reports/holder-snapshots/browser',baseline=process.env.HOLDER_BASELINE==='1',results=[];
const token='0x'+'a'.repeat(40),otherToken='0x'+'b'.repeat(40),a='0x'+'1'.repeat(40),b='0x'+'2'.repeat(40),c='0x'+'3'.repeat(40);
await mkdir(out,{recursive:true});
for(const engine of(process.env.HOLDER_ENGINES||'chromium,firefox,webkit').split(',')){
 const browser=await({chromium,firefox,webkit})[engine].launch(engine==='chromium'?{args:['--no-sandbox']}:engine==='firefox'&&process.env.HOLDER_FONT_MIN?{firefoxUserPrefs:{'font.minimum-size.x-western':Number(process.env.HOLDER_FONT_MIN)}}:{});
 try{for(const prefix of baseline?['']:['','/testnet'])for(const[width,locale]of baseline?[[390,'en']]:process.env.HOLDER_FONT_MIN?[[320,'fr']]:[[320,'en'],[768,'ar'],[1440,'fr']]){
  const context=await browser.newContext({viewport:{width,height:1000},colorScheme:width===320?'dark':'light'}),page=await context.newPage(),errors=[],held=[],queries=[];
  const row={engine,prefix,width,locale,passed:false};let now=Date.now(),mode='fresh',version=1,decimals='18',quantity='1000000000000000000',profileFailure=false;
  page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error.message));
  const headers=(profile=false)=>!profile&&mode==='undated'?{}:{date:new Date(now).toUTCString(),'x-ink-data-status':!profile&&mode==='stale'?'stale':'fresh','x-ink-data-fetched-at':new Date(now-(profile?0:({old:180000,aging:85000,flight:20000}[mode]||0))).toISOString()};
  const data=url=>{
   const id=url.pathname.includes(otherToken)?otherToken:token,later=url.searchParams.has('value');
   const items=mode==='empty'?[]:(later?[{address:{hash:c,name:'Holder page 2'},value:quantity}]:[{address:{hash:version===1?a:b,name:version===1?'Holder A':'Holder B'},value:quantity},{address:{hash:version===1?b:a,name:version===1?'Holder B':'Holder A'},value:'0'}]);
   if(mode==='duplicate')items.push(items[0]);if(mode==='bad-address')items[0].address.hash='bad';
   return{items,chain_id:mode==='wrong-chain'?1:prefix?763373:57073,token_address_hash:mode==='wrong-token'?otherToken:id,next_page_params:mode==='bad-cursor'?{value:{bad:true}}:later?null:{value:0,address_hash:b,fiat_value:null,is_null:false}};
  };
  await context.routeWebSocket(/\/api\/live$/,ws=>ws.close());
  await context.route('**/api/**',route=>{
   const url=new URL(route.request().url()),path=url.pathname.replace(/^\/testnet/,'');
   if(path===`/api/explorer/tokens/${token}`||path===`/api/explorer/tokens/${otherToken}`)
    return route.fulfill({status:profileFailure?503:200,headers:headers(true),json:profileFailure?{error:'Data source unavailable'}:{address_hash:path.endsWith(otherToken)?otherToken:token,name:path.endsWith(otherToken)?'Token B':'Token A',type:'ERC-20',symbol:'TOK',decimals,total_supply:'100000000000000000000',holders_count:'10',exchange_rate:'2'}});
   if(path.endsWith('/holders')){
    queries.push(path+url.search);if(mode==='hold'){held.push(route);return;}
    return route.fulfill({status:mode==='error'?503:200,headers:headers(),json:mode==='error'?{error:'Data source unavailable'}:data(url)});
   }
   if(path.endsWith('/transfers'))return route.fulfill({json:{items:[],next_page_params:null}});
   return route.fulfill({status:503,json:{error:'Controlled unrelated source'}});
  });
  const tick=async ms=>{now+=ms;await page.clock.fastForward(ms);await page.waitForTimeout(100);};
  const values=()=>page.locator('.holder-row > strong > bdi').allTextContents();
  const identities=()=>page.locator('.holder-identity .copyable a').evaluateAll(es=>es.map(e=>e.getAttribute('href')));
  const ready=()=>page.waitForFunction(()=>document.querySelector('.holder-row > strong > bdi')?.textContent&&!['N/A','—'].includes(document.querySelector('.holder-row > strong > bdi').textContent));
  const unavailable=()=>page.waitForFunction(()=>[...document.querySelectorAll('.holder-row > strong > bdi')].length>0&&[...document.querySelectorAll('.holder-row > strong > bdi')].every(el=>el.textContent==='N/A'));
  const refresh=async()=>{mode='fresh';await page.locator('.holder-refresh-button').click();await ready();};
  const choose=async value=>{const select=page.locator('.section-picker select');if(await select.isVisible())await select.selectOption(value);else await page.locator('.section-navigation .tabs').getByRole('button',{name:await select.locator(`option[value="${value}"]`).textContent(),exact:true}).click();};
  const hidden=async value=>page.evaluate(value=>{if(value)Object.defineProperty(document,'hidden',{configurable:true,value:true});else delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));},value);
  try{
   await page.clock.install({time:new Date(now)});await page.goto(`${base}${prefix}/token/${token}?tab=holders&lang=${locale}`,{waitUntil:'domcontentloaded'});await ready();
   if(baseline){await tick(180001);assert.equal(queries.length,1);await context.setOffline(true);await ready();row.reproduced=['Holder balances never refresh or expire','Offline holder balances remain visible'];}
   else{
    const initial=await identities(),initialValues=await values();await page.locator('.holder-identity .copyable a').first().focus();
    version=2;quantity='2000000000000000000';await tick(60001);await page.locator('.holder-refresh-button.has-updates').waitFor();assert.deepEqual(await identities(),initial);assert.deepEqual(await values(),initialValues);
    assert.equal(await page.locator('.holder-identity .copyable a').first().evaluate(el=>document.activeElement===el),true);
    const before=queries.length;await tick(30001);await unavailable();assert.equal(queries.length,before);assert.deepEqual(await page.locator('.holder-row > strong').evaluateAll(es=>es.map(e=>e.title)),['N/A','N/A']);
    await refresh();assert.equal(queries.length,before);assert.notDeepEqual(await identities(),initial);
    await tick(60001);await ready();assert.equal(await page.locator('.holder-refresh-button.has-updates').count(),0,'Identical fresh pages revalidate automatically');
    for(const invalid of ['error','stale','old','undated','duplicate','bad-address','bad-cursor','wrong-chain','wrong-token']){
     mode=invalid;await tick(60001);await unavailable();await page.locator('.holder-refresh-error').waitFor();await refresh();
    }
    mode='aging';await tick(60001);await ready();const expiring=queries.length;await tick(6001);await unavailable();assert.equal(queries.length,expiring);await refresh();
    mode='flight';await tick(60001);await ready();mode='hold';await tick(60001);assert(held.length);await tick(11001);await unavailable();mode='fresh';await page.locator('.holder-refresh-error button').click();await ready();
    await page.locator('.token-list-controls .cursor-pagination button').last().click();await page.waitForFunction(()=>document.querySelector('.holder-row')?.textContent.includes('Holder page 2'));await ready();
    assert(queries.at(-1).includes('value=0')&&queries.at(-1).includes('fiat_value=null')&&queries.at(-1).includes('is_null=false'));const saved=await identities(),cursor=queries.at(-1);
    quantity='3000000000000000000';await tick(60001);await page.locator('.holder-refresh-button.has-updates').waitFor();await refresh();assert.equal(queries.at(-1),cursor);assert.deepEqual(await identities(),saved);assert(await page.locator('.token-list-controls .cursor-pagination button').first().isEnabled());
    await context.setOffline(true);await unavailable();await context.setOffline(false);await ready();assert.deepEqual(await identities(),saved);
    await hidden(true);await unavailable();const paused=queries.length;await tick(180001);assert.equal(queries.length,paused);mode='hold';await hidden(false);await page.waitForTimeout(100);await unavailable();await hidden(true);mode='fresh';await hidden(false);await ready();
    profileFailure=true;await tick(60001);await unavailable();assert.equal(await page.locator('.holder-refresh-error').count(),0);profileFailure=false;await page.locator('.token-refresh-error button').click();await ready();
    for(const raw of ['0','1','9007199254740993',false,'bad',9007199254740992]){
     quantity=raw;await tick(60001);if(await page.locator('.holder-refresh-button.has-updates').count())await page.locator('.holder-refresh-button').click();
     if(raw===false||raw==='bad'||typeof raw==='number')await unavailable();
     else {await ready();if(raw==='1')assert((await values())[0].includes('<'));if(raw==='0')assert(!(await values())[0].includes('<'));}
    }
    decimals=null;quantity='9007199254740993';await tick(60001);await page.locator('.holder-refresh-button.has-updates').waitFor();await refresh();
    const exact=await page.evaluate(locale=>new Intl.NumberFormat(locale).format(9007199254740993n),locale);assert.deepEqual(await values(),[exact]);
    await page.screenshot({path:`${out}/${engine}-${prefix?'sepolia':'mainnet'}-${width}-exact.png`});
    // Late holder responses from the previous token cannot overwrite this token.
    mode='hold';await tick(60001);const cancelled=held.at(-1);mode='fresh';
    await page.evaluate(({prefix,token,locale})=>{history.pushState({},'',prefix+'/token/'+token+'?tab=holders&lang='+locale);dispatchEvent(new PopStateEvent('popstate'));},{prefix,token:otherToken,locale});
    await page.waitForFunction(()=>document.querySelector('.token-id h1')?.textContent==='Token B');await ready();assert(!queries.at(-1).includes('?'));
    await cancelled.fulfill({headers:headers(),json:data(new URL(base+cursor))}).catch(()=>{});await page.waitForTimeout(100);assert.equal(await page.locator('.token-id h1').textContent(),'Token B');
    mode='empty';await tick(60001);await page.locator('.holder-refresh-button.has-updates').waitFor();await page.locator('.holder-refresh-button').click();await page.locator('.holder-activity .empty').waitFor();await context.setOffline(true);await page.waitForFunction(()=>document.querySelector('.holder-activity .empty')?.textContent==='N/A');await context.setOffline(false);await page.waitForFunction(()=>document.querySelector('.holder-activity .empty')?.textContent!=='N/A');
    await choose('transfers');await page.locator('.token-activity .empty').waitFor();const suspended=queries.length;await tick(60001);assert.equal(queries.length,suspended,'Holder polling stops when another section is selected');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   }
   assert.deepEqual(errors,[]);row.passed=true;row.holderRequests=queries.length;
  }catch(error){row.error=error.stack;await page.screenshot({path:`${out}/failure-${engine}-${prefix?'sepolia':'mainnet'}-${width}.png`}).catch(()=>{});}
  finally{for(const route of held)await route.abort().catch(()=>{});await context.close();}
  results.push(row);console.log(JSON.stringify(row));await writeFile(`${out}/results.json`,JSON.stringify({base,complete:false,results},null,2));
 }}finally{await browser.close();}
}
await writeFile(`${out}/results.json`,JSON.stringify({base,complete:true,passed:results.every(row=>row.passed),baseline,mockedApi:true,physicalDeviceTest:false,results},null,2));
if(results.some(row=>!row.passed))process.exitCode=1;
