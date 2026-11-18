import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
import {mkdir,readFile,writeFile} from 'node:fs/promises';

const base=process.env.BASE_URL||'http://127.0.0.1:4310';
const out=process.env.HELP_OUTPUT||'reports/help-interactions/browser';
const engines=(process.env.HELP_ENGINES||'chromium,firefox,webkit').split(',');
const widths=(process.env.HELP_WIDTHS||'320,768,1440').split(',').map(Number);
const axe=await readFile('node_modules/axe-core/axe.min.js','utf8'),results=[];
await mkdir(out,{recursive:true});
const address=n=>'0x'+n.toString(16).padStart(40,'0'),hash=n=>'0x'+n.toString(16).padStart(64,'0');
const records=Array.from({length:20},(_,i)=>({hash:address(i+1),coin_balance:'1234567890123456789',transactions_count:'150'}));
const longText=' Additional information about the indexed values and their source. '.repeat(35);

for(const engine of engines){
 const browser=await({chromium,firefox,webkit})[engine].launch(engine==='chromium'?{args:['--no-sandbox']}:{});
 try{for(const prefix of['','/testnet'])for(const width of widths){
  const locale=width===768?'ar':width===1440?'en':'fr',touch=width<1000;
  const context=await browser.newContext({viewport:{width,height:900},hasTouch:touch,...(engine!=='firefox'?{isMobile:touch}:{}),colorScheme:width===320?'light':'dark',bypassCSP:true});
  const page=await context.newPage(),row={engine,prefix,width,locale,touch,passed:false},errors=[];
  page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
  let socket,head=100,sequence=0,stale=false,requests=0;
  const chainId=prefix?763373:57073;
  const frame=()=>({type:'snapshot',protocol:'ink-observer.live.v1',sequence:++sequence,sentAt:new Date().toISOString(),network:{chainId,expectedChainId:chainId,online:true,synced:true,stale:false,head},block:{height:head,hash:hash(head),timestamp:new Date().toISOString()},transactions:[],blocks:[{height:80,hash:hash(999)}]});
  await context.routeWebSocket(/\/api\/live$/,ws=>{socket=ws;ws.send(JSON.stringify(frame()));});
  await context.route('**/api/**',route=>{
   const path=new URL(route.request().url()).pathname.replace(/^\/testnet/,'');
   if(path==='/api/live/config')return route.fulfill({json:{url:base.replace(/^http/,'ws')+prefix+'/api/live'}});
   if(path==='/api/live/snapshot')return route.fulfill({json:frame()});
   if(path==='/api/explorer/addresses'){requests++;return route.fulfill({headers:{'x-ink-data-status':stale?'stale':'fresh','x-ink-data-fetched-at':'2026-10-16T12:34:56.000Z'},json:{items:records,next_page_params:null}});}
   if(/^\/api\/explorer\/blocks\/[^/]+$/.test(path))return route.fulfill({json:{height:80,hash:path.endsWith(hash(999))?hash(999):hash(80),parent_hash:hash(79),timestamp:'2026-10-16T12:34:56.000Z',transactions_count:0,size:1000,gas_limit:'30000000',gas_used:'100000',gas_used_percentage:1/3,miner:{hash:address(50)}}});
   return route.fulfill({json:{items:[]}});
  });
  const trigger=page.locator('.ledger-heading-title .info-button'),panel=page.locator('.info-floating'),body=page.locator('.info-floating > .info-body'),close=page.locator('.info-close');
  const activate=async locator=>touch?locator.tap():locator.click();
  const expand=async(target=trigger)=>{
   await activate(target);await body.waitFor();
   await body.evaluate((element,text)=>{const extra=document.createElement('span');extra.dataset.helpTestContent='';extra.textContent=text;element.append(extra);},longText);
   await page.locator('.info-expanded').waitFor();
   await page.waitForFunction(()=>document.activeElement?.classList.contains('info-body'));
  };
  const active=className=>page.waitForFunction(name=>document.activeElement?.classList.contains(name),className);
  try{
   await page.clock.install();await page.goto(base+prefix+'/accounts?lang='+locale,{waitUntil:'domcontentloaded'});await page.locator('.ledger-record').first().waitFor();
   await activate(trigger);await body.waitFor();assert.equal(await close.count(),0,'A short explanation should remain compact');
   assert.equal(await trigger.getAttribute('aria-describedby'),await body.getAttribute('id'));
   await page.keyboard.press('Escape');await active('info-button');assert.equal(await panel.count(),0);

   await page.setViewportSize({width,height:360});await expand();
   const before=await page.evaluate(()=>scrollY),box=await panel.boundingBox(),closeBox=await close.boundingBox();
   row.panel=box;row.close=closeBox;assert(box.x>=0&&box.x+box.width<=width+1&&box.y>=0&&box.y+box.height<=360);
   assert(closeBox.width>=44&&closeBox.height>=44&&closeBox.y>=box.y&&closeBox.y+closeBox.height<=box.y+box.height);
   assert(await body.evaluate(e=>e.scrollHeight>e.clientHeight));
   await page.keyboard.press('PageDown');await page.waitForFunction(()=>document.querySelector('.info-body').scrollTop>0);
   assert.equal(await page.evaluate(()=>scrollY),before,'Scrolling help moved the underlying page');
   await body.evaluate(e=>e.scrollTop=e.scrollHeight);assert.deepEqual(await close.boundingBox(),closeBox,'Closing control scrolled out with content');
   await page.evaluate(axe);row.violations=await page.evaluate(async()=>(await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})));assert.deepEqual(row.violations,[]);
   await page.screenshot({path:`${out}/${engine}-${prefix?'sepolia':'mainnet'}-${width}-expanded.png`});

   await page.keyboard.press('Shift+Tab');await active('info-close');await page.keyboard.press('Shift+Tab');await active('info-button');assert.equal(await panel.count(),0);
   await expand();await page.keyboard.press('Tab');await active('transfer-export');assert.equal(await panel.count(),0,'Tab should return to the control after the trigger');
   await expand();await activate(close);await active('info-button');assert.equal(await panel.count(),0);
   await expand();await page.keyboard.press('Escape');await active('info-button');assert.equal(await panel.count(),0);
   await expand();await body.locator('[data-help-test-content]').evaluate(e=>e.remove());assert.equal(await close.count(),1,'Shrinking help removed the close control mid-interaction');await page.keyboard.press('Escape');
   await page.setViewportSize({width,height:900});await activate(trigger);await body.waitFor();assert.equal(await close.count(),0,'A new compact opening retained the oversized header');await page.keyboard.press('Escape');

   // A zoomed visual viewport must retain a visible close control and a scrollable body.
   row.zoomViewport=await trigger.evaluate(element=>{window.helpViewportDescriptor=Object.getOwnPropertyDescriptor(window,'visualViewport');const anchor=element.getBoundingClientRect(),viewport=new EventTarget(),bounds={width:220,height:180,offsetLeft:Math.max(0,Math.min(innerWidth-220,anchor.right-200)),offsetTop:Math.max(0,anchor.top-45)};Object.assign(viewport,bounds);Object.defineProperty(window,'visualViewport',{configurable:true,value:viewport});return bounds;});
   await expand();row.zoomPanel=await panel.boundingBox();const zoomClose=await close.boundingBox();
   const {offsetLeft:left,offsetTop:top}=row.zoomViewport;
   assert(row.zoomPanel.x>=left&&row.zoomPanel.x+row.zoomPanel.width<=left+220&&row.zoomPanel.y>=top&&row.zoomPanel.y+row.zoomPanel.height<=top+180);
   assert(zoomClose.y>=top&&zoomClose.y+zoomClose.height<=top+180);assert(await body.evaluate(e=>e.clientHeight>0&&e.scrollHeight>e.clientHeight));
   await activate(close);await expand();
   await page.evaluate(()=>{Object.assign(visualViewport,{offsetLeft:innerWidth+100});visualViewport.dispatchEvent(new Event('scroll'));});await panel.waitFor({state:'hidden'});await active('info-button');
   await page.evaluate(()=>{if(window.helpViewportDescriptor)Object.defineProperty(window,'visualViewport',window.helpViewportDescriptor);else delete window.visualViewport;});

   // Recovery happens through the real indexed observer, without navigation or a manual close.
   stale=true;await page.reload({waitUntil:'domcontentloaded'});await page.locator('.page-data-notice[data-notice-kind="cached"]').waitFor();
   await page.setViewportSize({width,height:360});await expand(page.locator('.page-data-notice .info-button'));
   const reads=requests;stale=false;
   for(let i=0;i<3;i++){head++;socket.send(JSON.stringify(frame()));await page.waitForTimeout(40);await page.clock.fastForward(8000);}
   head++;socket.send(JSON.stringify(frame()));
   await page.locator('.page-data-notice').waitFor({state:'hidden'});await panel.waitFor({state:'hidden'});
   await page.waitForFunction(()=>document.activeElement?.id==='main-content');assert(requests>reads,'No background source recovery occurred');row.recoveryRequests=requests-reads;

   // An actual link rendered by Info must be reachable without jumping to the end of the document.
   await page.setViewportSize({width,height:900});await page.goto(base+prefix+'/block/80?lang='+locale,{waitUntil:'domcontentloaded'});
   const forkHelp=page.locator('.forked-block-state .info-button');await forkHelp.waitFor();await activate(forkHelp);
   const canonicalLink=page.locator('.canonical-block-link');await canonicalLink.waitFor();assert.equal(await close.count(),0);
   await page.keyboard.press('Tab');await active('canonical-block-link');
   await page.keyboard.press('Shift+Tab');await active('info-button');assert.equal(await panel.count(),0);
   await activate(forkHelp);await page.keyboard.press('Tab');await active('canonical-block-link');await page.keyboard.press('Enter');
   await page.waitForURL(u=>u.pathname===prefix+'/block/'+hash(999));await page.locator('.block-definitions').waitFor();assert.equal(await panel.count(),0);row.canonicalLinkKeyboard=true;
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);row.passed=true;
  }catch(error){row.error=error.stack;await page.screenshot({path:`${out}/failure-${engine}-${prefix?'sepolia':'mainnet'}-${width}.png`}).catch(()=>{});}
  finally{await context.close();}
  results.push(row);console.log(JSON.stringify(row));await writeFile(out+'/results.json',JSON.stringify({base,complete:false,results},null,2));
 }}finally{await browser.close();}
}
await writeFile(out+'/results.json',JSON.stringify({base,complete:true,passed:results.every(r=>r.passed),physicalDeviceTest:false,results},null,2));
if(results.some(r=>!r.passed))process.exitCode=1;
