import assert from 'node:assert/strict';
import {headerSearch,navigateBlocks} from './navigation-actions.mjs';
import { chromium, firefox, webkit } from 'playwright';
import { mkdir,writeFile } from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4298', output=process.env.SEARCH_REVIEW_DIR||'reports/search';
await mkdir(output,{recursive:true});
const hash='0x'+'a'.repeat(64),address='0x'+'1'.repeat(40),second='0x'+'2'.repeat(40),third='0x'+'3'.repeat(40);
const results=[];
for(const [engine,type] of [['chromium',chromium],['firefox',firefox],['webkit',webkit]]){
const browser=await type.launch(engine==='chromium'?{executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']}:{});
try {
 for(const prefix of ['', '/testnet'])for(const width of [390,1440]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[],requests=[];
  let failure=true, hashMode='block', delayedCursor=false, heldLookup;
  page.on('pageerror',e=>errors.push(e.message));
  // Search hashes below are synthetic. Resolve their destinations in this
  // fixture so a document reset does not race an unrelated real-index lookup.
  // Real block/transaction loading and cancellation have independent gates.
  const destinationRequests=[];
  const destinationBlock={height:123,hash,parent_hash:'0x'+'b'.repeat(64),timestamp:'2026-11-17T00:00:00.000Z',transactions_count:0,gas_used:'0',gas_limit:'30000000',gas_used_percentage:0,base_fee_per_gas:'1000000',transaction_fees:'0',size:1024};
  const destinationTransaction={hash,block_number:123,block_hash:'0x'+'b'.repeat(64),timestamp:'2026-11-17T00:00:00.000Z',status:'ok',from:{hash:address},to:{hash:second},value:'0',fee:{value:'21000'},gas_used:'21000',gas_limit:'21000',gas_price:'1',nonce:0};
  await context.route(/\/api\/explorer\/(?:blocks|transactions)\/0x[a]{64}(?:\?|$)/,route=>{
   const path=new URL(route.request().url()).pathname;destinationRequests.push(path);
   return route.fulfill({json:path.includes('/blocks/')?destinationBlock:destinationTransaction}).catch(()=>{});
  });
  await context.routeWebSocket(/\/api\/live$/,ws=>ws.close());
  await context.route(/\/api\/search(?:\?|$)/,async route=>{
   const url=new URL(route.request().url()),query=url.searchParams.get('q');requests.push({path:url.pathname,query:Object.fromEntries(url.searchParams)});
   if(query===hash){
    if(heldLookup){
     const lookup=heldLookup;
     heldLookup=undefined;
     lookup.started.resolve();
     await lookup.release.promise;
     try { await route.fulfill({json:{items:[{type:'block',block_hash:hash,block_number:123}],next_page_params:null}}); }
     catch { /* The lookup can be aborted by navigation. */ }
     finally { lookup.finished.resolve(); }
     return;
    }
    if(hashMode==='slow')await new Promise(resolve=>setTimeout(resolve,600));
    if(hashMode==='failure')return route.fulfill({status:503,headers:{'retry-after':'1'},json:{error:'Controlled search outage'}}).catch(()=>{});
    return route.fulfill({json:{items:hashMode==='empty'?[]:[{type:'block',block_hash:hash,block_number:123}],next_page_params:null}}).catch(()=>{});
   }
   if(query==='NEW')return route.fulfill({json:{items:[{type:'token',address_hash:third,name:'New query token'}],next_page_params:null}});
   const cursor=url.searchParams.has('token[holder_count]');
   if(cursor&&delayedCursor)await new Promise(resolve=>setTimeout(resolve,600));
   if(cursor&&failure)return route.fulfill({status:503,headers:{'retry-after':'1'},json:{error:'Controlled page failure'}}).catch(()=>{});
   return route.fulfill({json:cursor?{items:[{type:'token',address_hash:third,name:'Third token'}],next_page_params:null}:{items:[{type:'token',address_hash:address,name:'First token'},{type:'token',address_hash:second,name:'Second token'}],next_page_params:{q:'INK',next_page_params_type:'search','token[circulating_market_cap]':null,'token[fiat_value]':null,'token[holder_count]':'0','token[name]':'Second token','token[inserted_at]':'2026-10-16T00:00:00Z','token[is_verified_via_admin_panel]':false}}}).catch(()=>{});
  });
  const search=async value=>{const input=await headerSearch(page);await input.fill(value);await input.press('Enter');};
  await page.goto(base+prefix+'/search?q=INK');await page.locator('.search-results a').first().waitFor();
  assert.equal(await (await headerSearch(page)).inputValue(),'INK');
  assert.equal(await page.locator('.search-results a').count(),2);
  await page.getByRole('button',{name:'Load more',exact:true}).click();await page.getByRole('alert').filter({hasText:'Controlled page failure'}).waitFor();
  assert.equal(await page.locator('.search-results a').count(),2,'A failed cursor preserves previous results');
  failure=false;await page.waitForTimeout(1100);await page.getByRole('button',{name:'Retry',exact:true}).click();await page.locator('.search-results a').filter({hasText:'Third token'}).waitFor();
  assert.equal(await page.locator('.search-results a').count(),3);assert.equal(await page.getByRole('button',{name:'Load more',exact:true}).count(),0);
  const cursorRequest=requests.find(r=>r.query['token[holder_count]']);assert.equal(cursorRequest.query.q,'INK');assert.equal(cursorRequest.query['token[circulating_market_cap]'],'null');assert.equal(cursorRequest.query['token[is_verified_via_admin_panel]'],'false');
  await search(hash);await page.waitForURL(base+prefix+'/block/'+hash);await page.locator('.block-definitions').waitFor();
  await page.goto(base+prefix+'/search');hashMode='empty';await search(hash);await page.waitForURL(base+prefix+'/tx/'+hash);await page.locator('.transaction-definitions').waitFor();
  await page.goto(base+prefix+'/search');hashMode='failure';await search(hash);await page.waitForURL(base+prefix+'/search?q='+hash);await page.locator('.search-results [role="alert"]').waitFor();
  hashMode='block';await page.waitForTimeout(1100);await page.getByRole('button',{name:'Retry',exact:true}).click();await page.locator('.search-results a').waitFor();assert.equal(await page.locator('.search-results a').getAttribute('href'),prefix+'/block/'+hash);
  hashMode='slow';await page.goto(base+prefix+'/search');await search(hash);await search('NEW');await page.waitForURL(base+prefix+'/search?q=NEW');await page.waitForTimeout(750);assert.equal(new URL(page.url()).searchParams.get('q'),'NEW');
  await page.goto(base+prefix+'/search?q=INK');await page.locator('.search-results a').first().waitFor();delayedCursor=true;
  await page.getByRole('button',{name:'Load more',exact:true}).click();await search('NEW');await page.locator('.search-results a').filter({hasText:'New query token'}).waitFor();await page.waitForTimeout(750);assert.equal(await page.locator('.search-results a').count(),1,'Late pagination cannot replace a new query');
  await page.goto(base+prefix+'/');
  for(const [navigate,destination] of [[()=>navigateBlocks(page),'/blocks'],[()=>page.goBack(),'/']]){
   const lookup={started:Promise.withResolvers(),release:Promise.withResolvers(),finished:Promise.withResolvers()};
   heldLookup=lookup;
   try {
    await Promise.all([search(hash),page.waitForRequest(request=>new URL(request.url()).pathname===prefix+'/api/search'&&new URL(request.url()).searchParams.get('q')===hash)]);
    await lookup.started.promise;
    await navigate();
    await page.waitForURL(base+prefix+destination);
    await page.waitForFunction(()=>document.querySelector('header .global-search')?.getAttribute('aria-busy')==='false');
   } finally { lookup.release.resolve(); }
   await lookup.finished.promise;
   await page.waitForTimeout(200);
   assert.equal(new URL(page.url()).pathname,prefix+destination,'A departed lookup cannot take over navigation');
  }
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);assert.deepEqual(errors,[]);assert(requests.every(r=>r.path.startsWith(prefix+'/api/')));assert(destinationRequests.some(path=>path===prefix+'/api/explorer/blocks/'+hash));assert(destinationRequests.some(path=>path===prefix+'/api/explorer/transactions/'+hash));assert(destinationRequests.every(path=>path.startsWith(prefix+'/api/')));
  results.push({engine,prefix,width,passed:true,checks:'hash disambiguation, pending fallback, lookup outage/retry, retained query, cursor/nulls, page outage/retry, old-query cancellation, link and Back cancellation, native links, overflow, runtime errors, chain isolation'});
  await writeFile(output+'/results.json',JSON.stringify({results},null,2));console.log(`Search browser passed ${engine} ${prefix||'mainnet'} ${width}px`);await context.close();
 }
}finally{await browser.close();}

}
