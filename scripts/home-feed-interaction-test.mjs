import assert from 'node:assert/strict';
import {chromium, firefox, webkit} from 'playwright-core';
import {WebSocketServer} from 'ws';
import {mkdir, writeFile} from 'node:fs/promises';

const base = process.env.BASE_URL || 'http://127.0.0.1:4310';
const out = process.env.HOME_FEED_OUTPUT || 'reports/home-interaction/browser';
const baseline = process.env.HOME_FEED_BASELINE === '1', results = [];
const locale = process.env.HOME_FEED_LOCALE || 'en';
const mode = process.env.HOME_FEED_MODE || 'touch';
const action = process.env.HOME_FEED_ACTION || 'link';
const initiallyEmpty = process.env.HOME_FEED_EMPTY === '1';
const initialRows = Number(process.env.HOME_FEED_ROWS || 6);
const hash = n => '0x' + n.toString(16).padStart(64, '0');
const address = n => '0x' + n.toString(16).padStart(40, '0');
await mkdir(out, {recursive:true});
for (const engine of (process.env.HOME_FEED_ENGINES || 'chromium,firefox,webkit').split(',')) {
  const browser = await ({chromium, firefox, webkit})[engine].launch(engine === 'chromium' ? {args:['--no-sandbox']} : {});
  try {
    for (const prefix of ['', '/testnet']) for (const width of (process.env.HOME_FEED_WIDTHS || '390,768').split(',').map(Number)) for (const kind of (action==='copy'||initiallyEmpty?['transactions']:['blocks','transactions'])) {
      const context = await browser.newContext({viewport:{width,height:1000},hasTouch:mode==='touch',bypassCSP:true,colorScheme:width===768?'dark':'light'});
      const page = await context.newPage(), chainId = prefix ? 763373 : 57073;
      const server = new WebSocketServer({host:'127.0.0.1',port:0});
      await new Promise(resolve => server.once('listening',resolve));
      let head = 100;
      const tx = n => ({hash:hash(n),block_number:n,block_hash:hash(n+1000),timestamp:new Date().toISOString(),status:'ok',from:{hash:address(n)},to:{hash:address(2)},value:'0',method:'transfer',fee:{value:'0'},transaction_types:['coin_transfer']});
      const block = n => ({height:n,hash:hash(n+1000),timestamp:new Date().toISOString(),miner:{hash:address(n)},gas_limit:'100',gas_used:'10',size:100,transactions_count:1,transaction_hashes:[hash(n)]});
      const frame = () => ({protocol:'ink-observer.live.v1',type:'block',sequence:head,sentAt:new Date().toISOString(),network:{chainId,expectedChainId:chainId,head,online:true,synced:true,stale:false,safeBlock:head-2,finalizedBlock:head-4,derivation:{online:true,synced:true}},block:block(head),blocks:[block(head)],transactions:initiallyEmpty&&head===100?[]:[tx(head)],utilization:{percentage:10}});
      const overview = () => ({stats:{total_addresses:'200'},blocks:Array.from({length:initialRows},(_,index)=>block(head-index)),transactions:initiallyEmpty&&head===100?[]:Array.from({length:initialRows},(_,index)=>tx(head-index)),chart:[{date:'2026-10-16',transactions_count:20},{date:'2026-10-17',transactions_count:22}]});
      server.on('connection',socket => socket.send(JSON.stringify(frame())));
      await page.route('**/api/live/config',r => r.fulfill({json:{url:`ws://127.0.0.1:${server.address().port}${prefix}/api/live`}}));
      await page.route('**/api/live/snapshot',r => r.fulfill({json:frame()}));
      await page.route('**/api/overview',r => r.fulfill({json:overview()}));
      await page.addInitScript(() => {
        window.feedClicks=[]; window.feedCopies=[];
        Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value => window.feedCopies.push(value)}});
        document.addEventListener('click',event => {
          const link=event.target.closest?.('.live-columns .panel a.explorer-link');
          if (!link || link.closest('.panel-head')) return;
          window.feedClicks.push(link.getAttribute('href')); event.preventDefault();
        },true);
      });
      const row={engine,prefix,width,kind,locale,mode,action,initiallyEmpty,baseline,nativeTouch:engine==='chromium'&&mode==='touch',passed:false};
      const selector=kind==='blocks'?'.compact-block-row .block-height a':'.compact-tx-row .tx-primary .text-link';
      const other=kind==='blocks'?'.compact-tx-row .tx-primary .text-link':'.compact-block-row .block-height a';
      const suffix=locale==='en'?'':'?lang='+locale;
      const path=n=>prefix+(kind==='blocks'?'/block/'+n:'/tx/'+hash(n))+suffix;
      const otherPath=n=>prefix+(kind==='blocks'?'/tx/'+hash(n):'/block/'+n)+suffix;
      const send=async n=>{head=n;for(const socket of server.clients)socket.send(JSON.stringify(frame()));await page.waitForFunction(n=>document.querySelector('[data-live-head]')?.getAttribute('data-live-head')===String(n),n);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));};
      try {
        await page.goto(base+prefix+'/?lang='+locale,{waitUntil:'domcontentloaded'});
        await page.waitForFunction(()=>document.querySelector('[data-live-head]')?.getAttribute('data-live-head')==='100');
        await page.locator('.interactive-chart[data-points="2"]').waitFor();
        await page.evaluate(()=>document.fonts.ready);
        const tab=page.locator(`#home-tab-${kind}`);if(await tab.count())await tab.click();
        if(initiallyEmpty){
          const placeholder=page.locator('.home-activity-panel').last().locator('.home-feed-state');await placeholder.scrollIntoViewIfNeeded();
          await placeholder.dispatchEvent('pointerdown',{pointerType:'touch',pointerId:1,isPrimary:true,bubbles:true});
          await send(101);await page.locator('.home-activity-panel').last().dispatchEvent('pointerup',{pointerType:'touch',pointerId:1,isPrimary:true,bubbles:true});
          await page.waitForFunction(({selector,value})=>document.querySelector(selector)?.getAttribute('href')===value,{selector,value:path(101)});
          assert.equal(await page.evaluate(()=>window.feedClicks.length+window.feedCopies.length),0);row.firstArrivalVisible=true;row.nativeTouch=false;
        }else{
        const link=page.locator(selector).first(), control=action==='copy'?link.locator('..').locator('.copy-button'):link;await control.scrollIntoViewIfNeeded();
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        assert.equal(await link.getAttribute('href'),path(100));
        const before=await control.boundingBox(),scrollBefore=await page.evaluate(()=>scrollY);let cdp;
        if(mode==='keyboard') await control.focus();
        else if(mode==='mouse') await control.hover();
        else if(engine==='chromium') {cdp=await context.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:before.x+before.width/2,y:before.y+before.height/2}]});}
        else await control.dispatchEvent('pointerdown',{pointerType:'touch',pointerId:1,isPrimary:true,bubbles:true});
        await send(101);row.heldDestination=await link.getAttribute('href');
        const after=await control.boundingBox();row.shift={x:after.x-before.x,y:after.y-before.y};row.documentShift=after.y+await page.evaluate(()=>scrollY)-before.y-scrollBefore;
        assert.equal(row.heldDestination,path(baseline?101:100));
        if(!baseline)assert(Math.abs(row.shift.x)<=1&&Math.abs(row.shift.y)<=1&&Math.abs(row.documentShift)<=1,'Pressed link moved beyond native scroll rounding');
        assert.equal(await page.locator(other).first().getAttribute('href'),otherPath(101),'Unheld feed should keep updating');
        if(mode==='keyboard') await control.press('Enter');
        else if(mode==='mouse') await control.click();
        else if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        else {await control.dispatchEvent('pointerup',{pointerType:'touch',pointerId:1,isPrimary:true,bubbles:true});await control.evaluate(el=>el.click());}
        if(action==='copy'){
          await page.waitForFunction(()=>window.feedCopies.length>0);row.copied=await page.evaluate(()=>window.feedCopies.at(-1));assert.equal(row.copied,hash(baseline?101:100));
        }else{
          await page.waitForFunction(()=>window.feedClicks.length>0);
          row.openedDestination=await page.evaluate(()=>window.feedClicks.at(-1));assert.equal(row.openedDestination,path(baseline?101:100));
        }
        if(!baseline){
          const panel=link.locator('xpath=ancestor::div[contains(concat(" ",normalize-space(@class)," ")," panel ")]');
          const update=panel.locator('.home-feed-update button');
          const target=await update.boundingBox();assert(target.width>=43.9&&target.height>=43.9,'Update target must be 44px');
          const geometry=await panel.locator('.panel-head').evaluate(el=>{
            const box=el.getBoundingClientRect(),children=[...el.children].map(child=>child.getBoundingClientRect());
            return {contained:children.every(child=>child.left>=box.left&&child.right<=box.right&&child.top>=box.top&&child.bottom<=box.bottom),overlaps:children.some((a,i)=>children.some((b,j)=>i!==j&&Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1))};
          });assert(geometry.contained&&!geometry.overlaps,'Panel heading controls overlap or overflow');row.geometry=geometry;
          if(process.env.HOME_FEED_A11Y==='1'){
            await page.addScriptTag({path:'node_modules/axe-core/axe.min.js'});
            const a11y=await page.evaluate(()=>axe.run('.live-columns',{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));
            row.violations=a11y.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}));assert.deepEqual(row.violations,[]);
          }
          if(process.env.HOME_FEED_CAPTURE==='1')await page.screenshot({path:`${out}/${engine}-${prefix?'sepolia':'mainnet'}-${width}-${kind}-${locale}.png`});
          await update.click();
          await page.waitForFunction(({selector,value})=>document.querySelector(selector)?.getAttribute('href')===value,{selector,value:path(101)});
          row.resumed=true;
          if(cdp){
            await control.scrollIntoViewIfNeeded();const rect=await control.boundingBox();
            const count=await page.evaluate(()=>window.feedClicks.length+window.feedCopies.length);
            await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:rect.x+rect.width/2,y:rect.y+rect.height/2}]});
            await send(102);await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
            assert.equal(await page.evaluate(()=>window.feedClicks.length+window.feedCopies.length),count,'Canceled gesture followed a link or copied a value');
            assert.equal(await link.getAttribute('href'),path(101));await update.click();
            await page.waitForFunction(({selector,value})=>document.querySelector(selector)?.getAttribute('href')===value,{selector,value:path(102)});row.canceledGestureSafe=true;
          }
          if(mode!=='touch'){
            await page.mouse.move(0,0);await page.locator('.skip-link').focus();
            if(mode==='mouse')await link.hover();else await link.focus();
            await send(102);assert.equal(await link.getAttribute('href'),path(101));
            await page.mouse.move(0,0);await page.locator('.skip-link').focus();
            await page.waitForFunction(({selector,value})=>document.querySelector(selector)?.getAttribute('href')===value,{selector,value:path(102)});
            await send(103);assert.equal(await link.getAttribute('href'),path(103));row.resumedOnLeave=true;
          }
        }
        }
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));row.passed=true;
      } catch(error) {row.error=error.stack;}
      finally {await context.close();for(const socket of server.clients)socket.terminate();await new Promise(resolve=>server.close(resolve));}
      results.push(row);console.log(JSON.stringify(row));await writeFile(out+'/results.json',JSON.stringify({base,baseline,complete:false,results},null,2));
    }
  } finally {await browser.close();}
}
await writeFile(out+'/results.json',JSON.stringify({base,baseline,complete:true,passed:results.every(r=>r.passed),results},null,2));
if(results.some(r=>!r.passed))process.exitCode=1;
