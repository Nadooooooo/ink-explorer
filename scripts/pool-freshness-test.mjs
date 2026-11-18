import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4311',out=process.env.POOL_OUTPUT||'reports/pool-freshness/browser',results=[];
const address=n=>'0x'+n.toString(16).padStart(40,'0'),singleton='0x'+'a'.repeat(64);
await mkdir(out,{recursive:true});
for(const engine of (process.env.POOL_ENGINES||'chromium,firefox,webkit').split(',')){
 const browser=await({chromium,firefox,webkit})[engine].launch(engine==='chromium'?{args:['--no-sandbox']}:engine==='firefox'&&process.env.POOL_FONT_MIN?{firefoxUserPrefs:{'font.minimum-size.x-western':Number(process.env.POOL_FONT_MIN)}}:{});
 try{for(const prefix of ['','/testnet'])for(const width of (process.env.POOL_WIDTHS||'390,1440').split(',').map(Number))for(const kind of ['directory','singleton','contract']){
  const c=await browser.newContext({viewport:{width,height:900},colorScheme:width===390?'dark':'light'}),p=await c.newPage(),row={engine,prefix,width,kind,passed:false},errors=[],held=[];
  const detail=kind!=='directory',id=kind==='singleton'?singleton:address(1),chain=prefix?763373:57073;
  let now=Date.now(),mode='fresh',version=1,count=45,calls=0,contractCalls=0,contractFailed=false,badSecond=false;
  p.setDefaultTimeout(12000);p.on('pageerror',e=>errors.push(e.message));
  const market=(key,n=1)=>({pool_id:key,chain_id:chain,is_contract:key.length===42,base_token_address:address(500),quote_token_address:address(501),base_token_symbol:'AAA',quote_token_symbol:'BBB',liquidity:String(version*10000+n),volume_usd_24h:String(version*2000),fee:'0.05',base_token_market_cap_usd:'30000',base_token_fully_diluted_valuation_usd:'40000',quote_token_market_cap_usd:'50000',quote_token_fully_diluted_valuation_usd:'60000',dex:{name:'Fixture DEX'}});
  const headers=()=>mode==='undated'?{}:{date:new Date(now).toUTCString(),'x-ink-data-status':mode==='stale'?'stale':'fresh','x-ink-data-fetched-at':new Date(now-(mode==='old'?180000:mode==='aging'?85000:mode==='aging-flight'?75000:0)).toISOString()};
  await c.routeWebSocket(/\/api\/live$/,ws=>ws.close());
  await c.route('**/api/**',route=>{
   const u=new URL(route.request().url()),path=u.pathname.replace(/^\/testnet/,'');
   if(path.startsWith('/api/contract-info/pools')){
    calls++;if(mode==='hold'){held.push(route);return;}
    if(mode==='error')return route.fulfill({status:503,headers:{'retry-after':'1'},json:{error:'Data source unavailable'}});
    const second=u.searchParams.has('page_token');
    let data=detail?market(id):{items:Array.from({length:second?Math.max(0,count-25):Math.min(25,count)},(_,i)=>market(address((second?25:0)+i+1),(second?25:0)+i+1)),next_page_params:!second&&count>25?{page_token:'next'}:null};
    if(second&&badSecond)data={items:[market(address(30))],next_page_params:null};
    return route.fulfill({headers:second&&badSecond?{...headers(),'x-ink-data-status':'stale'}:headers(),json:data});
   }
   if(path.startsWith('/api/explorer/addresses/')){
    contractCalls++;
    if(contractFailed)return route.fulfill({status:503,headers:{'retry-after':'1'},json:{error:'Data source unavailable'}});
    const data=path.endsWith('/counters')?{transactions_count:String(version*12),token_transfers_count:'8'}:path.endsWith('/transactions')?{items:[],next_page_params:null}:{hash:address(1),is_contract:true,is_verified:true,name:'Fixture pool',reputation:'ok',proxy_type:null};
    return route.fulfill({headers:{date:new Date(now).toUTCString(),'x-ink-data-status':'fresh','x-ink-data-fetched-at':new Date(now).toISOString()},json:data});
   }
   return route.fulfill({status:503,json:{error:'Controlled unrelated source'}});
  });
  const values=()=>p.locator(detail?'.address-summary .metric > strong':'.pool-row > strong');
  const waitCurrent=async expected=>{
    await p.waitForFunction(({detail,expected})=>{
      const e=document.querySelector(detail?'.address-summary .metric > strong':'.pool-row > strong');
      return e&&e.textContent.includes(expected);
    },{detail,expected:new Intl.NumberFormat('en',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(expected)});
  };
  const unavailable=async()=>{
    await p.waitForFunction(detail=>{
      const all=[...document.querySelectorAll(detail?'.address-summary .metric > strong':'.pool-row > strong')].slice(0,detail?3:undefined);
      return all.length>0&&all.every(e=>e.textContent==='N/A');
    },detail);
    if(!detail)assert.equal(await p.locator('.pool-result-bar strong').innerText(),'—');
    else assert((await p.locator('.pool-detail-grid article:not(.pool-contract) dd').allInnerTexts()).every(t=>t==='N/A'));
  };
  const currentAmount=()=>version*10000+(detail?1:count);
  const tick=async ms=>{now+=ms;await p.clock.fastForward(ms);await p.waitForTimeout(80);};
  const retry=async()=>{await p.locator('.pool-refresh-error button').click();await waitCurrent(currentAmount());};
  try{
    await p.clock.install({time:new Date(now)});
    await p.goto(`${base}${prefix}/pools${detail?'/'+id:''}?lang=en`,{waitUntil:'domcontentloaded'});
    await waitCurrent(currentAmount());
    if(kind==='singleton')assert.equal(contractCalls,0);
    if(kind==='contract')await p.waitForFunction(()=>document.querySelectorAll('.address-summary .metric > strong')[3]?.textContent==='12');
    // Invalid snapshots must not replace visible, previously validated values.
    for(const invalid of ['stale','old','undated']){
      mode=invalid;version++;await tick(10001);await unavailable();
      mode='fresh';await retry();
    }
    // The first page is not enough: do not publish a mixed fresh/stale catalogue.
    if(!detail){badSecond=true;await tick(10001);await unavailable();badSecond=false;await retry();}
    // Expiry runs independently of polling and of a later blocked request.
    mode='aging';version++;await tick(10001);await waitCurrent(currentAmount());const before=calls;
    mode='hold';await tick(6001);await unavailable();assert.equal(calls,before);
    assert(await p.locator('.resource-error').first().evaluate(e=>{
      const box=e.getBoundingClientRect(),button=e.querySelector('button').getBoundingClientRect();
      const range=document.createRange();range.selectNodeContents(e);
      return button.height>=44 && [...range.getClientRects()].every(r=>!r.width||r.left>=box.left-1&&r.right<=box.right+1&&r.top>=box.top-1&&r.bottom<=box.bottom+1);
    }),'The unavailable notice clips text or has an undersized retry target');
    await p.screenshot({path:`${out}/${engine}-${prefix?'sepolia':'mainnet'}-${width}-${kind}-unavailable.png`});
    mode='fresh';await retry();
    mode='aging-flight';version++;await tick(10001);await waitCurrent(currentAmount());
    mode='hold';await tick(10001);assert(held.length);await tick(6001);await unavailable();
    mode='fresh';await retry();
    // Offline immediately masks prices; hidden views cancel requests and polling.
    await c.setOffline(true);await unavailable();
    version++;await c.setOffline(false);await waitCurrent(currentAmount());
    await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
    const paused=calls;await tick(120000);assert.equal(calls,paused);
    mode='hold';await p.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
    await unavailable();mode='fresh';
    // Force an explicit retry after the held response times out.
    await tick(20001);await retry();
    if(!detail){
      // Local filters remain intact across suspension/revalidation.
      await p.locator('.pool-search input').fill('AAA');
      await p.locator('.pool-pagination button').last().click();
      assert.match(await p.locator('.pool-pagination').innerText(),/26–45/);
      count=10;version++;await tick(10001);await waitCurrent(currentAmount());
      assert.equal(await p.locator('.pool-row').count(),10);
      assert.match(await p.locator('.pool-pagination').innerText(),/1–10/);
      assert.equal(await p.locator('.pool-search input').inputValue(),'AAA');
    }
    if(kind==='contract'){
      contractFailed=true;version++;await tick(10001);await waitCurrent(currentAmount());
      await p.locator('.pool-contract-error').waitFor();
      assert.equal(await values().nth(3).innerText(),'N/A');
      assert.equal(await p.locator('.pool-contract dd').first().innerText(),'N/A');
      await p.screenshot({path:`${out}/${engine}-${prefix?'sepolia':'mainnet'}-${width}-${kind}-partial.png`});
      contractFailed=false;await tick(1100);await p.locator('.pool-contract-error button').click();
      await p.waitForFunction(expected=>document.querySelectorAll('.address-summary .metric > strong')[3]?.textContent===String(expected),version*12);
      mode='stale';await tick(10001);await unavailable();
      assert.notEqual(await values().nth(3).innerText(),'N/A','Fresh contract counters should not inherit a market failure');
      mode='fresh';await retry();
    }
    assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    assert.deepEqual(errors,[]);
    await p.screenshot({path:`${out}/${engine}-${prefix?'sepolia':'mainnet'}-${width}-${kind}.png`});
    row.passed=true;row.calls={market:calls,contract:contractCalls};
  }catch(e){row.error=e.stack;await p.screenshot({path:`${out}/${engine}-${prefix?'sepolia':'mainnet'}-${width}-${kind}-failure.png`}).catch(()=>{});}
  finally{for(const route of held)await route.abort().catch(()=>{});await c.close();}
  results.push(row);console.log(JSON.stringify(row));
  await writeFile(`${out}/results.json`,JSON.stringify({base,complete:false,results},null,2));
 }}finally{await browser.close();}
}
await writeFile(`${out}/results.json`,JSON.stringify({base,complete:true,passed:results.every(r=>r.passed),mockedApi:true,physicalDevices:false,results},null,2));
if(results.some(r=>!r.passed))process.exitCode=1;
