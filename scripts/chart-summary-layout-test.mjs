import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {mkdir, readFile, writeFile} from 'node:fs/promises';

const base = process.env.BASE_URL || 'http://127.0.0.1:4310';
const out = process.env.CHART_SUMMARY_OUTPUT || 'reports/chart-integrity/summary-layout';
const locales = ['en','fr','es','pt','zh','ja','ru','ar','hi','bn'];
const results = [];
await mkdir(out,{recursive:true});
const browser = await chromium.launch({args:['--no-sandbox']});
try {
  for (const locale of locales) for (const metric of ['newAccounts','averageTxnFee']) {
    const context = await browser.newContext({viewport:{width:320,height:900},hasTouch:true});
    const page = await context.newPage();
    const row = {locale,metric,width:320,passed:false};
    try {
      const dictionary = JSON.parse(await readFile(`src/locales/${locale}.json`));
      const info = {id:metric,title:metric==='newAccounts'?'New accounts':'Average transaction fee',description:'Summary layout fixture',units:metric==='newAccounts'?null:'ETH',resolutions:['DAY','WEEK']};
      const date = days => new Date(Date.now()-days*86400000).toISOString().slice(0,10);
      const chart = (metric==='newAccounts'?['641','653','1791']:['0.000000039523276180478064','0.000001442','0.000000239193511284625']).map((value,i)=>({date:date(2-i),value,is_approximate:i===2}));
      await page.route('**/api/stats/lines',route=>route.fulfill({json:{sections:[{id:'transactions',title:'Transactions',charts:[info]}]}}));
      await page.route(`**/api/stats/lines/${metric}?**`,route=>route.fulfill({json:{info,chart}}));
      await page.goto(`${base}/stats/${metric}?lang=${locale}`,{waitUntil:'domcontentloaded'});
      await page.locator('.stat-chart[aria-busy=false] .interactive-chart').waitFor();
      await page.evaluate(()=>document.fonts.ready);
      assert.equal(await page.locator('.chart-axis > span').first().innerText(),dictionary['Incomplete interval']||'Incomplete interval');
      await page.locator('.chart-data summary').click();
      assert.equal(await page.locator('.chart-data th').nth(1).innerText(),dictionary['Raw value']||'Raw value');
      row.geometry = await page.locator('.chart-period-summary > div').evaluateAll(cards=>cards.map(card=>{
        const strong = card.querySelector('strong'), box = card.getBoundingClientRect();
        const range = document.createRange(), text = strong.firstChild;
        const end = text.textContent.indexOf(' ');
        range.setStart(text,0); range.setEnd(text,end<0?text.length:end);
        return {text:strong.textContent,top:box.top,bottom:box.bottom,left:box.left,right:box.right,numericLines:[...range.getClientRects()].map(r=>({top:r.top,left:r.left,right:r.right}))};
      }));
      for (const card of row.geometry) {
        assert(card.left>=0 && card.right<=320,'Summary card must fit the viewport');
        assert(card.numericLines.length && card.numericLines.every(line=>Math.abs(line.top-card.numericLines[0].top)<1),'Numeric part must not break across lines');
        assert(card.numericLines.every(line=>line.left>=card.left && line.right<=card.right),'Numeric part must fit inside its card');
        for (const peer of row.geometry.filter(peer=>Math.abs(peer.top-card.top)<1)) assert(Math.abs(peer.bottom-card.bottom)<1,'Cards on the same row must align');
      }
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal document overflow');
      await page.screenshot({path:`${out}/${locale}-${metric}.png`});
      row.passed=true;
    } catch(error) { row.error=error.stack; }
    finally {await context.close();}
    results.push(row);
    console.log(JSON.stringify({locale,metric,passed:row.passed,error:row.error}));
  }
} finally {await browser.close();}
await writeFile(`${out}/results.json`,JSON.stringify({base,complete:true,passed:results.every(row=>row.passed),results},null,2));
if(results.some(row=>!row.passed))process.exitCode=1;
