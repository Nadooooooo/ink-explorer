import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4310',out=process.env.FILTER_DIALOG_OUTPUT||'reports/filters/dialog';await mkdir(out,{recursive:true});
const locales=['en','fr','es','pt','zh','ja','ru','ar','hi','bn'],results=[],axe=await readFile('node_modules/axe-core/axe.min.js','utf8');
const cases=locales.flatMap((locale,i)=>[320,1440].map(width=>({locale,width,height:900,prefix:i%2?'/testnet':'',theme:i%2?'dark':'light'})));
cases.push({locale:'fr',width:390,height:480,prefix:'',theme:'dark'},{locale:'ar',width:320,height:480,prefix:'/testnet',theme:'light'});
const hash=n=>'0x'+n.toString(16).padStart(64,'0'),address='0x'+'1'.repeat(40);
for(const [engine,launcher] of Object.entries({chromium,firefox,webkit}).filter(([name])=>!process.env.FILTER_DIALOG_ENGINES||process.env.FILTER_DIALOG_ENGINES.split(',').includes(name))){
 const browser=await launcher.launch(engine==='chromium'?{args:['--no-sandbox']}:{});
 try{for(const item of cases.filter(item=>!process.env.FILTER_DIALOG_LOCALES||process.env.FILTER_DIALOG_LOCALES.split(',').includes(item.locale))){
  const {locale,width,height,prefix,theme}=item,context=await browser.newContext({viewport:{width,height},colorScheme:theme,hasTouch:width<500}),page=await context.newPage(),errors=[],row={engine,...item,passed:false};
  page.on('pageerror',e=>errors.push(e.message));let requests=[],head=90000000,sequence=1,socket;
  const tx=n=>({hash:hash(n),block_hash:hash(n+100),block_number:n,timestamp:new Date().toISOString(),status:'ok',value:'0',from:{hash:address},to:{hash:address},fee:{value:'0'},transaction_types:['COIN_TRANSFER']});
  const block=n=>({hash:hash(n+100),height:n,timestamp:new Date().toISOString(),transactions_count:1,gas_used:'21000',gas_limit:'10000000'});
  const frame=()=>({type:'snapshot',protocol:'ink-observer.live.v1',sequence:sequence++,network:{chainId:prefix?763373:57073,expectedChainId:prefix?763373:57073,head,online:true,synced:true,stale:false,sampledAt:new Date().toISOString()},block:block(head),blocks:[block(head)],transactions:[tx(head)],utilization:{percentage:2}});
  const socketURL=base.replace(/^http/,'ws')+prefix+'/api/live';
  await context.route(`**${prefix}/api/live/config`,r=>r.fulfill({json:{url:socketURL}}));await context.route(`**${prefix}/api/live/snapshot`,r=>r.fulfill({json:frame()}));await page.routeWebSocket(socketURL,ws=>{socket=ws;ws.send(JSON.stringify(frame()));});
  await context.route(`**${prefix}/api/explorer/transactions*`,r=>r.fulfill({json:{items:[tx(head)],next_page_params:null}}));
  await context.route(`**${prefix}/api/stats/counters`,r=>r.fulfill({json:{counters:[{id:'newTxns24h',value:'462207'},{id:'txnsFee24h',value:'0.1417',units:'ETH'},{id:'averageTxnFee24h',value:'0.000000307',units:'ETH'}]}}));
  await context.route(`**${prefix}/api/v1/transactions*`,async r=>{requests.push(r.request().url());await r.fulfill({json:{items:[tx(100)],next_page_params:null}});});
  const dialog=page.locator('dialog.transaction-filter-dialog'),trigger=page.locator('.filter-trigger'),form=dialog.locator('form');
  const field=name=>form.locator(`[name="${name}"]`),open=async()=>{await trigger.click();await page.locator('dialog[open]').waitFor();};
  const checkBounds=async()=>{
   const box=await dialog.boundingBox();assert(box.x>=0&&box.y>=0&&box.x+box.width<=width+1&&box.y+box.height<=height+1,JSON.stringify(box));
   assert(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1));
   for(const button of await dialog.locator('.activity-actions button,.filter-close').all()){
    const rect=await button.boundingBox();assert(rect.y>=box.y&&rect.y+rect.height<=box.y+box.height+1);assert(rect.width>=44&&rect.height>=44);
   }
   const actionRects=await dialog.locator('.activity-actions button').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().toJSON()));assert(Math.abs(actionRects[0].top-actionRects[1].top)<1);assert(Math.abs(actionRects[0].height-actionRects[1].height)<1);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  };
  try{
   await page.goto(base+prefix+'/txs?lang='+locale,{waitUntil:'domcontentloaded'});await page.locator('.activity-ledger-transactions .tx-row').first().waitFor();await open();
   assert.equal(requests.length,0);assert.equal(new URL(page.url()).searchParams.has('activity'),false);assert.equal(await page.evaluate(()=>document.body.style.overflow),'hidden');
   await checkBounds();for(let n=0;n<12;n++){await page.keyboard.press(n%3===0?'Shift+Tab':'Tab');assert(await dialog.evaluate(el=>el.contains(document.activeElement)),'Keyboard focus escaped the dialog');}
   await form.locator('button[type="submit"]').focus();await page.keyboard.press('Tab');assert(await page.locator('.filter-close').evaluate(el=>el===document.activeElement));
   await page.locator('.app-header .brand').evaluate(el=>el.focus());assert(await dialog.evaluate(el=>el.contains(document.activeElement)),'Background is focusable during modal editing');
   await field('methods').fill('0xa9059cbb');head++;socket.send(JSON.stringify(frame()));await page.locator(`.activity-ledger-transactions a[href*="${hash(head)}"]`).waitFor();
   await page.keyboard.press('Escape');await page.locator('dialog[open]').waitFor({state:'hidden'});assert(await trigger.evaluate(el=>el===document.activeElement));assert.equal(requests.length,0);assert.equal(await page.evaluate(()=>document.body.style.overflow),'');
   await open();assert.equal(await field('methods').inputValue(),'');await page.mouse.click(2,2);await page.locator('dialog[open]').waitFor({state:'hidden'});assert(await trigger.evaluate(el=>el===document.activeElement));
   await open();await field('methods').fill('0xa9059cbb');await field('from_address_hashes_to_include').fill(address);await field('to_address_hashes_to_include').fill(address);await field('address_relation').selectOption('or');await field('status').selectOption('failed');
   await field('age_from').fill('2026-10-01T00:00');await field('age_to').fill('2026-10-17T00:00');await checkBounds();
   if(engine==='chromium'&&['fr','ar','hi'].includes(locale)){
    await page.evaluate(axe);const violations=await page.evaluate(async()=>(await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})));assert.deepEqual(violations,[]);
   }
   await page.screenshot({path:`${out}/${engine}-${locale}-${width}-${height}-open.png`});await form.locator('button[type="submit"]').click();await page.locator('dialog[open]').waitFor({state:'hidden'});await page.locator('.filtered-activity .table-shell[aria-busy="false"]').waitFor();
   assert.equal(await page.locator('.transaction-filter-chips > .filter-chip').count(),6);assert.equal(await page.locator('.filter-count').innerText(),'6');assert.equal(await page.evaluate(()=>document.body.style.overflow),'');assert(await trigger.evaluate(el=>el===document.activeElement));
   if(width<500){assert.equal(await page.locator('.transaction-filter-chips > .filter-chip:visible').count(),2);assert((await page.locator('.transaction-filter-chips').boundingBox()).height<=45);await page.locator('.filter-more').click();await page.locator('dialog[open]').waitFor();await page.keyboard.press('Escape');assert(await page.locator('.filter-more').evaluate(el=>el===document.activeElement));}
   const url=page.url(),appliedRequests=requests.length;await open();await field('methods').fill('0x11111111');await page.locator('.filter-close').click();assert.equal(page.url(),url);assert.equal(requests.length,appliedRequests);await open();assert.equal(await field('methods').inputValue(),'0xa9059cbb');await page.keyboard.press('Escape');
   await page.locator('.transaction-filter-chips > button').filter({has:page.locator('bdi', {hasText:'0xa9059cbb'})}).click();await page.locator('.filtered-activity .table-shell[aria-busy="false"]').waitFor();assert.equal(new URL(page.url()).searchParams.has('methods'),false);assert.equal(new URL(page.url()).searchParams.get('status'),'failed');assert(await trigger.evaluate(el=>el===document.activeElement));
   row.appliedTableTop=await page.locator('.filtered-activity .table-shell').evaluate(el=>el.getBoundingClientRect().top+scrollY);
   await page.screenshot({path:`${out}/${engine}-${locale}-${width}-${height}-applied.png`});
   await page.locator('.filter-reset').click();await page.locator('.activity-ledger-transactions .tx-row').first().waitFor();assert.equal(await page.locator('.transaction-filter-chips').count(),0);assert.equal(new URL(page.url()).searchParams.has('activity'),false);
   head++;socket.send(JSON.stringify(frame()));await page.locator(`.activity-ledger-transactions a[href*="${hash(head)}"]`).waitFor();
   await page.evaluate(()=>{history.pushState({},'',location.pathname+'?activity=filtered&status=failed&lang='+document.documentElement.lang);dispatchEvent(new PopStateEvent('popstate'));});await page.locator('.filtered-activity .table-shell[aria-busy="false"]').waitFor();assert.equal(await page.locator('.filter-count').innerText(),'1');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);row.passed=true;
  }catch(error){row.error=error.stack;await page.screenshot({path:`${out}/${engine}-${locale}-${width}-${height}-failure.png`}).catch(()=>{});}
  finally{await context.close();}results.push(row);console.log(JSON.stringify(row));await writeFile(out+'/results.json',JSON.stringify({base,complete:false,results},null,2));
 }}finally{await browser.close();}
}
await writeFile(out+'/results.json',JSON.stringify({base,complete:true,passed:results.every(r=>r.passed),results},null,2));if(results.some(r=>!r.passed))process.exitCode=1;
