import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';

const base=process.env.BASE_URL||'http://127.0.0.1:4311';
const out=process.env.TEXT_OUTPUT||'reports/text-layout/verified';
const profiles=process.env.TEXT_PROFILES?.split(',')||['chromium','firefox','webkit','firefox-large'];
const widths=(process.env.TEXT_WIDTHS||'320,390,768,1180,1440').split(',').map(Number);
const results=[];
await mkdir(out,{recursive:true});

async function inspect(page,selectors,checkLines=false) {
  const errors=await page.evaluate(({selectors,checkLines})=>{
    const errors=[];
    for(const e of document.querySelectorAll(selectors)){
      if(!e.checkVisibility())continue;
      const box=e.getBoundingClientRect();
      if(box.left < -1 || box.right>innerWidth+1)errors.push(`${e.className}: outside viewport`);
      // Check actual glyph line boxes: computed fontSize does not expose
      // Firefox's minimum-font preference.
      const walk=document.createTreeWalker(e,NodeFilter.SHOW_TEXT);
      let n;while(n=walk.nextNode()){
        if(!n.textContent.trim()||!n.parentElement.checkVisibility()||n.parentElement.closest('.sr-only,[aria-hidden="true"]'))continue;
        const range=document.createRange();range.selectNodeContents(n);
        const rects=[...range.getClientRects()].filter(r=>r.width&&r.height);
        for(const r of rects)if(r.top<box.top-2||r.bottom>box.bottom+2||r.left<box.left-2||r.right>box.right+2)
          errors.push(`${e.className}: text escapes its box (${n.textContent.trim().slice(0,40)})`);
        if(checkLines)for(let i=1;i<rects.length;i++)
          if(rects[i].top>rects[i-1].top+2 && rects[i].top<rects[i-1].bottom-2)
            errors.push(`${e.className}: overlapping text lines`);
      }
    }
    return errors;
  },{selectors,checkLines});
  assert.deepEqual(errors,[]);
}

