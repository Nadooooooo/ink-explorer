import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4314',out=process.env.DIRECTORY_OUTPUT||'reports/token-directory-current/browser',baseline=process.env.DIRECTORY_BASELINE==='1',results=[];
const address=n=>'0x'+n.toString(16).padStart(40,'0');
await mkdir(out,{recursive:true});
for(const engine of(process.env.DIRECTORY_ENGINES||'chromium,firefox,webkit').split(',')){
 const browser=await({chromium,firefox,webkit})[engine].launch(engine==='chromium'?{args:['--no-sandbox']}:engine==='firefox'&&process.env.DIRECTORY_FONT_MIN?{firefoxUserPrefs:{'font.minimum-size.x-western':Number(process.env.DIRECTORY_FONT_MIN)}}:{});
 try{for(const prefix of baseline?['']:['','/testnet'])for(const[width,locale]of baseline?[[390,'en']]:process.env.DIRECTORY_FONT_MIN?[[320,'fr']]:[[320,'en'],[768,'ar'],[1440,'fr']]){
  const context=await browser.newContext({viewport:{width,height:1000},colorScheme:width===320?'dark':'light'}),page=await context.newPage(),row={engine,prefix,width,locale,baseline,passed:false},errors=[],held=[],queries=[];
  let now=Date.now(),mode='fresh',version=1,calls=0;
  page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error.message));
  const token=n=>({address_hash:address(n),name:'Asset '+n,symbol:'TOK'+n,type:'ERC-20',decimals:'18',total_supply:'1000000000000000000',holders_count:'9007199254740993',exchange_rate:String(version*2)});
  const headers=()=>mode==='undated'?{}:{date:new Date(now).toUTCString(),'x-ink-data-status':mode==='stale'?'stale':'fresh','x-ink-data-fetched-at':new Date(now-({old:180000,aging:85000,flight:20000}[mode]||0)).toISOString()};
  await context.routeWebSocket(/\/api\/live$/,ws=>ws.close());
  await context.route('**/api/**',route=>{
   const url=new URL(route.request().url()),path=url.pathname.replace(/^\/testnet/,'');
   if(path==='/api/explorer/tokens'){
    calls++;queries.push(url.search);
    if(mode==='hold'||url.searchParams.get('q')==='old'){held.push(route);return;}
    const later=url.searchParams.has('contract_address_hash'),empty=url.searchParams.get('q')==='missing';
    const items=empty?[]:later?[token(3)]:version%2?[token(1),token(2)]:[token(2),token(1)];
    const data={items:mode==='duplicate'?[token(1),token(1)]:items,next_page_params:mode==='badcursor'?{bad:{nested:true}}:later||empty?null:{contract_address_hash:address(2),fiat_value:null,market_cap:null,holders_count:0,is_name_null:false},chain_id:mode==='wrongchain'?1:prefix?763373:57073};
    return route.fulfill({status:mode==='error'?503:200,headers:headers(),json:mode==='error'?{error:'Data source unavailable'}:data});
   }
   return route.fulfill({status:503,json:{error:'Controlled unrelated source'}});
  });
  const tick=async ms=>{now+=ms;await page.clock.fastForward(ms);await page.waitForTimeout(100);};
  const firstPrice=()=>page.locator('.token-row').first().locator(':scope > span').nth(2).locator('bdi');
  const expected=()=>page.evaluate(({locale,value})=>new Intl.NumberFormat(locale,{style:'currency',currency:'USD',currencyDisplay:'narrowSymbol',maximumSignificantDigits:6}).format(value),{locale,value:version*2});
  const ready=async()=>page.waitForFunction(value=>document.querySelector('.token-row > span:nth-child(3) bdi')?.textContent===value,await expected());
  const names=()=>page.locator('.token-name strong').allTextContents();
  const refresh=()=>page.locator('.token-refresh-button');
  const updates=()=>page.locator('.token-refresh-button.has-updates');
  const unavailable=async()=>{
   await page.waitForFunction(()=>{const values=[...document.querySelectorAll('.token-row > span:not(.token-name) bdi')];return values.length&&values.every(e=>e.textContent==='N/A');});
   assert(await page.locator('.token-list-controls .cursor-pagination button').last().isDisabled());
   assert((await page.locator('.token-row > span:nth-child(3)').evaluateAll(es=>es.map(e=>e.title))).every(value=>value===''));
  };
  const apply=async()=>{await refresh().click();await ready();};
  const recover=async()=>{mode='fresh';await page.locator('.token-refresh-error button').click();await ready();};
  const hidden=async value=>page.evaluate(value=>{if(value)Object.defineProperty(document,'hidden',{configurable:true,value:true});else delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));},value);
  try{
   await page.clock.install({time:new Date(now)});
   await page.goto(`${base}${prefix}/tokens?lang=${locale}&type=ERC-20&sort=holders_count&q=asset`,{waitUntil:'domcontentloaded'});await ready();
   if(baseline){await tick(180001);assert.equal(calls,1);await context.setOffline(true);await ready();row.reproduced=['Ranked token values never expire','Old prices remain visible offline'];}
   else{
    const original=await names(),oldPrice=await firstPrice().textContent();
    await page.locator('.token-row').first().focus();version=2;await tick(60001);await updates().waitFor();
    assert.deepEqual(await names(),original);assert.equal(await firstPrice().textContent(),oldPrice);assert.equal(await page.locator('.token-row').first().evaluate(el=>el===document.activeElement),true);
    const beforeApply=calls;await tick(31001);await unavailable();assert.deepEqual(await names(),original);
    await page.screenshot({path:`${out}/${engine}-${prefix?'sepolia':'mainnet'}-${width}-buffered.png`});
    await apply();assert.equal(calls,beforeApply);assert.deepEqual(await names(),['Asset 2','Asset 1']);assert.equal(await refresh().evaluate(el=>el===document.activeElement),true);
    const exact=await page.evaluate(locale=>new Intl.NumberFormat(locale).format(9007199254740993n),locale);assert.equal(await page.locator('.token-row > span:nth-child(4) bdi').first().getAttribute('title'),exact);
    // An identical fresh result revalidates the same page without a needless update prompt.
    await tick(60001);await ready();assert.equal(await updates().count(),0);
    await context.setOffline(true);await unavailable();await context.setOffline(false);await ready();
    for(const invalid of ['stale','old','undated','error','duplicate','badcursor','wrongchain']){
     mode=invalid;await tick(60001);await unavailable();assert.deepEqual(await names(),['Asset 2','Asset 1']);await recover();
    }
    mode='aging';await tick(60001);await ready();const agingCalls=calls;await tick(6001);await unavailable();assert.equal(calls,agingCalls);await recover();
    mode='flight';await tick(60001);await ready();mode='hold';await tick(60001);assert(held.length);await tick(11001);await unavailable();await recover();
    await hidden(true);await unavailable();const paused=calls;await tick(180001);assert.equal(calls,paused);
    version=3;await hidden(false);await updates().waitFor();await unavailable();assert.deepEqual(await names(),['Asset 2','Asset 1']);await apply();
    // Explicit refresh adopts the buffered ranking while preserving the current cursor.
    await page.locator('.token-list-controls .cursor-pagination button').last().click();await page.waitForFunction(()=>document.querySelector('.token-name strong')?.textContent==='Asset 3');await ready();
    const cursor=new URLSearchParams(queries.at(-1));assert.equal(cursor.get('fiat_value'),'null');assert.equal(cursor.get('holders_count'),'0');assert.equal(cursor.get('is_name_null'),'false');
    version=4;await tick(60001);await updates().waitFor();await apply();
    assert.deepEqual(await names(),['Asset 3']);assert(await page.locator('.token-list-controls .cursor-pagination button').first().isEnabled());
    assert.equal(await page.locator('.token-directory-filters input').inputValue(),'asset');assert.equal(await page.locator('.token-directory-filters select').first().inputValue(),'ERC-20');
    assert(new URLSearchParams(queries.at(-1)).has('contract_address_hash'));
    // In-flight results for old filters cannot overwrite the next query.
    await page.locator('.token-directory-filters input').fill('old');const pending=page.waitForRequest(request=>request.url().includes('q=old'));await page.locator('.token-directory-filters input').press('Enter');await pending;const cancelled=held.at(-1);
    await page.locator('.token-clear-search').click();await ready();assert.equal(new URL(page.url()).searchParams.has('q'),false);
    await cancelled.fulfill({headers:headers(),json:{items:[{...token(1),name:'Obsolete result'}],next_page_params:null}}).catch(()=>{});await page.waitForTimeout(100);assert(!(await names()).includes('Obsolete result'));
    await page.locator('.token-directory-filters input').fill('missing');await page.locator('.token-directory-filters input').press('Enter');await page.locator('.token-directory .empty').waitFor();
    const empty=await page.locator('.token-directory .empty').textContent();assert.notEqual(empty,'N/A');await hidden(true);await page.waitForFunction(()=>document.querySelector('.token-directory .empty')?.textContent==='N/A');await hidden(false);await page.waitForFunction(empty=>document.querySelector('.token-directory .empty')?.textContent===empty,empty);
    await page.locator('.token-clear-search').click();await ready();
    assert(await refresh().evaluate(el=>{const box=el.getBoundingClientRect();return box.width>=44&&box.height>=44;}));
    if(process.env.DIRECTORY_FONT_MIN){
     const clipped=await page.locator('.token-directory-filters select').evaluateAll(selects=>selects.flatMap(select=>{
      const style=getComputedStyle(select),measure=document.createElement('span');measure.textContent=select.selectedOptions[0].textContent;
      Object.assign(measure.style,{font:style.font,whiteSpace:'nowrap',position:'fixed',visibility:'hidden'});document.body.append(measure);
      const width=measure.getBoundingClientRect().width;measure.remove();
      return width>select.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)+1?[select.value]:[];
     }));
     assert.deepEqual(clipped,[],'The selected filter label is clipped');
     const broken=await page.evaluate(()=>{
      const result=[];
      for(const element of document.querySelectorAll('.token-row .mobile-label'))
       for(const node of element.childNodes)if(node.nodeType===Node.TEXT_NODE)
        for(const word of node.textContent.matchAll(/\p{L}{5,}/gu)){
         const range=document.createRange();range.setStart(node,word.index);range.setEnd(node,word.index+word[0].length);
         if(new Set([...range.getClientRects()].map(rect=>Math.round(rect.y))).size>1)result.push(word[0]);
        }
      return result;
     });
     assert.deepEqual(broken,[],'A directory label breaks inside a word');
    }
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
