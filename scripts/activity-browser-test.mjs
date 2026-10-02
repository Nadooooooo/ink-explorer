import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import axe from 'axe-core';
const base=process.env.BASE_URL || 'http://127.0.0.1:4188';
const output=process.env.ACTIVITY_REVIEW_DIR || 'reports/activity';await mkdir(output,{recursive:true});
const a='0x'+'a'.repeat(40),b='0x'+'b'.repeat(40),hash='0x'+'1'.repeat(64),h2='0x'+'2'.repeat(64);
const results=[];
for(const [engine,type] of [['chromium',chromium],['firefox',firefox],['webkit',webkit]]) {
 const browser=await type.launch(engine==='chromium'?{executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']}:{});
 try{for(const prefix of ['', '/testnet'])for(const width of [320,768,844,1440]){
  const context=await browser.newContext({viewport:{width,height:width===844?390:900},hasTouch:width<=844,acceptDownloads:true,timezoneId:width===320?'Europe/Paris':'UTC'});
  await context.routeWebSocket(/\/api\/live$/,ws=>ws.close());
  const page=await context.newPage(),errors=[],requests=[],leaks=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{const u=new URL(r.url());if(prefix && u.origin===new URL(base).origin && u.pathname.startsWith('/api/'))leaks.push(u.pathname);});
  let failure=false,empty=false,race=false;
  await page.route(/\/api\/explorer\/advanced-filters(?:\?|$)/,async route=>{
   const u=new URL(route.request().url());requests.push(Object.fromEntries(u.searchParams));
   if(failure)return route.fulfill({status:502,json:{error:'Controlled activity outage'}});
   const cursor=u.searchParams.has('block_number');
   const value=u.searchParams.get('amount_from')==='500'?'500':'900719925474099312345';
   const payload={items:empty?[]:[{hash:cursor?h2:hash,block_number:100,transaction_index:0,token_transfer_index:cursor?1:0,internal_transaction_index:null,token_transfer_batch_index:null,status:'success',timestamp:'2026-09-30T00:00:00Z',from:{hash:a},to:{hash:b},method:'0xa9059cbb',type:'ERC-20',fee:'0',total:{value,decimals:'6'},token:{address_hash:a,decimals:'6',symbol:'=malicious,"name"'}}],next_page_params:cursor?null:{block_number:100,transaction_index:0,token_transfer_index:0,internal_transaction_index:null,token_transfer_batch_index:null}};
   if(race && u.searchParams.get('amount_from')==='400')await new Promise(r=>setTimeout(r,600));
   await route.fulfill({json:payload}).catch(()=>{});
  });
  await page.goto(base+prefix+'/txs?activity=filtered');await page.locator('.activity-record').waitFor();
  const form=page.locator('.activity-filter-form');
  const modeBounds=await page.locator('.ledger-filters').boundingBox(), formBounds=await form.boundingBox();
  assert.ok(formBounds.y>=modeBounds.y+modeBounds.height+12,`${engine} ${width}: activity filters overlap mode controls`);
  if(width<=844)assert.ok(await form.locator('input,select').evaluateAll(fields=>fields.every(field=>parseFloat(getComputedStyle(field).fontSize)>=16 && field.getBoundingClientRect().height>=44)),`${engine} ${width}: touch fields need 16px text and 44px height`);
  await form.getByLabel('Activity type',{exact:true}).selectOption('ERC-20');
  await form.getByLabel('Method selector',{exact:true}).fill('0xa9059cbb');
  await form.getByLabel('From',{exact:true}).fill(a);await form.getByLabel('To',{exact:true}).fill(b);
  await form.getByLabel('Token contract',{exact:true}).fill(a);
  await form.getByLabel('From date',{exact:true}).fill('2026-09-29T00:00');await form.getByLabel('To date',{exact:true}).fill('2026-10-01T00:00');
  await form.getByLabel('Minimum amount',{exact:true}).fill('9007199254740993');
  await form.getByLabel('Maximum amount',{exact:true}).fill('999999999999999999999');
  await form.getByRole('button',{name:'Apply filters',exact:true}).click();
  await page.locator('.filtered-activity .table-shell[aria-busy="false"]').waitFor();
  let last=requests.at(-1);
  assert.equal(last.address_relation,'and');assert.equal(last.amount_from,'9007199254740993');assert.equal(last.methods,'0xa9059cbb');assert.equal(last.transaction_types,'ERC-20');assert.equal(last.from_address_hashes_to_include,a);assert.equal(last.to_address_hashes_to_include,b);assert.equal(last.token_contract_address_hashes_to_include,a);
  assert.equal(last.age_from,width===320?'2026-09-28T22:00:00.000Z':'2026-09-29T00:00:00.000Z');
  assert.ok(page.url().includes('amount_from=9007199254740993'));
  await page.reload();await page.locator('.activity-record').waitFor();assert.equal(await form.getByLabel('Minimum amount',{exact:true}).inputValue(),'9007199254740993');
  await page.getByRole('button',{name:'Older',exact:true}).click();await page.locator('.activity-record').filter({hasText:h2.slice(0,7)}).waitFor();
  last=requests.at(-1);assert.equal(last.amount_from,'9007199254740993');assert.equal(last.internal_transaction_index,'null');
  assert.equal(await page.getByRole('button',{name:'Older',exact:true}).isDisabled(),true);
  const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Export this page · CSV',exact:true}).click();const download=await downloaded;
  const file=`${output}/${engine}-${prefix?'sepolia':'mainnet'}-${width}.csv`;await download.saveAs(file);const csv=await readFile(file,'utf8');
  assert.ok(csv.includes('"900719925474099312345"'));assert.ok(csv.includes('"\'=malicious,""name"""'));assert.ok(csv.includes(h2));assert.equal(csv.split('\r\n').filter(Boolean).length,2);
  const n=requests.length;await form.getByLabel('Method selector',{exact:true}).fill('transfer');await form.getByRole('button',{name:'Apply filters',exact:true}).click();await page.getByRole('alert').filter({hasText:'four-byte'}).waitFor();assert.equal(requests.length,n);
  await form.getByLabel('Method selector',{exact:true}).fill('0xa9059cbb');
  failure=true;await form.getByRole('button',{name:'Apply filters',exact:true}).click();await page.getByRole('alert').filter({hasText:'Controlled activity outage'}).waitFor();
  failure=false;await page.getByRole('button',{name:'Retry',exact:true}).click();await page.locator('.activity-record').waitFor();
  empty=true;await form.getByRole('button',{name:'Apply filters',exact:true}).click();await page.locator('.filtered-activity .empty').waitFor();assert.equal(await page.getByRole('button',{name:'Export this page · CSV',exact:true}).isDisabled(),true);
  empty=false;race=true;
  await form.getByLabel('Minimum amount',{exact:true}).fill('400');await form.getByRole('button',{name:'Apply filters',exact:true}).click();await page.waitForTimeout(40);
  await form.getByLabel('Minimum amount',{exact:true}).fill('500');await form.getByRole('button',{name:'Apply filters',exact:true}).click();await page.waitForTimeout(800);
  assert.equal(await page.locator('.activity-record').count(),1);assert.equal(requests.at(-1).amount_from,'500');
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);assert.ok(overflow<=1,`${engine} ${width}: overflow ${overflow}`);
  await page.evaluate(axe.source);const violations=await page.evaluate(async()=>(await window.axe.run()).violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})));
  assert.deepEqual(violations,[]);assert.deepEqual(errors,[]);assert.deepEqual(leaks,[]);
  if(width===320){await page.evaluate(()=>{document.activeElement?.blur();scrollTo(0,0);});await page.screenshot({path:`${output}/${engine}-${prefix?'sepolia':'mainnet'}-mobile.png`,fullPage:true});}
  results.push({engine,prefix,width,passed:true,checks:'combinations, timezone, URL/reload, cursors, exact/safe CSV, validation, failure/retry, empty, races, overflow, accessibility, network isolation'});
  await writeFile(`${output}/results.json`,JSON.stringify({results},null,2));console.log(`${engine} ${prefix||'mainnet'} ${width}px passed`);await context.close();
 }}finally{await browser.close();}
}
