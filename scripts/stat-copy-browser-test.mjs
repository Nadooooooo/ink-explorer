import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4310',out=process.env.STAT_COPY_OUTPUT||'reports/stat-copy/browser';
const sources=JSON.parse(await readFile('reports/stat-copy/sources.json','utf8')),axe=await readFile('node_modules/axe-core/axe.min.js','utf8'),results=[];
const engines=(process.env.STAT_COPY_ENGINES||'chromium,firefox,webkit').split(',');
await mkdir(out,{recursive:true});
for(const engine of engines){const browser=await({chromium,firefox,webkit})[engine].launch(engine==='chromium'?{args:['--no-sandbox']}:{});
 try{for(const locale of(process.env.STAT_COPY_LOCALES?.split(',')||(engine==='chromium'?['en','fr','es','pt','zh','ja','ru','ar','hi','bn']:['fr','ar'])))for(const prefix of(engine==='chromium'?['']:['','/testnet'])){
  const width=Number(process.env.STAT_COPY_WIDTH||320),height=844,row={engine,locale,prefix,width,passed:false,helpCount:0},errors=[];
  const dict=JSON.parse(await readFile(`src/locales/${locale}.json`,'utf8')),t=key=>dict[key]??key,source=sources[prefix?'sepolia':'mainnet'];
  const context=await browser.newContext({viewport:{width,height},hasTouch:width<800,...(engine!=='firefox'?{isMobile:width<800}:{}),colorScheme:locale==='ar'?'dark':'light',bypassCSP:true}),page=await context.newPage();
  page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));
  await context.routeWebSocket(/\/api\/live$/,ws=>ws.close());
  await context.route('**/api/**',route=>{
   const path=new URL(route.request().url()).pathname.replace(/^\/testnet/,'');
   if(path==='/api/live/config')return route.fulfill({json:{url:base.replace(/^http/,'ws')+prefix+'/api/live'}});
   if(path==='/api/live/snapshot')return route.fulfill({status:503,json:{error:'Fixture offline'}});
   if(path==='/api/stats/counters')return route.fulfill({headers:{'x-ink-data-status':'fresh','x-ink-data-fetched-at':new Date().toISOString()},json:source.counters});
   if(path==='/api/stats/lines')return route.fulfill({json:source.lines});
   if(path.startsWith('/api/stats/lines/'))return route.fulfill({json:{chart:[{date:'2026-10-17',value:'1'},{date:'2026-10-18',value:path.endsWith('/networkUtilization')?'0.08':'2'}]}});
   if(path==='/api/explorer/stats')return route.fulfill({headers:{'x-ink-data-status':'fresh','x-ink-data-fetched-at':new Date().toISOString()},json:{coin_price:'2405.77',gas_price_updated_at:new Date().toISOString(),gas_prices:{slow:{price:0.005,time:1000},average:{price:0.006,time:1000},fast:{price:0.007,time:1000}}}});
   return route.fulfill({json:{items:[],next_page_params:null}});
  });
  const fit=async locator=>locator.evaluate(element=>{
   const box=element.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(element);
   return [...range.getClientRects()].every(r=>r.left>=box.left-1&&r.right<=box.right+1&&r.top>=box.top-1&&r.bottom<=box.bottom+1);
  });
  const clearActions=async card=>{
   const collisions=await card.evaluate(element=>{
    const heading=element.querySelector('h2'),range=document.createRange();range.selectNodeContents(heading);
    const text=[...range.getClientRects()],controls=[...element.querySelectorAll('.chart-card-actions button,.chart-card-actions a')].map(e=>e.getBoundingClientRect());
    return controls.some(c=>text.some(r=>Math.min(r.right,c.right)-Math.max(r.left,c.left)>1&&Math.min(r.bottom,c.bottom)-Math.max(r.top,c.top)>1));
   });assert(!collisions,'Chart action overlaps its heading');
  };
  const help=async(trigger,key,capture)=>{
   await trigger.scrollIntoViewIfNeeded();await trigger.click();const panel=page.locator('.info-floating');await panel.waitFor();
   const text=await panel.locator('.info-body').innerText();assert(text.includes(t(key)),`${locale}: wrong help text: ${key}`);
   const box=await panel.boundingBox();assert(box.x>=0&&box.x+box.width<=width+1&&box.y>=0&&box.y+box.height<=height+1,'Help leaves viewport');
   if(capture)await page.screenshot({path:`${out}/${engine}-${locale}-${prefix?'sepolia':'mainnet'}-${width}-${capture}.png`});
   await page.keyboard.press('Escape');await panel.waitFor({state:'hidden'});assert(await trigger.evaluate(e=>document.activeElement===e));row.helpCount++;
  };
  try{
   await page.goto(base+prefix+'/stats?lang='+locale,{waitUntil:'domcontentloaded'});await page.locator('.stats-counters[aria-busy="false"]').waitFor();await page.locator('.stats-counters article:not(.counter-skeleton)').nth(17).waitFor();await page.evaluate(()=>document.fonts.ready);
   assert.equal(await page.locator('html').getAttribute('lang'),locale);
   assert.equal(await page.locator('.stats-gas-link').getAttribute('aria-label'),t('Gas tracker'));
   if(width<=460){
    row.filters=await page.locator('.stats-filter-bar').evaluate(element=>{
     const selects=[...element.querySelectorAll('select')],canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
     return selects.map(select=>{const box=select.getBoundingClientRect(),style=getComputedStyle(select);ctx.font=style.font;return{width:box.width,y:box.y,text:select.selectedOptions[0].textContent,textWidth:ctx.measureText(select.selectedOptions[0].textContent).width,available:box.width-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)-20};});
    });assert(row.filters[1].y>=row.filters[0].y+44,'Phone filters must have separate full-width rows');assert(row.filters.every(f=>f.textWidth<=f.available),'Default filter selection is truncated');
   }
   await page.screenshot({path:`${out}/${engine}-${locale}-${prefix?'sepolia':'mainnet'}-${width}-stats.png`});
   for(const counter of source.counters.counters){const card=page.locator('.stats-counters article').filter({has:page.getByRole('button',{name:t(counter.title),exact:true})});assert.equal(await card.locator('strong').getAttribute('title'),counter.value);await help(card.locator('.info-button'),counter.description,counter.id==='totalAccountAbstractionWallets'?'counter-help':undefined);}
   for(const section of source.lines.sections){
    await page.locator('.stats-category-select select').selectOption(section.id);
    assert.equal(await page.locator('.stats-category-select select option:checked').textContent(),t(section.title));
    const cards=page.locator('.stats-chart-card');await cards.first().waitFor();assert.equal(await cards.count(),section.charts.length);
    for(let i=0;i<section.charts.length;i++){const chart=section.charts[i],card=cards.nth(i);assert.equal(await card.locator('h2').textContent(),t(chart.title));assert(await fit(card.locator('h2')),`Clipped chart title: ${chart.title}`);await clearActions(card);await help(card.locator('.info-button'),chart.description,chart.id==='accountAbstractionWalletsGrowth'?'chart-help':undefined);}
   }
   // Both translated phrases and the API's English chart titles remain searchable.
   await page.locator('.stats-category-select select').selectOption('');
   await page.locator('.stats-filter-bar').scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/${engine}-${locale}-${prefix?'sepolia':'mainnet'}-${width}-filters.png`});
   await page.evaluate(axe);row.statsViolations=await page.evaluate(async()=>(await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})));assert.deepEqual(row.statsViolations,[]);
   const search=page.locator('.stats-search input');
   for(const query of[t('Average block size'),'Average block size']){await search.fill(query);await page.locator('.stats-chart-card').first().waitFor();assert.equal(await page.locator('.stats-chart-card').count(),1);assert.equal(await page.locator('.stats-chart-card h2').textContent(),t('Average block size'));}
   await page.locator('.stats-chart-card .chart-card-actions a').click();await page.waitForURL(u=>u.pathname===prefix+'/stats/averageBlockSize');
   await page.locator('.stat-chart[aria-busy="false"]').waitFor();assert.equal(await page.locator('h1').textContent(),t('Average block size'));
   assert.equal(await page.locator('.stats-gas-link').getAttribute('aria-label'),t('All statistics'));
   assert((await page.locator('.stat-chart-value').innerText()).endsWith(t('Bytes')),'The chart unit must be localized');
   await clearActions(page.locator('.stats-chart-card'));
   assert(await fit(page.locator('h1')),'Clipped detail title');await page.screenshot({path:`${out}/${engine}-${locale}-${prefix?'sepolia':'mainnet'}-${width}-detail.png`});
   await page.goto(base+prefix+'/gas-tracker?lang='+locale,{waitUntil:'domcontentloaded'});
   await page.locator('.gas-estimates article').nth(2).waitFor();assert.equal(await page.locator('h1').textContent(),t('Gas tracker'));
   await help(page.locator('.gas-estimates-title .info-button'),'Gas estimates describe L2 execution. The total transaction fee also includes the L1 data fee.','gas-help');
   await page.evaluate(()=>scrollTo(0,0));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   await page.evaluate(axe);row.violations=await page.evaluate(async()=>(await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})));assert.deepEqual(row.violations,[]);assert.deepEqual(errors,[]);row.passed=true;
  }catch(error){row.error=error.stack;await page.screenshot({path:`${out}/failure-${engine}-${locale}-${prefix?'sepolia':'mainnet'}-${width}.png`}).catch(()=>{});}
  finally{await context.close();}
  results.push(row);console.log(JSON.stringify(row));await writeFile(out+'/results.json',JSON.stringify({base,complete:false,results},null,2));
 }}finally{await browser.close();}
}
await writeFile(out+'/results.json',JSON.stringify({base,complete:true,passed:results.every(r=>r.passed),mockedApi:true,metadataSource:'Captured mainnet and Sepolia statistics APIs',physicalDeviceTest:false,results},null,2));if(results.some(r=>!r.passed))process.exitCode=1;
