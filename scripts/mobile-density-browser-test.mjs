import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4310',out=process.env.DENSITY_OUTPUT||'reports/mobile-density/browser';
const baseline=process.env.DENSITY_BASELINE==='1',engines=(process.env.DENSITY_ENGINES||'chromium,firefox,webkit').split(','),widths=(process.env.DENSITY_WIDTHS||'320,390,760,768,1440').split(',').map(Number);
const counters=JSON.parse(await readFile(process.env.COUNTER_FIXTURE||'reports/mobile-density/counters.json','utf8'));
const axe=await readFile('node_modules/axe-core/axe.min.js','utf8'),results=[],hash='0x'+'a'.repeat(64),addr='0x'+'b'.repeat(40);
await mkdir(out,{recursive:true});
for(const engine of engines){const browser=await({chromium,firefox,webkit})[engine].launch(engine==='chromium'?{args:['--no-sandbox']}:{});
 try{for(const prefix of(process.env.DENSITY_MAIN_ONLY==='1'?['']:['','/testnet']))for(const width of widths)for(const locale of(process.env.DENSITY_LOCALES?.split(',')||[width===760||width===768?'ar':width===1440?'en':'fr'])){
  const mobile=width<=760,context=await browser.newContext({viewport:{width,height:Number(process.env.DENSITY_HEIGHT||900)},hasTouch:width<1180,...(engine!=='firefox'?{isMobile:mobile}:{}),colorScheme:locale==='ar'?'dark':'light',bypassCSP:true}),page=await context.newPage(),row={engine,prefix,width,locale,baseline,passed:false},errors=[];
  page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
  await context.routeWebSocket(/\/api\/live$/,ws=>ws.close());
  await context.route('**/api/**',route=>{
   const u=new URL(route.request().url()),p=u.pathname.replace(/^\/testnet/,'');
   if(p==='/api/live/config')return route.fulfill({json:{url:base.replace(/^http/,'ws')+prefix+'/api/live'}});
   if(p==='/api/live/snapshot')return route.fulfill({status:503,json:{error:'Fixture offline'}});
   if(p==='/api/explorer/stats')return route.fulfill({json:{coin_price:'2405.77'}});
   if(p==='/api/stats/counters')return route.fulfill({headers:{'x-ink-data-status':'fresh','x-ink-data-fetched-at':new Date().toISOString()},json:counters});
   if(p==='/api/stats/lines')return route.fulfill({json:{sections:[{id:'transactions',title:'Transactions',charts:[{id:'newTxns',title:'New transactions',description:'Number of new transactions',resolutions:['DAY']}]}]}});
   if(p.startsWith('/api/stats/lines/'))return route.fulfill({json:{chart:[{date:'2026-10-17',value:'2'},{date:'2026-10-18',value:'3'}]}});
   if(p==='/api/search')return route.fulfill({json:{items:u.searchParams.get('q')===hash?[{type:'block',block_hash:hash,block_number:100}]:[],next_page_params:null}});
   if(/^\/api\/explorer\/blocks\/[^/]+$/.test(p))return route.fulfill({json:{height:p.endsWith('/123')?123:100,hash,parent_hash:'0x'+'c'.repeat(64),timestamp:'2026-10-18T00:00:00Z',transactions_count:0,gas_limit:'30000000',gas_used:'0',miner:{hash:addr}}});
   return route.fulfill({json:{items:[],next_page_params:null}});
  });
  const input=page.locator('.global-search input'),toggle=page.locator('.mobile-search-trigger'),field=page.locator('.header-search-field');
  const focusedInput=()=>page.waitForFunction(()=>document.activeElement===document.querySelector('.global-search input'));
  const geometry=()=>page.evaluate(()=>{
   const cards=[...document.querySelectorAll('.stats-counters article:not(.counter-skeleton)')].map(e=>{
    const box=e.getBoundingClientRect(),help=e.querySelector('.info-button').getBoundingClientRect();
    const text=[...e.querySelectorAll(':scope > div > span:not(.info-disclosure),:scope > strong > span,:scope > strong > small')].flatMap(node=>{const r=document.createRange();r.selectNodeContents(node);return[...r.getClientRects()].map(b=>({text:node.textContent,left:b.left,right:b.right,top:b.top,bottom:b.bottom}));});
    return{height:box.height,help:{width:help.width,height:help.height,inside:help.left>=box.left&&help.right<=box.right&&help.top>=box.top&&help.bottom<=box.bottom},clipped:text.filter(t=>t.left<box.left||t.right>box.right||t.top<box.top||t.bottom>box.bottom),overlap:text.filter(t=>Math.min(t.right,help.right)-Math.max(t.left,help.left)>1&&Math.min(t.bottom,help.bottom)-Math.max(t.top,help.top)>1)};
   });
   const action=document.querySelector('.stats-gas-link'),a=action.getBoundingClientRect(),icon=action.querySelector('svg').getBoundingClientRect();
   const utility=document.querySelector('.utility-bar').getBoundingClientRect(),network=document.querySelector('.utility-settings .network-picker select').getBoundingClientRect(),submit=document.querySelector('.search-submit').getBoundingClientRect();
   return{touch:matchMedia('(pointer:coarse)').matches,searchFont:parseFloat(getComputedStyle(document.querySelector('.global-search input')).fontSize),submit:{width:submit.width,height:submit.height},networkInsideBar:network.top>=utility.top&&network.bottom<=utility.bottom,action:{width:a.width,height:a.height,dx:Math.abs(a.left+a.width/2-icon.left-icon.width/2),dy:Math.abs(a.top+a.height/2-icon.top-icon.height/2)},headerBottom:document.querySelector('header').getBoundingClientRect().bottom,counterHeight:document.querySelector('.stats-counters').getBoundingClientRect().height,titleHeight:document.querySelector('h1').getBoundingClientRect().height,chartsTop:document.querySelector('.stats-filter-bar').getBoundingClientRect().top,cards,overflow:document.documentElement.scrollWidth>innerWidth+1};
  });
  try{
   await page.goto(base+prefix+'/stats?lang='+locale,{waitUntil:'domcontentloaded'});await page.locator('.stats-counters[aria-busy="false"]').waitFor();await page.locator('.stats-counters article:not(.counter-skeleton)').nth(17).waitFor({state:'attached'});await page.locator('.stats-filter-bar').waitFor({state:'attached'});await page.evaluate(()=>document.fonts.ready);row.geometry=await geometry();
   await page.screenshot({path:`${out}/${engine}-${prefix?'sepolia':'mainnet'}-${width}-${locale}-stats.png`});
   assert.equal(row.geometry.cards.length,18);assert(!row.geometry.overflow);assert(row.geometry.cards.every(c=>!c.clipped.length),'Counter text is clipped');
   if(!baseline){
    if(row.geometry.touch){assert(row.geometry.cards.every(c=>c.help.width>=44&&c.help.height>=44&&c.help.inside),'Touch counter helpers stay inside their cards');assert(row.geometry.searchFont>=16,'Touch search text must remain readable in landscape');assert(row.geometry.networkInsideBar,'The network control leaves its utility bar');if(!mobile)assert(row.geometry.submit.width>=44&&row.geometry.submit.height>=44);}
    if(mobile)assert(row.geometry.action.width>=44&&row.geometry.action.height>=44&&row.geometry.action.dx<1&&row.geometry.action.dy<1,'The stats action must be centered inside its touch target');
    if(process.env.DENSITY_LAYOUT_ONLY==='1'){assert(row.geometry.cards.every(c=>!c.overlap.length));if(mobile){assert(row.geometry.cards.every(c=>c.help.width>=44&&c.help.height>=44&&c.help.inside));await toggle.tap();await focusedInput();const translated=JSON.parse(await readFile('src/locales/'+locale+'.json','utf8'))['Close search'];assert.equal(await toggle.getAttribute('aria-label'),translated);await input.fill('Ink');await page.setViewportSize({width,height:360});const searchBox=await field.boundingBox();assert(searchBox.y>=0&&searchBox.y+searchBox.height<=360);await page.screenshot({path:`${out}/${engine}-${prefix?'sepolia':'mainnet'}-${width}-${locale}-search.png`});await page.keyboard.press('Escape');assert(await field.isHidden());}}
    else{
    if(mobile){assert(row.geometry.headerBottom<=112);assert(row.geometry.cards.every(c=>c.help.width>=44&&c.help.height>=44&&c.help.inside),'Stats help targets must be usable inside their cards');assert(row.geometry.cards.every(c=>!c.overlap.length),'A help target overlaps counter text');
     assert(await field.isHidden());await toggle.tap();await focusedInput();await input.fill('retained draft');await toggle.tap();assert(await field.isHidden());await toggle.tap();await focusedInput();assert.equal(await input.inputValue(),'retained draft');await page.keyboard.press('Escape');assert(await field.isHidden());assert(await toggle.evaluate(e=>document.activeElement===e));
     // Opening search from further down must return to the same reading position.
     const origin=page.locator('.stats-counters article .info-button').last();await origin.scrollIntoViewIfNeeded();await origin.focus();const y=await page.evaluate(()=>scrollY);await page.keyboard.press('/');await focusedInput();await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>scrollY),y);assert(await origin.evaluate(e=>document.activeElement===e));
     await page.locator('.stats-search input').fill('filter');await page.locator('.stats-search input').press('/');assert(await field.isHidden(),'Typing a slash in another field opened global search');await page.locator('.stats-search input').fill('');
     await page.evaluate(()=>scrollTo(0,0));await toggle.tap();await focusedInput();
    }else{assert(await input.isVisible());assert.equal(await toggle.count(),0);await input.focus();}
    await input.fill('INK');await input.press('Enter');await page.waitForURL(u=>u.pathname===prefix+'/search'&&u.searchParams.get('q')==='INK');assert(await input.isVisible());assert.equal(await toggle.count(),0);assert.equal(await input.inputValue(),'INK');
    await input.fill(hash);await input.press('Enter');await page.waitForURL(u=>u.pathname===prefix+'/block/'+hash);await page.locator('.block-definitions').waitFor();
    if(mobile){assert(await field.isHidden());await toggle.tap();await input.fill('123');await input.press('Enter');await page.waitForURL(u=>u.pathname===prefix+'/block/123');await page.locator('.block-definitions').waitFor();assert(await field.isHidden(),'Same-kind navigation kept mobile search open');await toggle.tap();await input.fill('123');await input.press('Enter');await field.waitFor({state:'hidden'});assert(new URL(page.url()).pathname.endsWith('/block/123'));}
    await page.locator('header .brand').click();await page.waitForURL(u=>u.pathname===prefix+'/');assert(await input.isVisible());assert.equal(await toggle.count(),0);
    if(width<1180){await page.locator('.drawer-trigger').tap();await page.locator('.mobile-drawer').waitFor();await page.locator('.drawer-category').nth(2).tap();await page.locator('.drawer-links a').filter({has:page.locator('svg')}).first().tap();await page.waitForURL(u=>u.pathname===prefix+'/stats');await page.locator('.mobile-drawer').waitFor({state:'hidden'});assert.equal(await page.locator('main').evaluate(e=>e.inert),false);if(mobile)assert(await field.isHidden());}
    else await page.goto(base+prefix+'/stats?lang='+locale,{waitUntil:'domcontentloaded'});
    // Resizing cannot hide the focused input or lose its draft.
    if(mobile)await toggle.click();await input.fill('resize draft');await input.focus();await page.setViewportSize({width:1440,height:900});assert(await input.isVisible());await page.setViewportSize({width:390,height:900});await focusedInput();assert(await input.isVisible());assert.equal(await input.inputValue(),'resize draft');await page.keyboard.press('Escape');assert(await field.isHidden());await page.setViewportSize({width,height:900});
    await page.evaluate(()=>scrollTo(0,0));await page.locator('.stats-counters article:not(.counter-skeleton)').first().waitFor();await page.evaluate(axe);row.violations=await page.evaluate(async()=>(await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})));assert.deepEqual(row.violations,[]);assert.deepEqual(errors,[]);
    const other=prefix?'mainnet':'sepolia';await page.locator('.utility-settings .network-picker select').selectOption(other);await page.waitForURL(u=>u.pathname===(prefix?'/':'/testnet/')&&u.searchParams.get('lang')===(locale==='en'?null:locale));row.networkSwitch=true;
    }
   }
   row.passed=true;
  }catch(error){row.error=error.stack;await page.screenshot({path:`${out}/failure-${engine}-${prefix?'sepolia':'mainnet'}-${width}-${locale}.png`}).catch(()=>{});}
  finally{await context.close();}
  results.push(row);console.log(JSON.stringify(row));await writeFile(out+'/results.json',JSON.stringify({base,complete:false,results},null,2));
 }}finally{await browser.close();}
}
await writeFile(out+'/results.json',JSON.stringify({base,complete:true,passed:results.every(r=>r.passed),physicalDeviceTest:false,results},null,2));if(results.some(r=>!r.passed))process.exitCode=1;
