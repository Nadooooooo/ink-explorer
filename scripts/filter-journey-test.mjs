import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4310',out=process.env.JOURNEY_OUTPUT||'reports/journeys/filters';
await mkdir(out,{recursive:true});
const a='0x'+'a'.repeat(40),b='0x'+'b'.repeat(40),hash='0x'+'1'.repeat(64),second='0x'+'2'.repeat(64),third='0x'+'3'.repeat(64);
const record={hash,block_number:123,timestamp:'2026-10-01T00:00:00Z',status:'ok',from:{hash:a},to:null,created_contract:{hash:b,is_contract:true},transaction_types:['CONTRACT_CREATION'],method:'0xa9059cbb',value:'900719925474099312345',fee:{value:'900719925474099312346'},position:0};
const axe=await readFile('node_modules/axe-core/axe.min.js','utf8'),results=[];
for(const [engine,launcher] of Object.entries({chromium,firefox,webkit}).filter(([name])=>!process.env.JOURNEY_ENGINES||process.env.JOURNEY_ENGINES.split(',').includes(name))){
 const browser=await launcher.launch(engine==='chromium'?{args:['--no-sandbox']}:{});
 try{for(const prefix of ['', '/testnet'])for(const width of [320,1440]){
  const theme=prefix?'light':'dark',timezoneId=width===320?'Europe/Paris':'UTC';
  const context=await browser.newContext({viewport:{width,height:900},colorScheme:theme,hasTouch:width===320,timezoneId,acceptDownloads:true,bypassCSP:true});
  const page=await context.newPage(),errors=[],requests=[],leaks=[],result={engine,prefix,width,theme,passed:false};
  let failure=false,empty=false;
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{const u=new URL(r.url());if(prefix && u.origin===new URL(base).origin && u.pathname.startsWith('/api/'))leaks.push(u.pathname);});
  // Filter journeys use a valid chain-scoped live transport. Transport
  // outages and reload recovery are covered by independent lifecycle gates.
  const socketURL=base.replace(/^http/,'ws')+prefix+'/api/live';
  const transport={configRequests:0,snapshotRequests:0,socketConnections:0};
  const liveFrame=()=>({protocol:'ink-observer.live.v1',type:'welcome',sequence:1,sentAt:new Date().toISOString(),
   network:{chainId:prefix?763373:57073,expectedChainId:prefix?763373:57073,online:true,synced:true,stale:false,head:123},blocks:[],transactions:[]});
  await context.route(base+prefix+'/api/live/config',r=>{transport.configRequests++;return r.fulfill({json:{url:socketURL}});});
  await context.route(base+prefix+'/api/live/snapshot',r=>{transport.snapshotRequests++;return r.fulfill({json:liveFrame()});});
  await context.routeWebSocket(socketURL,ws=>{transport.socketConnections++;ws.send(JSON.stringify(liveFrame()));});
  await context.route(/\/api\/explorer\/transactions(?:\?|$)/,route=>route.fulfill({json:{items:[record],next_page_params:null}}));
  await context.route(/\/api\/v1\/transactions(?:\?|$)/,async route=>{
   const u=new URL(route.request().url()),q=Object.fromEntries(u.searchParams);requests.push(q);
   if(q.cursor && failure)return route.fulfill({status:503,headers:{'retry-after':'1'},json:{error:'Controlled cursor outage'}});
   if(q.methods==='0x11111111')await new Promise(r=>setTimeout(r,700));
   const selected=q.methods==='0x22222222'?third:q.cursor?second:hash;
   return route.fulfill({json:{items:empty?[]:[{...record,hash:selected}],next_page_params:q.cursor?null:{cursor:'page2'}}}).catch(()=>{});
  });
  const form=page.locator('.activity-filter-form'),shell=page.locator('.filtered-activity .table-shell'),pager=shell.locator('.ledger-top-pagination').first();
  const ready=()=>page.locator('.filtered-activity .table-shell[aria-busy="false"]').waitFor();
  const field=name=>form.locator(`[name="${name}"]`);
  const apply=()=>form.locator('button[type="submit"]').click();
  const open=async()=>{await page.locator('.filter-trigger').click();await page.locator('dialog[open]').waitFor();};
  const close=async()=>{await page.locator('.filter-close').click();await page.locator('dialog[open]').waitFor({state:'hidden'});};
  try{
   await page.goto(base+prefix+'/txs?activity=filtered&status=failed&lang=en');await ready();
   assert.equal(await page.locator('dialog[open]').count(),0);await open();
   assert.equal(await form.getByRole('combobox',{name:'Status',exact:true}).inputValue(),'failed');
   const retainedRequests=requests.length;await close();assert.equal(new URL(page.url()).searchParams.get('status'),'failed');assert.equal(requests.length,retainedRequests);
   await page.locator('.filter-reset').click();assert(!new URL(page.url()).searchParams.has('status'));
   await page.locator(`.activity-ledger-transactions a[href$="/tx/${hash}"]`).first().waitFor();
   const plainDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Export this page · CSV',exact:true}).click();
   const plain=await plainDownload,plainFile=`${out}/${engine}-${prefix?'sepolia':'mainnet'}-${width}-unfiltered.csv`;await plain.saveAs(plainFile);
   const plainCsv=await readFile(plainFile,'utf8');assert.equal(plainCsv.trim().split('\r\n')[1].split(',')[4],`"${b}"`);

   const beforeOpening=requests.length;await open();assert.equal(requests.length,beforeOpening);assert.equal(await form.getByRole('combobox',{name:'Status',exact:true}).inputValue(),'');
   const paint=await form.locator('.primary-action').evaluate(el=>({background:getComputedStyle(el).backgroundColor,panel:getComputedStyle(el.closest('form')).backgroundColor}));
   assert.notEqual(paint.background,'rgba(0, 0, 0, 0)');assert.notEqual(paint.background,paint.panel);
   await field('methods').fill('transfer');const before=requests.length;await apply();
   await page.waitForFunction(()=>document.activeElement?.getAttribute('name')==='methods');
   assert.equal(await field('methods').getAttribute('aria-invalid'),'true');
   const described=await field('methods').getAttribute('aria-describedby');assert.ok(described);
   assert.match(await page.locator('[role="alert"]').innerText(),/four-byte/);assert.equal(requests.length,before);
   assert.equal(await page.evaluate(id=>document.getElementById(id)?.getAttribute('role'),described),'alert');
   await page.addScriptTag({content:axe});
   result.invalidViolations=await page.evaluate(async()=>(await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})));
   assert.deepEqual(result.invalidViolations,[]);
   await field('methods').fill(' 0xA9059CBB ');await field('from_address_hashes_to_include').fill(' '+a+' ');await field('to_address_hashes_to_include').fill(b);
   await field('transaction_types').selectOption('CONTRACT_CREATION');await form.getByRole('combobox',{name:'Status',exact:true}).selectOption('success');
   await field('age_from').fill('2026-09-30T00:00');await field('age_to').fill('2026-10-02T00:00');await apply();await ready();
   const q=requests.at(-1);assert.equal(q.methods,'0xa9059cbb');assert.equal(q.from_address_hashes_to_include,a);assert.equal(q.address_relation,'and');assert.equal(q.status,'success');assert.equal(q.age_from,width===320?'2026-09-29T22:00:00.000Z':'2026-09-30T00:00:00.000Z');
   assert.equal(await field('methods').getAttribute('aria-invalid'),null);
   assert.equal(await page.locator('dialog[open]').count(),0);
   await page.reload();await ready();await open();assert.equal(await field('from_address_hashes_to_include').inputValue(),a);assert.equal(await field('age_from').inputValue(),'2026-09-30T00:00');assert.equal(await form.getByRole('combobox',{name:'Status',exact:true}).inputValue(),'success');await close();
   assert.equal(await shell.locator('.ledger-columns').isVisible(),width===1440);
   const downloadPromise=page.waitForEvent('download');await shell.getByRole('button',{name:'Export this page · CSV',exact:true}).click();const download=await downloadPromise;
   const file=`${out}/${engine}-${prefix?'sepolia':'mainnet'}-${width}.csv`;await download.saveAs(file);
   const csv=await readFile(file,'utf8'),lines=csv.trim().split('\r\n');assert.equal(lines.length,2);
   const row=lines[1].split(',').map(cell=>cell.slice(1,-1));assert.equal(row.length,17);assert.equal(row[6],b);assert.equal(row[8],'900719925474099312345');assert.equal(row[12],'900719925474099312346');assert.equal(row[13],'0');assert.deepEqual(row.slice(14),['','','']);
   failure=true;await pager.getByRole('button',{name:'Next page',exact:true}).click();await shell.getByRole('alert').waitFor();
   assert.equal(await pager.getByRole('button',{name:'Next page',exact:true}).isDisabled(),true);assert.equal(await shell.getByRole('button',{name:'Export this page · CSV',exact:true}).isDisabled(),true);assert.equal(await shell.locator('.tx-row').count(),0,'A failed page is visibly unavailable');
   failure=false;await page.waitForTimeout(1100);await shell.getByRole('button',{name:'Retry',exact:true}).click();await shell.locator(`a[href$="/tx/${second}"]`).waitFor();await ready();assert.equal(await shell.locator(`a[href$="/tx/${second}"]`).count(),1);
   await pager.getByRole('button',{name:'Newest',exact:true}).click();await shell.locator(`a[href$="/tx/${hash}"]`).waitFor();await ready();assert.equal(await shell.locator(`a[href$="/tx/${hash}"]`).count(),1);
   await open();await field('age_to').fill('2026-09-29T00:00');const datesBefore=requests.length;await apply();await page.waitForFunction(()=>document.activeElement?.getAttribute('name')==='age_to');assert.equal(requests.length,datesBefore);assert.equal(await field('age_to').getAttribute('aria-invalid'),'true');
   await form.getByRole('button',{name:'Reset filters',exact:true}).click();await page.locator('.activity-ledger-transactions').waitFor();assert.equal(new URL(page.url()).searchParams.get('status'),null);await open();assert.equal(await field('methods').inputValue(),'');
   empty=true;await field('methods').fill('0x33333333');await apply();await ready();await shell.locator('.empty').waitFor();assert.equal(await shell.getByRole('button',{name:'Export this page · CSV',exact:true}).isDisabled(),true);
   assert.match(await shell.locator('.empty').innerText(),/continue to the next page/);assert.equal(await pager.getByRole('button',{name:'Next page',exact:true}).isEnabled(),true);
   await pager.getByRole('button',{name:'Next page',exact:true}).click();await shell.getByText('No records found',{exact:true}).waitFor();await ready();assert.equal(await pager.getByRole('button',{name:'Next page',exact:true}).isDisabled(),true);assert.doesNotMatch(await shell.locator('.empty').innerText(),/continue to the next page/);
   empty=false;await open();await field('methods').fill('0x11111111');const delayed=page.waitForRequest(r=>r.url().includes('methods=0x11111111'));await apply();await delayed;
   await open();await field('methods').fill('0x22222222');await apply();await ready();await page.waitForTimeout(850);assert.equal(await shell.locator(`a[href$="/tx/${third}"]`).count(),1);assert.equal(await shell.locator(`a[href$="/tx/${hash}"]`).count(),0);
   assert(transport.configRequests>=2,'Both initial document and reload discover their scoped socket');assert(transport.socketConnections>=2,'Both initial document and reload receive a valid socket welcome');result.transport={...transport};
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);assert.deepEqual(leaks,[]);
   await open();await page.screenshot({path:`${out}/${engine}-${prefix?'sepolia':'mainnet'}-${width}.png`});
   result.passed=true;result.checks=['opening does not query or replace unfiltered data','closing preserves applied filters','explicit reset and URL persistence','focus and ARIA validation','validations do not request API','trim pasted values','timezone and reload','visible column labels','17-column exact CSV with created contract','cursor outage/retry','date range focus','empty state','late query cancellation','no overflow or chain leakage'];
  }catch(error){result.error=error.stack;await page.screenshot({path:`${out}/failure-${engine}-${prefix?'sepolia':'mainnet'}-${width}.png`}).catch(()=>{});}
  results.push(result);console.log(JSON.stringify(result));await writeFile(out+'/results.json',JSON.stringify({base,complete:false,results},null,2));await context.close();
 }}finally{await browser.close();}
}
await writeFile(out+'/results.json',JSON.stringify({base,complete:true,passed:results.every(r=>r.passed),results},null,2));if(results.some(r=>!r.passed))process.exitCode=1;