for(const profile of profiles){
  const large=profile.endsWith('-large'),engine=profile.replace('-large','');
  const browser=await({chromium,firefox,webkit})[engine].launch(large?{firefoxUserPrefs:{'font.minimum-size.x-western':24}}:engine==='chromium'?{args:['--no-sandbox']}:{});
  try{for(const width of widths){
    const context=await browser.newContext({viewport:{width,height:1000},colorScheme:width<=390?'dark':'light',hasTouch:width<900,acceptDownloads:true});
    const page=await context.newPage(),errors=[];
    page.setDefaultTimeout(15000);
    page.on('pageerror',e=>errors.push(e.message));
    let chartStale=false;
    await context.route('**/api/overview',route=>route.fulfill({
      headers:{'x-ink-data-status':'fresh','x-ink-data-fetched-at':new Date().toISOString(),date:new Date().toUTCString()},
      json:{stats:{total_addresses:'12345678'},blocks:[],transactions:[],
        chart:Array.from({length:30},(_,n)=>({date:new Date(Date.now()-(29-n)*86400000).toISOString().slice(0,10),transactions_count:300000+n*1000}))}
    }));
    await context.route('**/api/stats/lines/newTxns*',route=>route.fulfill({
      headers:{'x-ink-data-status':chartStale?'stale':'fresh','x-ink-data-fetched-at':new Date().toISOString(),date:new Date().toUTCString()},
      json:{info:{id:'newTxns',title:'New transactions',description:'Transactions per day',units:null,resolutions:['DAY']},
        chart:[0,1,2].map(n=>({date:new Date(Date.now()-(2-n)*86400000).toISOString().slice(0,10),value:'1000'}))}
    }));
    for(const route of (process.env.TEXT_ROUTES?.split(',').map(x=>x==='home'?'':x)||['','stats','pools','stats/newTxns'])){
      const row={profile,width,route,passed:false};
      try{
        chartStale=route==='stats/newTxns';
        await page.goto(`${base}/${route}?lang=fr`,{waitUntil:'domcontentloaded'});
        await page.locator('main').waitFor();
        await page.evaluate(()=>document.fonts.ready);
        await page.waitForTimeout(350);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'Page overflows');
        await inspect(page,'.app-header .brand');
        assert(await page.locator('.app-header .brand').evaluate(e=>{
          const img=e.querySelector('img').getBoundingClientRect(),caption=e.querySelector('span').getBoundingClientRect();
          return caption.top>=img.bottom-1;
        }),'Brand caption overlaps logo');
        if(route===''){
          await page.locator('.signal-main .chart-axis').waitFor();
          await inspect(page,'.home-overview .utilization-metric .info-button,.home-overview .section-title h2,.home-overview .chart-heading-actions,.home-overview .chart-axis',true);
          const brokenWords=await page.evaluate(()=>{
            const broken=[];
            for(const e of document.querySelectorAll('.home-overview .metric-top > span,.home-overview .info-visible-label')){
              for(const n of e.childNodes)if(n.nodeType===Node.TEXT_NODE)
                for(const word of n.textContent.matchAll(/\p{L}{5,}/gu)){
                  const r=document.createRange();r.setStart(n,word.index);r.setEnd(n,word.index+word[0].length);
                  if(new Set([...r.getClientRects()].map(b=>Math.round(b.y))).size>1)broken.push(word[0]);
                }
            }
            return broken;
          });
          assert.deepEqual(brokenWords,[],'A home metric splits an ordinary word');
          await page.locator('.utilization-metric .info-button').click();
          await page.locator('.info-floating[role="note"]').waitFor();
          await page.keyboard.press('Escape');
          assert.equal(await page.locator('.utilization-metric .info-button').getAttribute('aria-expanded'),'false');
        }else if(route==='stats'){
          await page.locator('.stats-essential article').first().waitFor();
          await inspect(page,'.stats-counters article > div,.stats-counters article > strong',true);
          await page.locator('.stats-totals summary').click();
          await inspect(page,'.stats-counters article > div,.stats-counters article > strong',true);
          row.cards=await page.locator('.stats-counters article').count();
          await page.locator('.stats-totals summary').click();
        }else if(route==='pools'){
          const input=page.locator('.pool-search input'),reset=page.locator('.pool-filter-status button');
          await input.fill('ETH');
          assert(await reset.isEnabled());
          await inspect(page,'.pool-filter-status');
          const boxes=await page.locator('.pool-search').evaluate(e=>{
            const a=e.getBoundingClientRect(),b=e.querySelector('input').getBoundingClientRect();
            return {left:b.left-a.left,right:a.right-b.right};
          });
          assert(boxes.left>=0&&boxes.right>=-1,'Pool search escapes its field');
          assert.equal(await input.evaluate(e=>getComputedStyle(e).backgroundColor),'rgba(0, 0, 0, 0)','Input paints over its field’s rounded corner');
          await reset.click();
          assert.equal(await input.inputValue(),'');
          assert(await reset.isDisabled());
          const toggle=page.locator('.pool-filter-toggle');
          if(await toggle.isVisible())await toggle.click();
          await inspect(page,'.pool-filter-grid > label',true);
          await page.locator('.pool-filter-grid select').nth(1).selectOption('asc');
          assert(await reset.isEnabled());
          await reset.click();
          assert.equal(await page.locator('.pool-filter-grid select').nth(1).inputValue(),'desc');
        }else{
          const chart=page.locator('article.stat-chart');
          await chart.locator('.chart-error').waitFor();
          await chart.locator('.chart-data summary').click();
          const csv=chart.locator('.chart-data > button');
          assert(await csv.isDisabled());
          await inspect(page,'.chart-data > button',true);
          const disabled=await csv.evaluate(e=>({color:getComputedStyle(e).color,opacity:getComputedStyle(e).opacity}));
          chartStale=false;
          await chart.locator('.chart-error button').click();
          await page.waitForFunction(()=>!document.querySelector('.chart-data > button')?.disabled);
          const enabled=await csv.evaluate(e=>({color:getComputedStyle(e).color,opacity:getComputedStyle(e).opacity}));
          assert.notDeepEqual(disabled,enabled,'Disabled export looks active');
          const download=page.waitForEvent('download');
          await csv.click();await(await download).saveAs(`${out}/${profile}-${width}-chart.csv`);
          row.csvStates={disabled,enabled};
        }
        assert.deepEqual(errors,[]);
        await page.screenshot({path:`${out}/${profile}-${width}-${route.replaceAll('/','-')||'home'}.png`});
        row.passed=true;
      }catch(e){
        row.error=e.stack;
        await page.screenshot({path:`${out}/${profile}-${width}-${route.replaceAll('/','-')||'home'}-failure.png`}).catch(()=>{});
      }
      results.push(row);console.log(JSON.stringify(row));
      await writeFile(`${out}/results.json`,JSON.stringify({base,complete:false,results},null,2));
    }
    await context.close();
  }}finally{await browser.close();}
}
await writeFile(`${out}/results.json`,JSON.stringify({base,complete:true,passed:results.every(r=>r.passed),minimumFont:24,physicalDevices:false,results},null,2));
if(results.some(r=>!r.passed))process.exitCode=1;
