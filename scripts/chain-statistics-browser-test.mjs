import assert from 'node:assert/strict';
import {chromium, webkit} from 'playwright-core';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import axe from 'axe-core';

const base=process.env.BASE_URL||'http://127.0.0.1:4211';
const out=process.env.CHAIN_STATS_OUTPUT||'reports/chain-stats/browser';
await mkdir(out,{recursive:true});
const results=[];
for(const engine of [chromium,webkit]) {
  const browser=await engine.launch(engine===chromium?{args:['--no-sandbox']}:{});
  try {for(const [prefix,chainId] of [['',57073],['/testnet',763373]])for(const [width,locale] of [[320,'fr'],[390,'ar'],[1440,'en']]) {
    const context=await browser.newContext({viewport:{width,height:900},bypassCSP:true});
    const page=await context.newPage(), errors=[];page.on('pageerror',error=>errors.push(error.message));
    let socket, sequence=1, chartReads=0, counterReads=0, indexerFails=false;
    const sentAt=new Date().toISOString();
    let frame={type:'snapshot',protocol:'ink-observer.live.v1',sequence,sentAt,network:{chainId,expectedChainId:chainId,head:59240000,online:true,synced:true,stale:false,gasPriceWei:1000000},block:{height:59240000,hash:'0x'+'a'.repeat(64),timestamp:sentAt},blocks:[],transactions:[]};
    await context.routeWebSocket(/\/api\/live$/,ws=>{socket=ws;ws.send(JSON.stringify(frame));});
    await context.route('**/api/**',route=>{
      const path=new URL(route.request().url()).pathname.replace(/^\/testnet/,'');
      const headers={'x-ink-data-status':'fresh','x-ink-data-fetched-at':new Date().toISOString(),date:new Date().toUTCString()};
      if(path==='/api/live/config')return route.fulfill({json:{url:base.replace(/^http/,'ws')+prefix+'/api/live'}});
      if(path==='/api/live/snapshot')return route.fulfill({json:frame});
      if(path==='/api/stats/counters') {
        counterReads++;
        if(indexerFails)return route.fulfill({status:503,json:{error:'Data source unavailable'}});
        return route.fulfill({headers,json:{counters:[{id:'totalBlocks',title:'Total blocks',description:'Number of blocks over all time',value:'59000000'},{id:'newTxns24h',title:'Transactions (24h)',description:'Number of new transactions within the last 24 hours',value:'123456'}]}});
      }
      if(path==='/api/stats/lines')return route.fulfill({headers,json:{sections:[{id:'transactions',title:'Transactions',charts:[{id:'newTxns',title:'New transactions',description:'Number of new transactions',units:null,resolutions:['DAY']}]}]}});
      if(path.startsWith('/api/stats/lines/')) {chartReads++;return route.fulfill({headers,json:{chart:[{date:'2026-10-20',value:'10'},{date:'2026-10-21',value:'20'}]}});}
      return route.fulfill({headers,json:{items:[]}});
    });
    const send=async change=>{frame={...frame,...change,sequence:++sequence};socket.send(JSON.stringify(frame));};
    try {
      await page.goto(base+prefix+'/stats?lang='+locale);
      await page.locator('.stats-totals summary').click();
      const total=page.locator('[data-counter="totalBlocks"]'),value=total.locator('strong');
      await page.waitForFunction(()=>document.querySelector('[data-counter="totalBlocks"] strong')?.title==='59240001');
      assert.notEqual(await value.getAttribute('title'),'59000000');
      await page.waitForTimeout(200);const initialReads={chartReads,counterReads};
      await send({network:{...frame.network,head:59240001},block:{...frame.block,height:59240001}});
      await page.waitForFunction(()=>document.querySelector('[data-counter="totalBlocks"] strong')?.title==='59240002');
      await send({network:{...frame.network,head:59239999},block:{...frame.block,height:59239999,hash:'0x'+'b'.repeat(64)}});
      await page.waitForFunction(()=>document.querySelector('[data-counter="totalBlocks"] strong')?.title==='59240000');
      assert.deepEqual({chartReads,counterReads},initialReads,'Block events must not refetch chart or aggregate data');
      await send({block:{...frame.block,timestamp:new Date(Date.parse(sentAt)-121000).toISOString()}});
      await page.waitForFunction(()=>document.querySelector('[data-counter="totalBlocks"] strong')?.textContent==='N/A');
      await send({block:{...frame.block,timestamp:sentAt}});
      await page.waitForFunction(()=>document.querySelector('[data-counter="totalBlocks"] strong')?.title==='59240000');
      await send({network:{...frame.network,online:false}});
      await page.waitForFunction(()=>document.querySelector('[data-counter="totalBlocks"] strong')?.textContent==='N/A');
      await send({network:{...frame.network,online:true}});
      await page.waitForFunction(()=>document.querySelector('[data-counter="totalBlocks"] strong')?.title==='59240000');
      indexerFails=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
      await page.locator('.counter-source-state').waitFor();
      assert.equal(await value.getAttribute('title'),'59240000','Indexer outage cannot hide a healthy node observation');
      const dictionary=JSON.parse(await readFile('src/locales/'+locale+'.json','utf8'));
      await total.getByRole('button').click();
      const text=dictionary['Canonical blocks from the local node, including genesis (block 0).'];
      assert(text);await page.getByText(text,{exact:true}).waitFor();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
      await page.addScriptTag({content:axe.source});
      const violations=await page.evaluate(async()=> (await axe.run(document)).violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>v.id));
      assert.deepEqual(violations,[]);assert.deepEqual(errors,[]);
      const name=`${engine.name()}-${prefix?'sepolia':'mainnet'}-${width}`;
      await page.screenshot({path:`${out}/${name}.png`});
      results.push({name,passed:true,checks:'canonical total, genesis, advancing head, rollback, stale/offline N/A, recovery, indexer independence, no chart refetch, translated help, layout and accessibility'});
      console.log('PASS',name);
    }catch(error) {
      await page.screenshot({path:`${out}/failure-${engine.name()}-${chainId}-${width}.png`}).catch(()=>{});
      await writeFile(`${out}/failure-${engine.name()}-${chainId}-${width}.json`,JSON.stringify({error:error.stack,errors,body:await page.locator('main').innerText()},null,2));
      throw error;
    }finally {await context.close();}
  }}finally{await browser.close();}
}
await writeFile(out+'/results.json',JSON.stringify({base,mockedApi:true,results},null,2));
