import assert from 'node:assert/strict';
import { chromium, firefox, webkit } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.BASE_URL || 'http://127.0.0.1:4188';
const output = process.env.MOBILE_OUTPUT || 'screenshots/mobile-usability';
const engines = (process.env.MOBILE_BROWSERS || 'chromium').split(',');
const widths = (process.env.MOBILE_WIDTHS || '320,390,430,844').split(',').map(Number).filter(width => width > 0);
const api = async path => { const r = await fetch(`${base}/api/${path}`); assert.ok(r.ok, path); return r.json(); };
const [overview, tokens, pools] = await Promise.all([api('overview'), api('explorer/tokens'), api('contract-info/pools')]);
const address = '/address/0x4200000000000000000000000000000000000006';
const routes = [
  ['home', '/'], ['blocks', '/blocks'], ['transactions', '/txs'], ['filtered-activity','/txs?activity=filtered'], ['tokens', '/tokens'], ['token-transfers','/token-transfers'],
  ['deposits','/deposits'], ['withdrawals','/withdrawals'], ['internal-txs','/internal-txs'], ['accounts','/accounts'],
  ['pools', '/pools'], ['contracts', '/contracts'], ['analytics', '/analytics'],
  ['advanced', '/advanced'], ['developers', '/developers'], ['network', '/network'],
  ['search', '/search?q=WETH'], ['block', `/block/${overview.blocks[0].height}`],
  ['transaction', `/tx/${overview.transactions[0].hash}`], ['address', address],
  ['token', `/token/${tokens.items[0].address_hash}`], ['pool', `/pools/${pools.items[0].pool_id}`],
  ['nft', '/token/0x1b35d13a2E2528f192637F14B05f0Dc0e7dEB566/instance/545'], ['missing', '/missing-page'],
];
const requestedRoutes = (process.env.MOBILE_ROUTE_NAMES || '').split(',').map(name => name.trim()).filter(Boolean);
const reviewRoutes = requestedRoutes.length ? routes.filter(([name]) => requestedRoutes.includes(name)) : routes;
assert.ok(reviewRoutes.length, 'MOBILE_ROUTE_NAMES did not match any review route');
assert.equal(reviewRoutes.length, requestedRoutes.length || reviewRoutes.length, 'MOBILE_ROUTE_NAMES contains an unknown or duplicate route');
const failures = [], results = [];
await mkdir(output, { recursive: true });
async function visit(page, route) {
  await page.goto(base + route, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForFunction(() => !document.querySelector('main > .loading'), { timeout: 30000 });
}
async function inspect(page, name, width) {
  const result = await page.evaluate(() => {
    const visible = e => { const r=e.getBoundingClientRect(),s=getComputedStyle(e); return r.width>1 && r.height>1 && s.visibility!=='hidden' && s.display!=='none' && !e.closest('[hidden]'); };
    const describe = e => `${e.tagName.toLowerCase()}.${typeof e.className==='string'?e.className:''}: ${(e.getAttribute('aria-label')||e.textContent||'').trim().slice(0,55)}`;
    const controls = [...document.querySelectorAll('.header-search,.drawer-trigger,.mobile-search-trigger,.desktop-navigation :is(button,a),.utility-bar .language-picker select,.theme-control select,.section-picker select,.chart-range select,.global-search input,.search-submit,.pool-search input,.pool-filter-grid select,.analytics-actions button,.pagination button,.pool-pagination button,.contract-interaction button')].filter(visible);
    const undersized = controls.filter(e=>{const r=e.getBoundingClientRect();return r.height<43.5 || r.width<43.5}).map(describe);
    const fields = [...document.querySelectorAll('input,select,textarea')].filter(visible);
    const tinyFields = fields.filter(e=>parseFloat(getComputedStyle(e).fontSize)<16).map(describe);
    const smallText = (innerWidth <=760 || matchMedia("(pointer: coarse)").matches) ? [...document.querySelectorAll('main *')].filter(e=>visible(e) && !e.closest('.sr-only,.entity-mark,.pool-icons,.nft-placeholder') && e.tagName!=='I' && [...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize)<11.99).map(describe) : [];
    const header = [...document.querySelectorAll('header > *')].filter(visible).filter(e=>e.tagName!=='NAV');
    const headerCollisions = header.flatMap((a,i)=>header.slice(i+1).filter(b=>{const x=a.getBoundingClientRect(),y=b.getBoundingClientRect();return Math.min(x.right,y.right)-Math.max(x.left,y.left)>1&&Math.min(x.bottom,y.bottom)-Math.max(x.top,y.top)>1;}).map(b=>`${describe(a)} / ${describe(b)}`));
    const movingDecoration = (innerWidth <= 760 || matchMedia('(pointer: coarse)').matches || document.querySelector('.nft-media'))
      ? [...document.querySelectorAll('.liquid-atmosphere i')].filter(element => getComputedStyle(element).animationName !== 'none').length : 0;
    const networkSelect = [...document.querySelectorAll('.network-picker select')].find(visible);
    const networkStyle = networkSelect ? getComputedStyle(networkSelect) : null;
    const luminance = value => value.match(/[\d.]+/g).slice(0,3).map(Number).map(channel => channel / 255).map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4).reduce((total, channel, index) => total + channel * [.2126,.7152,.0722][index],0);
    let backdrop = networkSelect;
    while (backdrop && getComputedStyle(backdrop).backgroundColor === 'rgba(0, 0, 0, 0)') backdrop = backdrop.parentElement;
    const foreground = networkStyle ? luminance(networkStyle.color) : null, background = backdrop ? luminance(getComputedStyle(backdrop).backgroundColor) : null;
    const networkContrast = networkStyle ? (Math.max(foreground,background) + .05) / (Math.min(foreground,background) + .05) : null;
    const nativeNetworkChrome = networkStyle ? networkStyle.appearance !== 'none' : false;
    const transactionLabels = document.querySelector('main .tx-labels');
    let confirmationLabelSize = null;
    if (transactionLabels) {
      // Confirmations depend on live transaction state, so keep this style
      // guard deterministic even when the visible rows are all successful.
      const sample = document.createElement('span');
      sample.className = 'confirmation-label';
      sample.textContent = 'Confirmed';
      transactionLabels.append(sample);
      confirmationLabelSize = parseFloat(getComputedStyle(sample).fontSize);
      sample.remove();
    }
    return {overflow:document.documentElement.scrollWidth-innerWidth, undersized, tinyFields, smallText:[...new Set(smallText)].slice(0,12), headerCollisions, movingDecoration, networkContrast, nativeNetworkChrome, confirmationLabelSize};
  });
  results.push({name,width,...result});
  if(result.overflow>1 || result.undersized.length || result.tinyFields.length || result.smallText.length || result.headerCollisions.length || result.movingDecoration || result.networkContrast !== null && result.networkContrast < 4.5 || result.nativeNetworkChrome || result.confirmationLabelSize !== null && result.confirmationLabelSize < 11.99) failures.push({name,width,...result});
}
for (const engine of engines) {
  const browser = await ({chromium,firefox,webkit}[engine]).launch(engine==='chromium'?{executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']} : {});
  try {
    for (const width of widths) {
      const context = await browser.newContext({viewport:{width,height:width===844?390:844},hasTouch:true,...(engine!=='firefox'?{isMobile:true}:{})});
      // A cold-page measurement owns its document. Replacing a still-live
      // document can make WebKit report teardown fetch cancellation as a
      // JavaScript pageerror (Playwright #43120). Stateful journeys below and
      // the independent lifecycle suite still exercise navigation and recovery.
      for (const [name,route] of reviewRoutes) {
        const page = await context.newPage();
        page.on('pageerror',error=>failures.push({engine,width,pageError:error.message}));
        await visit(page,route);
        await inspect(page,`${engine}:${name}`,width);
        if(width===390){await page.screenshot({path:`${output}/${engine}-${name}-390.png`,fullPage:true});await page.screenshot({path:`${output}/${engine}-${name}-viewport.png`});}
        await page.close();
      }
      await context.close();
      console.log(`${engine}: ${reviewRoutes.length} pages at ${width}px reviewed`);
    }
    if(process.env.MOBILE_INTERACTIONS==='0')continue;
    const context = await browser.newContext({viewport:{width:390,height:844},hasTouch:true,...(engine!=='firefox'?{isMobile:true}:{})});
    const page=await context.newPage();
    await visit(page,'/');
    const drawerTrigger=page.locator('.drawer-trigger');
    await drawerTrigger.tap();
    await page.locator('.mobile-drawer .brand').tap();
    await page.waitForFunction(()=>!document.querySelector('.mobile-drawer') && document.activeElement?.id==='main-content');
    await drawerTrigger.focus();await page.keyboard.press('Enter');
    await page.locator('.mobile-drawer').waitFor();
    await page.waitForFunction(()=>document.activeElement?.closest('.mobile-drawer')!==null);
    await page.keyboard.press('Escape');
    assert.equal(await drawerTrigger.getAttribute('aria-expanded'),'false');
    await page.waitForFunction(()=>document.activeElement?.matches('.drawer-trigger'));
    await drawerTrigger.tap();
    await page.locator('.drawer-category').first().tap();
    await page.locator('.mobile-drawer a[href="/blocks"]').tap();
    await page.waitForURL('**/blocks');
    await page.waitForFunction(()=>document.activeElement?.id==='main-content');
    await page.locator('.mobile-search-trigger').tap();
    await page.locator('.global-search input').fill(String(overview.blocks[0].height));
    await page.locator('.search-submit').tap();await page.waitForURL('**/block/*');
    await page.waitForSelector('.definitions');
    await page.locator('.copy-button').first().tap();await page.waitForSelector('.copy-button.copied');

    // Every section is reachable through the visible mobile control, including
    // contract forms, long transaction tabs, NFT holders and advanced activity.
    const sectionRoutes=[address,routes.find(([n])=>n==='transaction')[1],'/token/0x1b35d13a2E2528f192637F14B05f0Dc0e7dEB566','/advanced'];
    for(const route of sectionRoutes){
      await visit(page,route);
      const picker=page.locator('.section-picker select');await picker.waitFor({state:'visible'});
      const values=await picker.locator('option').evaluateAll(es=>es.map(e=>e.value));
      if(route===address) {
        for(const section of ['overview','transactions','history','userops','tokens','nft','token-transfers','internal-transactions','logs','contract','read','write'])
          assert(values.includes(section), `Missing reachable address section: ${section}`);
        assert.equal(new Set(values).size,values.length,'Address sections must be unique');
      }
      for(const value of values){
        await picker.selectOption(value);
        await page.waitForFunction(()=>!document.querySelector('.address-activity .loading,.code-panel .loading,.contract-interaction .loading,.table-shell .loading'));
        await page.waitForTimeout(200);
        assert.equal(await picker.inputValue(),value);
        await inspect(page,`${engine}:section:${route}:${value}`,390);
      }
    }
    await visit(page,'/pools');
    const filters=page.locator('.pool-filter-grid select');
    assert.equal(await filters.nth(2).isVisible(),false);
    await page.locator('.pool-filter-toggle').tap();
    await filters.nth(2).selectOption('10000');
    assert.equal(await page.locator('.pool-filter-status button').isEnabled(),true);
    await inspect(page,`${engine}:expanded-pool-filters`,390);
    await page.locator('.pool-filter-toggle').tap();
    assert.equal(await filters.nth(2).isVisible(),false);
    await page.locator('.pool-filter-status button').tap();
    assert.equal(await filters.nth(2).inputValue(),'0');
    await visit(page,address);await page.locator('.section-picker select').selectOption('read');
    const filter=page.locator('.contract-interaction input').first();await filter.waitFor();
    await page.setViewportSize({width:390,height:320});await filter.focus();await filter.fill('balanceOf');
    await page.locator('.contract-method:visible summary').first().click();
    const argument=page.locator('.contract-method:visible input').first();
    await argument.focus();await argument.fill('0x4200000000000000000000000000000000000006');
    await page.waitForFunction(()=>{const e=document.activeElement,r=e?.getBoundingClientRect(),h=document.querySelector('header').getBoundingClientRect();return e?.matches('.contract-method input') && r.bottom>h.bottom && r.top<innerHeight;});
    const focus=await argument.evaluate(e=>{const r=e.getBoundingClientRect(),h=document.querySelector('header').getBoundingClientRect();return{top:r.top,bottom:r.bottom,header:h.bottom,height:innerHeight};});
    assert.ok(focus.bottom>focus.header && focus.top<focus.height,`focused contract input obscured ${JSON.stringify(focus)}`);
    await inspect(page,`${engine}:reduced-viewport-contract`,390);
    await page.setViewportSize({width:390,height:844});

    await visit(page,'/stats');
    await page.locator('.stats-category-select select').selectOption('gas');
    await page.locator('.stats-chart-card').first().waitFor();
    assert.ok(await page.locator('.stats-chart-card').count()>0,'Gas category must expose charts');
    await page.locator('.stats-chart-card .info-button').first().tap();
    await page.locator('.info-floating').waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.info-floating').count(),0,'Chart information must dismiss with Escape');
    await inspect(page,`${engine}:stats-gas-category`,390);
    await page.screenshot({path:`${output}/${engine}-stats-gas.png`});

    // Pinch zoom is browser zoom of the visual viewport, not a claim of testing
    // OS accessibility text settings or a physical iPhone keyboard.
    if(engine==='chromium'){
      await visit(page,'/pools');const cdp=await context.newCDPSession(page);
      await cdp.send('Emulation.setPageScaleFactor',{pageScaleFactor:2});
      assert.ok(await page.evaluate(()=>visualViewport.scale>=1.99));
      await page.screenshot({path:`${output}/chromium-pinch-200.png`});
      await cdp.send('Emulation.setPageScaleFactor',{pageScaleFactor:1});
    }
    await page.emulateMedia({reducedMotion:'reduce'});await visit(page,'/');
    const animated=await page.locator('.liquid-atmosphere i').evaluateAll(es=>es.some(e=>parseFloat(getComputedStyle(e).animationDuration)>0.01));
    assert.equal(animated,false,'Respect reduced motion');
    await visit(page,'/stats');
    await page.locator('.stats-category-select select').selectOption('blocks');
    await page.locator('.stats-chart-card').first().waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
    await context.close();
    console.log(`${engine}: drawer, focus, search, copy, sections, reduced viewport, charts and reduced motion passed`);
  } catch(error) { failures.push({engine,interactionError:error.stack}); }
  finally {await browser.close();}
}
await writeFile(`${output}/results.json`,JSON.stringify({recordedAt:new Date().toISOString(),base,engines,widths,routes:reviewRoutes,results,failures},null,2));
assert.equal(failures.length,0,JSON.stringify(failures,null,2));
console.log(`Mobile usability passed (${results.length} page/section checks; ${engines.join(', ')}).`);
