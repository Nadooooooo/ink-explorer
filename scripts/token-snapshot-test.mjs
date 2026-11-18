import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4313',out=process.env.TOKEN_SNAPSHOT_OUTPUT||'reports/token-snapshots/browser',baseline=process.env.TOKEN_SNAPSHOT_BASELINE==='1',results=[];
const a='0x'+'a'.repeat(40),b='0x'+'b'.repeat(40),wallet='0x'+'c'.repeat(40);
await mkdir(out,{recursive:true});
for(const engine of(process.env.TOKEN_SNAPSHOT_ENGINES||'chromium,firefox,webkit').split(',')){
 const browser=await({chromium,firefox,webkit})[engine].launch(engine==='chromium'?{args:['--no-sandbox']}:engine==='firefox'&&process.env.TOKEN_FONT_MIN?{firefoxUserPrefs:{'font.minimum-size.x-western':Number(process.env.TOKEN_FONT_MIN)}}:{});
 try{for(const prefix of baseline?['']:['','/testnet'])for(const[width,locale]of baseline?[[390,'en']]:process.env.TOKEN_FONT_MIN?[[320,'fr']]:[[320,'en'],[768,'ar'],[1440,'fr']]){
  const context=await browser.newContext({viewport:{width,height:1000},colorScheme:width===320?'dark':'light'}),page=await context.newPage(),row={engine,prefix,width,locale,baseline,passed:false},held=[],errors=[];
  let now=Date.now(),mode='fresh',version=1,calls=0,sections=[],supply='1000000000000000001',holders='101',decimals='18';
  page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error.message));
  const profile=id=>({address_hash:mode==='wrong'?wallet:id,chain_id:prefix?763373:57073,name:id===b?'Token B':'Token A',symbol:id===b?'BET':'ALP',type:'ERC-20',decimals,total_supply:supply,holders_count:holders,exchange_rate:String(version*2),circulating_market_cap:String(version*2000000),volume_24h:'0'});
  const headers=()=>mode==='undated'?{}:{date:new Date(now).toUTCString(),'x-ink-data-status':mode==='stale'?'stale':'fresh','x-ink-data-fetched-at':new Date(now-({old:180000,aging:85000,flight:20000}[mode]||0)).toISOString()};
  await context.routeWebSocket(/\/api\/live$/,ws=>ws.close());
  await context.route('**/api/**',route=>{
   const url=new URL(route.request().url()),path=url.pathname.replace(/^\/testnet/,'');
   if(path===`/api/explorer/tokens/${a}`||path===`/api/explorer/tokens/${b}`){
    calls++;if(mode==='hold'){held.push(route);return;}
    return route.fulfill({status:mode==='error'?503:200,headers:{...headers(),'retry-after':'1'},json:mode==='error'?{error:'Data source unavailable'}:profile(path.endsWith(b)?b:a)});
   }
   if(path.includes('/holders')){sections.push(path+url.search);return route.fulfill({headers:{date:new Date(now).toUTCString(),'x-ink-data-status':'fresh','x-ink-data-fetched-at':new Date(now).toISOString()},json:{items:[{address:{hash:wallet,name:'Saved holder page '+(url.search?'2':'1')},value:url.search?'2000000000000000000':'1000000000000000000'}],next_page_params:url.search?null:{value:'0',address_hash:wallet}}});}
   if(path.includes('/transfers')){sections.push(path+url.search);return route.fulfill({json:{items:[],next_page_params:null}});}
   if(path.startsWith('/api/explorer/smart-contracts/')){sections.push(path+url.search);return route.fulfill({json:{name:'Token contract',source_code:'contract Example {}',file_path:'Example.sol',abi:[]}});}
   return route.fulfill({status:503,json:{error:'Controlled unrelated source'}});
  });
  const tick=async ms=>{now+=ms;await page.clock.fastForward(ms);await page.waitForTimeout(100);};
  const choose=async section=>{const select=page.locator('.section-picker select');if(await select.isVisible())await select.selectOption(section);else await page.locator('.tabs').getByRole('button',{name:await select.locator(`option[value="${section}"]`).textContent(),exact:true}).click();};
  const expected=()=>page.evaluate(({locale,value})=>new Intl.NumberFormat(locale,{style:'currency',currency:'USD',currencyDisplay:'narrowSymbol',maximumSignificantDigits:6}).format(value),{locale,value:version*2});
  const ready=async()=>page.waitForFunction(value=>document.querySelector('.token-price strong')?.textContent===value,await expected());
  const unavailable=async()=>{await page.waitForFunction(()=>document.querySelector('.token-price strong')?.textContent==='N/A');if(await page.locator('.token-summary').count())assert.deepEqual(await page.locator('.token-summary .metric > strong').allTextContents(),['N/A','N/A','N/A','N/A']);};
  const retry=async()=>{if(mode==='error')await tick(1001);mode='fresh';version++;await page.locator('.token-refresh-error button').click();await ready();};
  const hidden=async value=>page.evaluate(value=>{if(value)Object.defineProperty(document,'hidden',{configurable:true,value:true});else delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));},value);
  try{
   await page.clock.install({time:new Date(now)});
   await page.goto(`${base}${prefix}/token/${a}?lang=${locale}`,{waitUntil:'domcontentloaded'});await ready();
   if(baseline){
    await tick(180001);assert.equal(calls,1);await ready();await context.setOffline(true);await ready();
    row.reproduced=['Profile amounts never refresh or expire','Stale token price remains visible offline'];
   }else{
    for(const invalid of ['error','stale','old','undated','wrong']){
     mode=invalid;await tick(60001);await unavailable();assert.equal(await page.locator('.token-id h1').textContent(),'Token A');await retry();
    }
    mode='aging';await tick(60001);await ready();const before=calls;await tick(6001);await unavailable();assert.equal(calls,before);
    await page.locator('.token-summary .info-button').first().click();await page.locator('.info-floating').waitFor();assert((await page.locator('.info-floating').textContent()).includes('N/A'));await page.keyboard.press('Escape');
    if(process.env.TOKEN_FONT_MIN){
     const broken=await page.evaluate(()=>{
      const result=[];
      for(const element of document.querySelectorAll('.token-summary .metric-top > span,.token-summary .info-visible-label'))
       for(const node of element.childNodes)if(node.nodeType===Node.TEXT_NODE)
        for(const word of node.textContent.matchAll(/\p{L}{5,}/gu)){
         const range=document.createRange();range.setStart(node,word.index);range.setEnd(node,word.index+word[0].length);
         if(new Set([...range.getClientRects()].map(rect=>Math.round(rect.y))).size>1)result.push(word[0]);
        }
      return result;
     });
     assert.deepEqual(broken,[],'A summary label breaks in the middle of a word');
    }
    await page.screenshot({path:`${out}/${engine}-${prefix?'sepolia':'mainnet'}-${width}-expired.png`});
    const notice=await page.locator('.token-refresh-error').evaluate(el=>{const r=el.getBoundingClientRect(),button=el.querySelector('button').getBoundingClientRect();return {inside:button.left>=r.left&&button.right<=r.right+1,height:button.height};});assert(notice.inside&&notice.height>=44);
    await retry();
    mode='flight';await tick(60001);await ready();mode='hold';await tick(60001);assert(held.length);await tick(11001);await unavailable();await retry();
    // The metadata update must not reload a paginated activity section.
    await choose('holders');await page.locator('.holder-row').waitFor();await page.locator('.token-list-controls .cursor-pagination button').last().click();
    await page.waitForFunction(()=>document.querySelector('.holder-row')?.textContent.includes('Saved holder page 2')&&document.querySelector('.token-list-controls .cursor-pagination button:last-child')?.disabled);
    const savedSections=sections.length,savedText=await page.locator('.holder-row').textContent();version++;await tick(60001);await ready();
    assert.equal(sections.length,savedSections+1,'Holder refresh remains on the selected page');assert.equal(await page.locator('.holder-row').textContent(),savedText);assert(await page.locator('.token-list-controls .cursor-pagination button').first().isEnabled());
    await choose('contract');await page.locator('.source-file').first().waitFor();const contractCalls=sections.length;version++;await tick(60001);await ready();assert.equal(sections.length,contractCalls);
    await choose('overview');
    await context.setOffline(true);await unavailable();await context.setOffline(false);await ready();
    await hidden(true);await unavailable();const paused=calls;await tick(180001);assert.equal(calls,paused);
    mode='hold';await hidden(false);await unavailable();await page.waitForTimeout(100);await hidden(true);mode='fresh';await hidden(false);await ready();
    // Small and malformed amounts remain honest independently of freshness.
    supply='1';holders='0';version++;await tick(60001);await ready();assert((await page.locator('.token-summary .metric > strong').nth(1).textContent()).startsWith('< '));
    supply='bad';holders=false;await tick(60001);await ready();assert.deepEqual((await page.locator('.token-summary .metric > strong').allTextContents()).slice(0,2),['N/A','N/A']);
    supply='9007199254740993';holders='9007199254740993';decimals=null;await tick(60001);await ready();
    const exact=await page.evaluate(locale=>new Intl.NumberFormat(locale).format(9007199254740993n),locale);assert.deepEqual((await page.locator('.token-summary .metric > strong').allTextContents()).slice(0,2),[exact,exact]);
    // A late response for A must never overwrite B after same-document navigation.
    mode='hold';await tick(60001);const cancelled=held.at(-1);assert(cancelled);mode='fresh';
    await page.evaluate(({prefix,id,locale})=>{history.pushState({},'',prefix+'/token/'+id+'?lang='+locale);dispatchEvent(new PopStateEvent('popstate'));},{prefix,id:b,locale});
    await page.waitForFunction(()=>document.querySelector('.token-id h1')?.textContent==='Token B');await ready();
    await cancelled.fulfill({headers:headers(),json:profile(a)}).catch(()=>{});await page.waitForTimeout(100);assert.equal(await page.locator('.token-id h1').textContent(),'Token B');
   }
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);
   await page.screenshot({path:`${out}/${engine}-${prefix?'sepolia':'mainnet'}-${width}.png`});row.passed=true;row.requests=calls;
  }catch(error){row.error=error.stack;await page.screenshot({path:`${out}/failure-${engine}-${prefix?'sepolia':'mainnet'}-${width}.png`}).catch(()=>{});}
  finally{for(const route of held)await route.abort().catch(()=>{});await context.close();}
  results.push(row);console.log(JSON.stringify(row));await writeFile(`${out}/results.json`,JSON.stringify({base,complete:false,results},null,2));
 }}finally{await browser.close();}
}
await writeFile(`${out}/results.json`,JSON.stringify({base,complete:true,passed:results.every(row=>row.passed),baseline,mockedApi:true,physicalDeviceTest:false,results},null,2));
if(results.some(row=>!row.passed))process.exitCode=1;
