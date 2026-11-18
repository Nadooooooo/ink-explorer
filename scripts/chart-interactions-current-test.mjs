import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,firefox,webkit} from 'playwright';
async function selectRange(card,period){await card.scrollIntoViewIfNeeded();await card.locator('select').selectOption(period);}
const freshHeaders=()=>({date:new Date().toUTCString(),'x-ink-data-status':'fresh','x-ink-data-fetched-at':new Date().toISOString()});
const base=process.env.BASE_URL||'http://127.0.0.1:4188',out=process.env.CHART_REVIEW_DIR||'screenshots/chart-interactions';
const results=[];await mkdir(out,{recursive:true});
const day=86400000,stamp=value=>new Date(value).toISOString().slice(0,10),today=Date.parse(stamp(Date.now()));
const definitions=[{id:'activeAccounts',title:'Active accounts',description:'Accounts active in each interval',units:null,resolutions:['DAY','WEEK']},{id:'newAccounts',title:'New accounts',description:'New accounts in each interval',units:null,resolutions:['DAY','WEEK']}];
definitions.push({id:'txnsSuccessRate',title:'Transaction success',description:'Successful transaction fraction',units:null,resolutions:['DAY','WEEK']});
const catalogue={sections:[{id:'accounts',title:'Accounts',charts:definitions.slice(0,2)},{id:'transactions',title:'Transactions',charts:definitions.slice(2)}]};
function series(url) {
 const weekly=url.searchParams.get('resolution')==='WEEK',from=Date.parse(url.searchParams.get('from')||stamp(today-29*day)),to=Date.parse(url.searchParams.get('to')||stamp(today));
 const start=weekly?from-((new Date(from).getUTCDay()+6)%7)*day:from,step=weekly?7*day:day;
 const chart=[];for(let date=start,i=0;date<=to;date+=step,i++)chart.push({date:stamp(date),date_to:stamp(date+(weekly?6:0)*day),value:url.pathname.endsWith('/txnsSuccessRate')?'0.98':String(1000+i*17),is_approximate:date+step>to});
 return {chart,info:definitions.find(item=>url.pathname.endsWith('/'+item.id))};
}
for(const engine of(process.env.CHART_BROWSERS||'chromium,firefox,webkit').split(',')) {
 const browser=await({chromium,firefox,webkit})[engine].launch(engine==='chromium'?{executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']}:{});
 try {for(const width of [320,390,768,1440]) {
  const context=await browser.newContext({viewport:{width,height:1000},hasTouch:width<500,...(engine!=='firefox'?{isMobile:width<500}:{})}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));let failure=false,empty=false,race=false;const pending=[];
  await page.route('**/api/stats/lines',route=>route.fulfill({headers:freshHeaders(),json:catalogue}));
  await page.route('**/api/stats/lines/*?**',async route=>{
   const url=new URL(route.request().url()),metric=url.pathname.split('/').pop();
   if(metric==='newAccounts'&&failure)return route.fulfill({status:503,headers:{'retry-after':'1'},json:{error:'Deliberate chart fixture outage'}});
   if(metric==='newAccounts'&&empty)return route.fulfill({headers:freshHeaders(),json:{chart:[],info:definitions[1]}});
   const data=series(url);
   if(metric==='activeAccounts'&&race&&data.chart.length===90){pending.push(()=>route.fulfill({headers:freshHeaders(),json:data}).catch(()=>{}));return;}
   await route.fulfill({headers:freshHeaders(),json:data});
  });
  const load=async language=>{
   await page.goto(`${base}/stats?lang=${language}`,{waitUntil:'domcontentloaded'});const category=page.locator('.stats-category-select select:visible,.stats-categories button[data-category=""]:visible').first();await category.waitFor();if(await category.evaluate(el=>el.tagName==='SELECT'))await category.selectOption('');else await category.click();
   const cards=page.locator('article.stat-chart');assert.equal(await cards.count(),3,'Each catalogue chart owns a separate card');
   for(const card of await cards.all()){await card.scrollIntoViewIfNeeded();await card.locator('.interactive-chart').waitFor().catch(async error=>{console.error('Chart diagnostic',await card.innerText(),errors);await page.screenshot({path:out+'/current-chart-diagnostic.png'});throw error;});}
   return cards;
  };
  const cards=await load('en'),first=cards.nth(0),second=cards.nth(1);
  const ratio=cards.nth(2);const ratioText=await ratio.locator('.stat-chart-value').innerText();assert(ratioText.includes('%'));assert.equal(Number(ratioText.replace('%','').trim()),98,'Source fraction0.98 renders as98percent');await ratio.locator('.chart-data summary').click();assert.equal(Number(await ratio.locator('.chart-data tbody tr').first().locator('td').nth(1).innerText()),.98,'Exact tables keep the source fraction');await ratio.locator('.chart-data summary').click();
  assert.equal(await page.locator('.chart-range select').count(),3,'Each chart owns its range');
  await selectRange(first,'7');await first.locator('.interactive-chart[data-points="7"]').waitFor();
  assert.equal(await second.locator('select').inputValue(),'30','A range change never changes its neighbour');
  async function inspect(card,fraction) {
   await card.scrollIntoViewIfNeeded();const chart=card.locator('.interactive-chart');await chart.waitFor();
   await chart.evaluate(element=>element.scrollIntoView({block:'center',behavior:'instant'}));await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const box=await chart.boundingBox();if(width<500)await page.touchscreen.tap(box.x+box.width*fraction,box.y+box.height*.6);else await page.mouse.move(box.x+box.width*fraction,box.y+box.height*.6);
   const tooltip=chart.locator('.chart-tooltip');await tooltip.waitFor();assert.equal(await page.locator('.chart-tooltip').count(),1);
   const tip=await tooltip.boundingBox();assert(tip.x>=-1&&tip.x+tip.width<=width+1,'Tooltip stays inside the viewport');assert(tip.height<=100,'Date and value stay compact');
   assert(await tooltip.locator('span').first().innerText());assert(await tooltip.locator('strong').innerText());
  }
  await inspect(first,.02);await inspect(second,.98);await page.screenshot({path:`${out}/${engine}-${width}-tooltip.png`});
  await page.keyboard.press('Escape');assert.equal(await page.locator('.chart-tooltip').count(),0);
  await first.scrollIntoViewIfNeeded();const graph=first.locator('.interactive-chart');await graph.waitFor();await graph.focus();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.keyboard.press('End');await page.keyboard.press('ArrowLeft');await graph.locator('.chart-tooltip').waitFor();
  await page.keyboard.press('Tab');assert.equal(await page.locator('.chart-tooltip').count(),0,'Blur closes the inspector');
  await inspect(first,.5);await first.locator('h2,h3').first().click();assert.equal(await page.locator('.chart-tooltip').count(),0,'Outside activation closes the inspector');
  await inspect(first,.4);await page.evaluate(()=>scrollBy({top:80,behavior:'instant'}));await page.waitForFunction(()=>!document.querySelector('.chart-tooltip'));
  race=true;await selectRange(first,'90');const raceDeadline=Date.now()+5000;while(!pending.length&&Date.now()<raceDeadline)await page.waitForTimeout(20);assert(pending.length,'The race must hold an obsolete90dayresponse');await selectRange(first,'7');await first.locator('.interactive-chart[data-points="7"]').waitFor();for(const release of pending.splice(0))await release();assert.equal(await first.locator('select').inputValue(),'7');race=false;
  failure=true;await selectRange(second,'90');await second.locator('.chart-error').waitFor();assert.equal(await first.locator('select').inputValue(),'7');failure=false;await page.waitForTimeout(1100);await second.locator('.chart-error button').click();await second.locator('.interactive-chart[data-points="90"]').waitFor();
  empty=true;await selectRange(second,'7');await second.locator('.chart-empty').waitFor();empty=false;await selectRange(second,'30');await second.locator('.interactive-chart[data-points="30"]').waitFor();
  await selectRange(first,'365');await first.locator('.interactive-chart').waitFor();await first.locator('.chart-data summary').click();await first.locator('.chart-data tbody tr').first().waitFor();
  const download=page.waitForEvent('download');await first.locator('.chart-data button').click();await(await download).saveAs(`${out}/${engine}-${width}-weekly.csv`);assert.equal(await second.locator('select').inputValue(),'30');
  const arabic=await load('ar');await inspect(arabic.first(),.02);assert.equal(await page.locator('html').getAttribute('dir'),'rtl');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);
  if (width === 320) {
   await page.addInitScript(() => {
    const BrowserResizeObserver = window.ResizeObserver;
    window.ResizeObserver = class extends BrowserResizeObserver {
     constructor(callback) {
      super((entries, observer) => {
       const otherEntries = entries.filter(entry => !entry.target.matches('.home-chart-slot .interactive-chart'));
       if (otherEntries.length) callback(otherEntries, observer);
      });
     }
    };
   });
   await page.route('**/api/overview', route => route.fulfill({ headers: freshHeaders(), json: {
    stats: { total_addresses: '200' }, blocks: [], transactions: [],
    chart: [-2, -1, 0].map((days, index) => ({ date: stamp(today + days * day), transactions_count: 20 + index })),
   } }));
   await page.goto(`${base}/?lang=ar`, { waitUntil: 'domcontentloaded' });
   const plot = page.locator('.home-chart-slot .interactive-chart');
   await plot.waitFor();
   const geometry = await plot.evaluate(element => {
    const svg = element.querySelector('svg.sparkline');
    return { viewport: [element.clientWidth, element.clientHeight], viewBox: [svg.viewBox.baseVal.width, svg.viewBox.baseVal.height] };
   });
   assert.deepEqual(geometry.viewBox, geometry.viewport, 'The first home chart fits its plot before ResizeObserver delivery');
   await plot.focus();
   await page.keyboard.press('End');
   await plot.locator('.chart-tooltip').waitFor();
   await page.keyboard.press('Escape');
   assert.equal(await plot.locator('.chart-tooltip').count(), 0);
   assert.deepEqual(errors, []);
  }
  results.push({engine,width,passed:true,coverage:'Independent catalogue ranges, pointer/touch/keyboard, local tooltip, CSV/table, outage/retry, empty, race and Arabic RTL'});await context.close();console.log(`${engine} ${width}px passed`);
 }}finally{await browser.close();}
}
await writeFile(out+'/results.json',JSON.stringify({at:new Date().toISOString(),fixtureOnly:true,physicalDeviceTest:false,results,passed:true},null,2));
