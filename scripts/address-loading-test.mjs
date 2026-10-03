import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const base=process.env.BASE_URL || 'http://127.0.0.1:4188';
const address='0x'+'1'.repeat(40), other='0x'+'2'.repeat(40);
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
const results=[];
try {
  for (const prefix of ['', '/testnet']) for (const width of [320,390,1440]) {
    const context=await browser.newContext({viewport:{width,height:900}});
    await context.routeWebSocket(/\/api\/live$/,ws=>ws.close());
    const page=await context.newPage(), errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.clock.install();
    let mode='hang', requests=0, held=[];
    await page.route('**/api/explorer/addresses/**',async route=>{
      const path=new URL(route.request().url()).pathname;
      if (path.endsWith('/transactions')) return mode==='section-error'
        ? route.fulfill({status:503,json:{error:'Activity temporarily unavailable'}})
        : route.fulfill({json:{items:[]}});
      if (path.endsWith('/token-balances')) return route.fulfill({json:mode==='summary-error'?null:[]});
      if (path.endsWith('/counters')) return route.fulfill({json:{transactions_count:path.includes(other)?22:11}});
      requests++;
      if (mode==='hang') { held.push(route); return; }
      if (mode==='html') return route.fulfill({contentType:'text/html',body:'<html>SPA fallback</html>'});
      if (mode==='null') return route.fulfill({json:null});
      if (mode==='wrong-address') return route.fulfill({json:{hash:other}});
      if (mode==='offline') return route.abort('internetdisconnected');
      return route.fulfill({json:{hash:path.endsWith(other)?other:address,coin_balance:mode==='corrected'?'7000000000000000000':'1000000000000000000',is_contract:false,
        ...(['matched','corrected','unavailable'].includes(mode)?{balance_check:{status:mode,...(mode!=='unavailable'?{source:'local',indexed_balance:'1000000000000000000'}:{})}}:{}),
      }});
    });
    await page.goto(base+prefix+'/',{waitUntil:'domcontentloaded'});
    await page.locator('.global-search input').fill(address);
    await page.locator('.search-submit').click();
    await page.waitForURL('**/address/'+address);
    await page.locator('main .loading').waitFor();
    await page.waitForFunction(()=>!!document.querySelector('main .loading'));
    assert(requests>0);
    await page.clock.fastForward(21_000);
    await page.locator('main .error-state').waitFor({timeout:3000});
    assert.match(await page.locator('main').innerText(),/timed out|Private API unavailable/);
    assert.equal(await page.locator('main .loading').count(),0);
    mode='ok';
    await page.locator('main .error-state button').click();
    await page.locator('.address-summary').waitFor();
    await page.locator('.address-activity .empty').waitFor({timeout:3000});
    assert.equal(new URL(page.url()).pathname,prefix+'/address/'+address);
    assert.match(await page.locator('main').innerText(),/1 ETH/);
    for (const failure of ['html','null','wrong-address','offline']) {
      mode=failure;
      await page.reload({waitUntil:'domcontentloaded'});
      await page.locator('main .error-state').waitFor();
      assert.equal(await page.locator('main .loading').count(),0,failure+' must exit loading');
      mode='ok';
      await page.locator('main .error-state button').click();
      await page.locator('.address-summary').waitFor();
      await page.locator('.address-activity .empty').waitFor({timeout:3000});
    }
    mode='summary-error';
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('.address-summary').waitFor();
    await page.locator('main .error-state').waitFor();
    assert.equal((await page.locator('.address-summary .metric').nth(2).innerText()).includes('0\n'),false,'Unavailable holdings must not claim zero');
    mode='ok';
    await page.locator('main .error-state button').click();
    await page.locator('.address-summary').waitFor();
    await page.waitForFunction(()=>document.querySelectorAll('main .error-state').length===0);
    await page.locator('.address-activity .empty').waitFor({timeout:3000});
    for(const status of ['matched','corrected','unavailable']) {
      mode=status;
      await page.reload({waitUntil:'domcontentloaded'});
      await page.locator('.address-summary').waitFor();
      const balanceText=await page.locator('.address-summary .metric').first().innerText();
      if(status==='unavailable') assert.match(balanceText,/Ink index.*node verification unavailable/s);
      else assert.match(balanceText,/Source · local node/);
      if(status==='corrected') {
        assert.match(balanceText,/7 ETH/);
        assert.match(balanceText,/Index balance differs/);
      } else assert.doesNotMatch(balanceText,/Index balance differs/);
    }
    mode='ok';
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('.address-summary').waitFor();
    // Exercise the tab failure deterministically, including mobile readability.
    if(width<=760) await page.locator('.section-picker select').selectOption('overview');
    else await page.locator('.section-navigation .tabs button').nth(0).click();
    mode='section-error';
    if(width<=760) await page.locator('.section-picker select').selectOption('transactions');
    else await page.locator('.section-navigation .tabs button').nth(1).click();
    const sectionError=page.locator('.address-activity .error-state');
    await sectionError.waitFor();
    const retry=sectionError.locator('button');
    const sizing=await retry.evaluate(el=>({font:parseFloat(getComputedStyle(el).fontSize),height:el.getBoundingClientRect().height,width:el.getBoundingClientRect().width}));
    if(width<=760) {
      assert(sizing.height>=44 && sizing.width>=44,'Retry must remain a usable touch target');
      assert(sizing.font>=12,'Retry must remain readable on mobile');
    }
    mode='ok';
    await retry.click();
    await sectionError.waitFor({state:'detached'});
    assert.equal(new URL(page.url()).pathname,prefix+'/address/'+address);
    if(width<=760) assert.equal(await page.locator('.section-picker select').inputValue(),'transactions');
    else assert.equal(await page.locator('.section-navigation .tabs button').nth(1).getAttribute('aria-pressed'),'true');
    // A late request for another address cannot replace this profile or counters.
    mode='hang';
    await page.evaluate(id=>{history.pushState({},'',location.pathname.replace(/0x[\da-f]{40}$/,id));dispatchEvent(new PopStateEvent('popstate'));},other);
    await page.locator('main .loading').waitFor();
    mode='ok';
    await page.evaluate(id=>{history.pushState({},'',location.pathname.replace(/0x[\da-f]{40}$/,id));dispatchEvent(new PopStateEvent('popstate'));},address);
    await page.locator('.address-summary').waitFor();
    for (const route of held) await route.fulfill({json:{hash:other,coin_balance:'9000000000000000000'}}).catch(()=>{});
    assert.match(await page.locator('main').innerText(),/1 ETH/);
    await page.route('**/api/network',route=>route.fulfill({json:{online:true,synced:true,head:800000,chainId:prefix?763373:57073,sampledAt:new Date().toISOString(),derivation:{online:true,synced:false,l1Head:70000,l1Block:1000,lag:69000},l1Rpc:{online:false,upstreams:[]}}}));
    await page.goto(base+prefix+'/network',{waitUntil:'domcontentloaded'});
    await page.locator('.health-banner').waitFor();
    assert.match(await page.locator('.health-banner').innerText(),/L1 validation behind/);
    assert.doesNotMatch(await page.locator('.health-banner').innerText(),/Operational|Synced to/);
    assert.deepEqual(errors,[]);
    results.push({prefix,width,passed:true});
    await context.close();
  }
  await mkdir('reports/address-loading',{recursive:true});
  await writeFile('reports/address-loading/results.json',JSON.stringify({recordedAt:new Date().toISOString(),results},null,2));
  console.log('Address loading passed: pasted address, deadline, retry, HTML/null/wrong-address/offline responses, missing holdings, balance provenance/disagreement, readable section retry and navigation races on both networks at 320/390/1440 px.');
} finally { await browser.close(); }
