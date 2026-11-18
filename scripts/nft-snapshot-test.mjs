import assert from 'node:assert/strict';import {chromium,firefox,webkit} from 'playwright-core';import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4318',out=process.env.NFT_OUTPUT||'reports/nft-details/browser',results=[];
const contract='0x'+'a'.repeat(40),other='0x'+'d'.repeat(40),owner='0x'+'b'.repeat(40),newOwner='0x'+'c'.repeat(40);
await mkdir(out,{recursive:true});
for(const engine of(process.env.NFT_ENGINES||'chromium,firefox,webkit').split(',')){
 const browser=await({chromium,firefox,webkit})[engine].launch(engine==='chromium'?{args:['--no-sandbox']}:engine==='firefox'&&process.env.NFT_FONT_MIN?{firefoxUserPrefs:{'font.minimum-size.x-western':Number(process.env.NFT_FONT_MIN)}}:{});
 try{for(const prefix of process.env.NFT_SINGLE?['']:['','/testnet'])for(const[width,locale]of process.env.NFT_SINGLE?[[320,'en']]:process.env.NFT_FONT_MIN?[[320,'fr']]:[[320,'en'],[768,'ar'],[1440,'fr']])for(const kind of['detail','collection']){
  const context=await browser.newContext({viewport:{width,height:1000},colorScheme:width===320?'dark':'light'}),page=await context.newPage(),errors=[],held=[],queries=[];let now=Date.now(),mode='fresh',version=1,count='9007199254740993';
  const row={engine,prefix,width,locale,kind,passed:false},chain=prefix?763373:57073;page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  const headers=(control=false)=>!control&&mode==='undated'?{}:{date:new Date(now).toUTCString(),'x-ink-data-status':!control&&mode==='stale'?'stale':'fresh','x-ink-data-fetched-at':new Date(now-(control?0:({old:180000,aging:85000,flight:20000}[mode]||0))).toISOString()};
  const token=id=>({address_hash:id,type:'ERC-721',name:'Ink collection',symbol:'INK',holders_count:'1',total_supply:'2'});
  const nft=(id,collection)=>({id:mode==='wrong-id'?'99':id,token:token(mode==='wrong-contract'?other:collection),owner:{hash:version===1?owner:newOwner,name:version===1?'Owner A':'Owner B'},creator:{hash:owner,name:'Creator'},transfers_count:'999',image_url:'https://invalid.example/missing.png',metadata:{name:'Fresh Ink #'+id,description:'An Ink collectible.',attributes:[{trait_type:'Network',value:'Ink'}]},chain_id:mode==='wrong-chain'?1:chain});
  const payload=url=>{
   const collection=url.pathname.includes(other)?other:contract;
   if(kind==='detail')return nft(url.pathname.split('/').at(-1),collection);
   const id=url.searchParams.has('unique_token')?'2':version===1?'0':'1',item=nft(id,collection);
   return{items:mode==='empty'?[]:mode==='duplicate'?[item,item]:[item],next_page_params:mode==='bad-cursor'?{nested:{}}:id==='2'?null:{unique_token:0,flag:false,missing:null}};
  };
  await context.routeWebSocket(/\/api\/live$/,ws=>ws.close());
  await context.route('**/api/**',route=>{
   const url=new URL(route.request().url()),path=url.pathname.replace(/^\/testnet/,'');
   if(path==='/api/media')return route.fulfill({contentType:'image/png',body:'invalid image data'});
   if(path.endsWith('/transfers-count'))return route.fulfill({status:mode==='count-error'?503:200,headers:headers(true),json:mode==='count-error'?{error:'Data source unavailable'}:{transfers_count:count}});
   if(path.endsWith('/transfers')){queries.push(path+url.search);return route.fulfill({json:{items:[{transaction_hash:'0x'+'1'.repeat(64),from:{hash:owner},to:{hash:newOwner},token:token(contract),total:{token_id:'0',value:'1'},timestamp:new Date(now).toISOString()}],next_page_params:url.search?null:{index:0}}});}
   if(path.includes('/instances')){queries.push(path+url.search);row.lastRead={mode,path};if(mode==='hold'){held.push(route);return;}return route.fulfill({status:mode==='error'?503:200,headers:headers(),json:mode==='error'?{error:'Data source unavailable'}:payload(url)});}
   if(path.endsWith(contract)||path.endsWith(other))return route.fulfill({headers:headers(true),json:token(path.endsWith(other)?other:contract)});
   return route.fulfill({status:503,json:{error:'Controlled unrelated source'}});
  });
  const tick=async ms=>{now+=ms;await page.clock.fastForward(ms);await page.waitForTimeout(100);};
  const area=()=>page.locator(kind==='detail'?'.nft-owner':'.nft-item');
  const button=()=>page.locator(kind==='detail'?'.nft-refresh-button':'.instances-refresh-button');
  const ready=()=>page.waitForFunction(selector=>document.querySelector(selector)?.textContent.includes('Owner'),kind==='detail'?'.nft-owner':'.nft-item');
  const unavailable=()=>page.waitForFunction(selector=>document.querySelector(selector)?.textContent.includes('N/A')&&!document.querySelector(selector)?.textContent.includes('Owner A')&&!document.querySelector(selector)?.textContent.includes('Owner B'),kind==='detail'?'.nft-owner':'.nft-item');
  const refresh=async()=>{mode='fresh';await button().click();await page.waitForFunction(selector=>{const el=document.querySelector(selector);return el&&!el.disabled&&!document.querySelector('.nft-refresh-error,.instances-refresh-error');},kind==='detail'?'.nft-refresh-button':'.instances-refresh-button');await ready();};
  const hidden=async value=>page.evaluate(value=>{if(value)Object.defineProperty(document,'hidden',{configurable:true,value:true});else delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));},value);
  const tab=async value=>{if(await page.locator('.section-picker').isVisible())await page.locator('.section-picker select').selectOption(value);else await page.locator('.section-navigation .tabs button').nth(['overview','transfers','metadata'].indexOf(value)).click();};
  try{
   await page.clock.install({time:new Date(now)});await page.goto(`${base}${prefix}/token/${contract}${kind==='detail'?'/instance/0':'?tab=instances'}${kind==='detail'?'?':'&'}lang=${locale}`,{waitUntil:'domcontentloaded'});await ready();
   if(kind==='detail'){assert.equal(await page.locator('h1').count(),1);assert.equal(queries.filter(q=>q.includes('/transfers')).length,0);assert(!(await page.locator('.nft-transfer-count').textContent()).includes('999'));await page.locator('.nft-media img').waitFor({state:'detached'});assert(await page.locator('.nft-media .nft-placeholder svg').isVisible());}
   if(kind==='collection'){await area().scrollIntoViewIfNeeded();await page.locator('.nft-item img').waitFor({state:'detached'});}version=2;const original=await area().textContent();await tick(60001);
   if(kind==='collection'){await page.locator('.instances-refresh-button.has-updates').waitFor();assert.equal(await area().textContent(),original);await tick(30001);await unavailable();await refresh();}
   await ready();assert((await area().textContent()).includes('Owner B'));
   for(const invalid of ['error','stale','old','undated','wrong-contract','wrong-chain',...(kind==='detail'?['wrong-id']:['duplicate','bad-cursor'])]){row.step=invalid;mode=invalid;await tick(60001);await unavailable();await page.locator(kind==='detail'?'.nft-refresh-error':'.instances-refresh-error').waitFor();await refresh();}
   mode='aging';await tick(60001);await ready();const expiryQueries=queries.length;await tick(6001);await unavailable();assert.equal(queries.length,expiryQueries);await refresh();
   mode='flight';await tick(60001);await ready();mode='hold';await tick(60001);assert(held.length);await tick(11001);await unavailable();await refresh();
   if(kind==='collection'){await page.locator('.collection-instances .token-list-controls .cursor-pagination button').last().click();await page.waitForFunction(()=>document.querySelector('.nft-item strong')?.textContent==='#2');await ready();assert(queries.at(-1).includes('unique_token=0')&&queries.at(-1).includes('missing=null')&&queries.at(-1).includes('flag=false'));}
   const cursor=queries.at(-1);await context.setOffline(true);await unavailable();if(kind==='detail')assert.equal((await page.locator('.nft-transfer-count bdi').textContent()),'N/A');await context.setOffline(false);await ready();assert.equal(queries.at(-1),cursor);
   await hidden(true);await unavailable();const paused=queries.length;await tick(180001);assert.equal(queries.length,paused);mode='hold';await hidden(false);await page.waitForTimeout(100);await hidden(true);mode='fresh';await hidden(false);await ready();assert.equal(queries.at(-1),cursor);
   if(kind==='detail'){
    mode='count-error';await tick(60001);await page.waitForFunction(()=>document.querySelector('.nft-transfer-count bdi')?.textContent==='N/A');await ready();await refresh();
    count=false;await tick(60001);await page.waitForFunction(()=>document.querySelector('.nft-transfer-count bdi')?.textContent==='N/A');await ready();count='0';await tick(60001);assert.equal(await page.locator('.nft-transfer-count bdi').textContent(),await page.evaluate(locale=>new Intl.NumberFormat(locale).format(0),locale));
    await page.locator('.nft-transfer-count').click();await page.locator('.generic-row').waitFor();await page.locator('.nft-activity .pagination button').click();await page.waitForFunction(()=>document.querySelectorAll('.generic-row').length===2);const transfersRequests=queries.filter(q=>q.includes('/transfers')).length;await tick(60001);assert.equal(await page.locator('.generic-row').count(),2);assert.equal(queries.filter(q=>q.includes('/transfers')).length,transfersRequests);
    await tab('metadata');assert((await page.locator('.nft-json pre').textContent()).includes('An Ink collectible'));await tab('overview');await ready();
   }
   mode='hold';await tick(60001);const cancelled=held.at(-1);mode='fresh';await page.evaluate(({prefix,id,kind,locale})=>{history.pushState({},'',prefix+'/token/'+id+(kind==='detail'?'/instance/1?':'?tab=instances&')+'lang='+locale);dispatchEvent(new PopStateEvent('popstate'));},{prefix,id:other,kind,locale});await ready();await cancelled.fulfill({headers:headers(),json:payload(new URL(base+cursor))}).catch(()=>{});await page.waitForTimeout(100);assert((await page.locator(kind==='detail'?'h1':'.nft-item strong').textContent()).includes('1'));
   const geometry=await page.evaluate(selector=>({overflow:document.documentElement.scrollWidth-innerWidth,button:document.querySelector(selector).getBoundingClientRect().toJSON()}),kind==='detail'?'.nft-refresh-button':'.instances-refresh-button');assert(geometry.overflow<=1);assert(geometry.button.width>=44&&geometry.button.height>=44);assert.deepEqual(errors,[]);await page.screenshot({path:`${out}/${engine}-${prefix?'sepolia':'mainnet'}-${width}-${kind}.png`,fullPage:true});delete row.step;delete row.lastRead;row.passed=true;row.requests=queries.length;row.geometry=geometry;
  }catch(error){row.error=error.stack;await page.screenshot({path:`${out}/failure-${engine}-${prefix?'sepolia':'mainnet'}-${width}-${kind}.png`}).catch(()=>{});}finally{for(const route of held)await route.abort().catch(()=>{});await context.close();}
  results.push(row);console.log(JSON.stringify(row));await writeFile(`${out}/results.json`,JSON.stringify({base,complete:false,results},null,2));
 }}finally{await browser.close();}
}
await writeFile(`${out}/results.json`,JSON.stringify({base,complete:true,passed:results.every(r=>r.passed),mockedApi:true,physicalDeviceTest:false,results},null,2));if(results.some(r=>!r.passed))process.exitCode=1;
