import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const base=process.env.BASE_URL||'http://127.0.0.1:4488';
const output=process.env.TRANSACTION_SUMMARY_OUTPUT||resolve('reports/transaction-summary-stability');
const rows=[],modes=['pending-control','ready-control','response-during-click'];
const a='0x'+'a'.repeat(40),b='0x'+'b'.repeat(40),hash='0x'+'1'.repeat(64);
const record={hash,block_number:123,timestamp:'2026-10-01T00:00:00Z',status:'ok',from:{hash:a},to:null,
  created_contract:{hash:b,is_contract:true},transaction_types:['CONTRACT_CREATION'],method:'0xa9059cbb',
  value:'900719925474099312345',fee:{value:'900719925474099312346'},position:0};
const counters={counters:[
  {id:'txnsFee24h',title:'Transaction fees · 24h',description:'Trailing 24-hour window.',units:'ETH',value:'0.2237'},
  {id:'averageTxnFee24h',title:'Avg. tx fee · 24h',description:'Trailing 24-hour window.',units:'ETH',value:'0.000000219'},
]};
await mkdir(output,{recursive:true});
const save=complete=>writeFile(resolve(output,'results.json'),JSON.stringify({at:new Date().toISOString(),base,complete,
  passed:complete&&rows.length===90&&rows.every(row=>row.passed),
  scope:'Real rendered transaction page, controlled late counter response and native pointer press/release. No forced click or wait before pressing the loading-page control.',rows},null,2));
for(const [engine,launcher]of Object.entries({chromium,firefox,webkit})){
  const browser=await launcher.launch(engine==='chromium'?{args:['--no-sandbox']}:{});
  try {for(const prefix of ['','/testnet'])for(const width of [320,390,760,761,1440])for(const mode of modes){
    const context=await browser.newContext({viewport:{width,height:900},colorScheme:'dark',hasTouch:width<500,timezoneId:'Europe/Paris'}),page=await context.newPage();
    const row={engine,network:prefix?'sepolia':'mainnet',width,mode,passed:false},errors=[];
    let release;const responseGate=new Promise(resolve=>release=resolve);
    page.on('pageerror',error=>errors.push(error.message));
    await context.routeWebSocket(/\/api\/live$/,socket=>socket.close());
    await context.route(/\/api\/live\/snapshot/,route=>route.fulfill({status:503,json:{error:'Controlled snapshot outage'}}));
    await context.route(/\/api\/explorer\/transactions(?:\?|$)/,route=>route.fulfill({json:{items:[record],next_page_params:null}}));
    await context.route(/\/api\/v1\/transactions(?:\?|$)/,route=>route.fulfill({json:{items:[record],next_page_params:{cursor:'page2'}}}));
    await context.route(/\/api\/stats\/counters$/,async route=>{
      await responseGate;
      await route.fulfill({json:counters,headers:{date:new Date().toUTCString(),'x-ink-data-status':'fresh','x-ink-data-fetched-at':new Date().toISOString()}}).catch(()=>{});
    });
    try {
      await page.goto(`${base}${prefix}/txs?activity=filtered&status=failed&lang=en`,{waitUntil:'domcontentloaded'});
      await page.locator('.filtered-activity .table-shell[aria-busy="false"]').waitFor();
      const summary=page.locator('.transaction-summary'),trigger=page.locator('.filter-trigger'),dialog=page.locator('dialog.transaction-filter-dialog');
      assert.equal(await summary.getAttribute('aria-busy'),'true','The interaction must start before counter data arrives');
      const before=await trigger.boundingBox();assert(before);
      if(mode==='pending-control'){
        await trigger.click();await page.locator('dialog[open]').waitFor();
        await page.locator('.filter-close').click();await dialog.waitFor({state:'hidden'});
        release();await page.locator('.transaction-summary[aria-busy="false"]').waitFor();
      }else if(mode==='ready-control'){
        release();await page.locator('.transaction-summary[aria-busy="false"]').waitFor();
        await trigger.click();await page.locator('dialog[open]').waitFor();
      }else{
        // Preserve the original pointer coordinate while a real HTTP response paints.
        // A summary that grows by more than half the control height cancels the click.
        const x=before.x+before.width/2,y=before.y+before.height/2;
        await page.mouse.move(x,y);await page.mouse.down();release();
        await page.locator('.transaction-summary[aria-busy="false"]').waitFor();
        const during=await trigger.boundingBox();row.during=during;
        await page.mouse.up();await page.locator('dialog[open]').waitFor();
      }
      if(mode!=='pending-control'){
        assert.equal(await trigger.getAttribute('aria-expanded'),'true');
        await page.locator('.filter-close').click();await dialog.waitFor({state:'hidden'});
      }
      const after=await trigger.boundingBox();assert(after);
      row.before=before;row.after=after;row.deltaY=after.y-before.y;
      assert(Math.abs(row.deltaY)<=1,`Late counter values moved the filter control by ${row.deltaY}px`);
      assert(Math.abs(after.height-before.height)<=1,'Counter arrival must not change the control height');
      assert.equal(await summary.locator('.metric').nth(1).locator('strong > span').innerText(),'0.2237');
      assert.equal(await summary.locator('.metric').nth(2).locator('strong > span').innerText(),'0.000000219');
      assert.deepEqual(await summary.locator('.metric strong > small').allTextContents(),['ETH','ETH']);
      const geometry=await summary.locator('.metric strong').evaluateAll(elements=>elements.slice(1).map(element=>({
        clipped:element.scrollWidth>element.clientWidth+1||element.scrollHeight>element.clientHeight+1,
        valueVisible:element.querySelector('span').getBoundingClientRect().height>0,
      })));
      assert(geometry.every(value=>!value.clipped&&value.valueVisible),'Exact counter values remain visible');
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      assert.deepEqual(errors,[]);row.passed=true;
      if(mode==='response-during-click')await page.screenshot({path:resolve(output,`${engine}-${row.network}-${width}.png`)});
    }catch(error){row.error=error.stack;row.errors=errors;await page.screenshot({path:resolve(output,`failure-${engine}-${row.network}-${width}-${mode}.png`)}).catch(()=>{});}
    finally{release();await context.close();}
    rows.push(row);console.log(`${row.passed?'PASS':'FAIL'} ${engine} ${row.network} ${width} ${mode}`);await save(false);
  }}finally{await browser.close();}
}
await save(true);assert.equal(rows.length,90);assert(rows.every(row=>row.passed),JSON.stringify(rows.filter(row=>!row.passed),null,2));
