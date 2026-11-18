import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4310',out=process.env.HOME_LOADING_OUTPUT||'reports/home-loading/browser';
const locale=process.env.HOME_LOCALE||'fr';
await mkdir(out,{recursive:true});
const results=[],axe=await readFile('node_modules/axe-core/axe.min.js','utf8');
const engines=process.env.HOME_ENGINES?.split(',')||['chromium','firefox','webkit'];
const hash=n=>'0x'+n.toString(16).padStart(64,'0'),address='0x'+'1'.repeat(40);
for(const engine of engines){
 const browser=await({chromium,firefox,webkit}[engine]).launch(engine==='chromium'?{args:['--no-sandbox']}:{});
 try{for(const prefix of ['','/testnet'])for(const width of [320,1440]){
  const context=await browser.newContext({viewport:{width,height:1000},colorScheme:width===320?'dark':'light'}),page=await context.newPage();
  const row={engine,prefix,width,passed:false,checks:[]},errors=[];page.on('pageerror',e=>errors.push(e.message));
  let overviewMode='held',counterMode='held',offline=false,sequence=1,held=[],requests={overview:0,counters:0};
  const chainId=prefix?763373:57073,head=90000000;
  const block=n=>({height:n,hash:hash(n),timestamp:new Date().toISOString(),transactions_count:1,gas_limit:'10000000',gas_used:'20000',miner:{hash:address}});
  const tx=n=>({hash:hash(n+100),block_hash:hash(n),block_number:n,timestamp:new Date().toISOString(),status:'ok',value:'0',from:{hash:address},to:{hash:address},fee:{value:'0'},transaction_types:['COIN_TRANSFER']});
  const blocks=Array.from({length:6},(_,i)=>block(head-i)),transactions=Array.from({length:6},(_,i)=>tx(head-i));
  const chart=Array.from({length:15},(_,i)=>({date:new Date(Date.now()-(14-i)*86400000).toISOString().slice(0,10),transactions_count:String(i<7?100:150)}));
  const snapshot=()=>({type:'snapshot',protocol:'ink-observer.live.v1',sequence:sequence++,sentAt:new Date().toISOString(),network:{chainId,expectedChainId:chainId,head,online:!offline,synced:!offline,stale:offline},block:offline?null:blocks[0],blocks:offline?[]:blocks,transactions:offline?[]:transactions,utilization:offline?null:{percentage:25}});
  const reply=async(route,kind,mode)=>{
   if(mode==='error')return route.fulfill({status:503,json:{error:'Data source unavailable'}});
   if(mode==='invalid')return route.fulfill({json:kind==='overview'?{stats:null,blocks,transactions,chart}:{counters:null}});
   return route.fulfill({headers:{'date':new Date().toUTCString(),'x-ink-data-status':'fresh','x-ink-data-fetched-at':new Date().toISOString()},json:kind==='overview'?{stats:{total_addresses:'123456'},blocks:mode==='empty'?[]:blocks,transactions:mode==='empty'?[]:transactions,chart:mode==='empty'?[]:chart}: {counters:[{id:'newTxns24h',title:'Transactions · 24h',description:'Transactions over the last 24 hours',value:'24311'},{id:'totalAddresses',title:'Total addresses',description:'Indexed addresses',value:'123456'}]}});
  };
  const release=async kind=>{const pending=held.filter(x=>x.kind===kind);held=held.filter(x=>x.kind!==kind);for(const item of pending)item.resolve();await Promise.all(pending.map(x=>x.done));};
  for(const [path,kind]of[['overview','overview'],['stats/counters','counters']])await context.route(`**${prefix}/api/${path}`,async route=>{
   requests[kind]++;const mode=kind==='overview'?overviewMode:counterMode;
   if(mode==='held') {let resolve,doneResolve;const wait=new Promise(r=>resolve=r),done=new Promise(r=>doneResolve=r);held.push({kind,resolve,done});await wait;try{await reply(route,kind,'ok');}catch{}finally{doneResolve();}}
   else await reply(route,kind,mode);
  });
  const socketUrl=base.replace(/^http/,'ws')+prefix+'/api/live';
  await context.route(`**${prefix}/api/live/config`,r=>r.fulfill({json:{url:socketUrl}}));
  await context.route(`**${prefix}/api/live/snapshot`,r=>r.fulfill({json:snapshot()}));
  await page.routeWebSocket(socketUrl,ws=>ws.send(JSON.stringify(snapshot())));
  const metric=index=>page.locator('.home-overview .metric').nth(index).locator(':scope > strong');
  const waitValue=async(index,missing)=>page.waitForFunction(({index,missing})=>{
   const value=document.querySelectorAll('.home-overview .metric')[index]?.querySelector(':scope > strong')?.textContent;
   return value&&((value==='N/A')===missing);
  },{index,missing});
  const checkLayout=async()=>{
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'No horizontal overflow');
   if(engine==='chromium'){
    await page.evaluate(axe);const violations=await page.evaluate(async()=> (await axe.run(document.querySelector('main'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})));
    assert.deepEqual(violations,[]);
   }
  };
  try{
   await page.clock.install();
   await page.goto(base+prefix+'/?lang='+locale,{waitUntil:'domcontentloaded'});
   await page.locator('.compact-block-row').nth(5).waitFor({state:'attached'});await page.locator('.compact-tx-row').nth(5).waitFor();if(width===320){await page.locator('#home-tab-blocks').click();await page.locator('.compact-block-row').nth(5).waitFor();await page.locator('#home-tab-transactions').click();await page.locator('.compact-tx-row').nth(5).waitFor();row.checks.push('Mobile feed tabs remain usable while index requests are pending');}
   await page.locator('.home-chart-slot .loading').waitFor();await waitValue(1,true);await waitValue(2,true);
   assert.equal(await page.locator('.home-overview .metric').count(),4);assert.match(await page.locator('.home-trend-unavailable').innerText(),/^N\/A\b/);
   await page.locator('.compact-block-row').first().evaluate(el=>el.dataset.preserved='yes');
   const before=await page.locator('.live-columns').evaluate(el=>el.getBoundingClientRect().top);
   await page.locator('.chart-range select').selectOption('7');
   await checkLayout();await page.screenshot({path:`${out}/${engine}${prefix?'-sepolia':''}-${width}-pending.png`});
   row.checks.push('Both index requests pending: node feeds, navigation, gauge and chart selector already usable');
   if(width===1440){counterMode='ok';await release('counters');await waitValue(1,false);await waitValue(2,false);assert.equal(await page.locator('.home-chart-slot .loading').count(),1);row.checks.push('Counters and address totals appear while overview remains pending');}
   overviewMode='ok';await release('overview');await page.locator('.interactive-chart').waitFor();await waitValue(2,false);if(width===320)await waitValue(1,true);
   assert.equal(await page.locator('.chart-range select').inputValue(),'7');
   assert.equal(await page.locator('.compact-block-row').first().getAttribute('data-preserved'),'yes');
   row.layoutShiftPx=Math.abs(await page.locator('.live-columns').evaluate(el=>el.getBoundingClientRect().top)-before);assert(row.layoutShiftPx<3,`Loading moved the feed ${row.layoutShiftPx}px`);
   assert((await page.locator('.chart-head .positive').innerText()).includes(new Intl.NumberFormat(locale).format(50)));
   assert(await page.locator('.home-chart-slot .chart-axis').evaluate(el=>el.firstElementChild.getBoundingClientRect().left<el.lastElementChild.getBoundingClientRect().left),'Date labels must follow the left-to-right time series, including RTL locales');
   row.checks.push('Slow counters do not hold chart, address count or feeds; no feed remount or selector reset');
   counterMode='ok';await release('counters');await waitValue(1,false);
   overviewMode='error';counterMode='error';await page.clock.fastForward(31000);
   await page.locator('.home-chart-slot button').waitFor();await page.locator('.home-metric-retry').waitFor();await waitValue(1,true);await waitValue(2,true);
   assert.equal(await page.locator('.compact-block-row').count(),6);assert.equal(await page.locator('.compact-tx-row').count(),6);await checkLayout();
   await page.screenshot({path:`${out}/${engine}${prefix?'-sepolia':''}-${width}-partial-error.png`});
   row.checks.push('Refresh failure clears unavailable figures to N/A and keeps received blocks and transactions');
   const overviewRequests=requests.overview;counterMode='ok';await page.locator('.home-metric-retry').click();await waitValue(1,false);assert.equal(requests.overview,overviewRequests);
   overviewMode='ok';await page.locator('.home-chart-slot button').click();await page.locator('.interactive-chart').waitFor();await waitValue(2,false);
   assert.equal(await page.locator('.compact-block-row').first().getAttribute('data-preserved'),'yes');row.checks.push('Each source retries independently and recovers without reloading the document');
   overviewMode='empty';offline=true;await page.reload({waitUntil:'domcontentloaded'});await page.locator('.chart-empty').waitFor();await page.locator('.home-feed-state .empty:visible').first().waitFor();
   assert.equal(await page.locator('.home-feed-state .empty').count(),2);assert.equal(await page.locator('.chart-head .positive').count(),0);await waitValue(0,true);assert.equal(await page.locator('.utilization-metric strong').innerText(),'N/A');
   row.checks.push('Empty response is distinct from loading; an offline node never displays current head or utilization');
   overviewMode='invalid';counterMode='invalid';await page.reload({waitUntil:'domcontentloaded'});await page.locator('.home-chart-slot button').waitFor();await page.locator('.home-metric-retry').waitFor();await page.locator('.home-feed-state .error-state:visible').first().waitFor();await checkLayout();
   row.checks.push('Malformed data gives local retry states without crashing the page');
   overviewMode='held';counterMode='held';offline=false;await page.reload({waitUntil:'domcontentloaded'});await page.locator('.compact-block-row').nth(5).waitFor({state:'attached'});await page.locator('.home-chart-slot .loading').waitFor();
   await page.clock.fastForward(21000);await page.locator('.home-chart-slot button').waitFor();await page.locator('.home-metric-retry').waitFor();await release('overview');await release('counters');
   assert.equal(await page.locator('.home-chart-slot button').count(),1);await waitValue(1,true);row.checks.push('Timed-out late responses cannot overwrite the error state');
   overviewMode='held';counterMode='held';await page.reload({waitUntil:'domcontentloaded'});await page.locator('.compact-block-row').nth(5).waitFor({state:'attached'});await page.locator('.global-search input').fill('12345');await page.locator('.search-submit').click();await page.waitForURL(url=>url.pathname===prefix+'/block/12345');
   await release('overview');await release('counters');assert.equal(await page.locator('.home-overview').count(),0);row.checks.push('Search and navigation work during loading; late requests cannot resurrect the old page');
   assert.deepEqual(errors,[]);row.passed=true;
  }catch(error){row.error=error.stack;await page.screenshot({path:`${out}/${engine}${prefix?'-sepolia':''}-${width}-failure.png`}).catch(()=>{});}
  finally{for(const item of held)item.resolve();await context.close();}
  results.push(row);console.log(JSON.stringify(row));await writeFile(`${out}/results.json`,JSON.stringify({base,complete:false,results},null,2));
 }}finally{await browser.close();}
}
await writeFile(`${out}/results.json`,JSON.stringify({base,complete:true,passed:results.every(r=>r.passed),results},null,2));if(results.some(r=>!r.passed))process.exitCode=1;
