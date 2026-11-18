import{chromium,firefox,webkit}from'playwright-core';
import{mkdir,writeFile,readFile}from'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4310',output=process.env.RESPONSIVE_OUTPUT||'reports/redesign/responsive';
const locales=['en','fr','es','pt','zh','ja','ru','ar','hi','bn'],widths=[320,390,768,1024,1440,1920,2560];
const resumed=process.env.RESPONSIVE_RESUME==='1'?JSON.parse(await readFile(output+'/results.json','utf8')):null;
if(resumed && resumed.base!==base)throw new Error('Resume origin mismatch');
const results=resumed?resumed.results.filter(row=>row.passed):[];await mkdir(output,{recursive:true});
const caseKey=row=>JSON.stringify([row.engine,row.prefix,row.path,row.locale,row.width,row.theme]);
const completed=new Set(results.map(caseKey));
const cases=[];
for(const prefix of ['', '/testnet']){
 for(const locale of ['en','fr','ar'])cases.push({prefix,path:'/',locale,width:1180,theme:prefix?'dark':'light',menu:true});
 for(let i=0;i<locales.length;i++)for(const [j,path]of ['/', '/txs','/stats','/gas-tracker','/tokens','/developers'].entries())cases.push({prefix,path,locale:locales[i],width:widths[(i+j)%widths.length],theme:(i+j)%2?'dark':'light',menu:path==='/'});
 for(const path of ['/blocks','/accounts','/internal-txs','/deposits','/withdrawals','/token-transfers','/pools','/contracts'])for(const width of [320,1440])cases.push({prefix,path,locale:'en',width,theme:width===320?'dark':'light'});
}
const selectedCases=process.env.RESPONSIVE_PATHS ? cases.filter(item=>process.env.RESPONSIVE_PATHS.split(',').includes(item.path)) : cases;
const save=async complete=>writeFile(output+'/results.json',JSON.stringify({base,recordedAt:new Date().toISOString(),complete,passed:complete&&results.every(row=>row.passed),physicalDeviceTest:false,routeFilter:process.env.RESPONSIVE_PATHS||null,coverage:'All 10 locales and both chains in all 3 engines; viewport/theme pairwise matrix, 320–2560. Native ledgers may scroll inside their labeled regions.',results},null,2));
await Promise.all(Object.entries({chromium,firefox,webkit}).map(async([engine,implementation])=>{
 const browser=await implementation.launch(engine==='chromium'?{args:['--no-sandbox']}:{ });
 try{for(const item of selectedCases){if(completed.has(caseKey({engine,...item})))continue;const context=await browser.newContext({viewport:{width:item.width,height:900},colorScheme:item.theme});const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));const row={engine,...item,passed:false};
  try{
   await page.goto(base+item.prefix+item.path+'?lang='+item.locale,{waitUntil:'domcontentloaded'});await page.locator('h1').waitFor({state:'attached'});await page.evaluate(()=>document.fonts.ready);
   if(item.path==='/'){
    await page.locator('.utilization-gauge').waitFor();
    await page.locator('.compact-block-row').first().waitFor({state:'attached'});
    await page.locator('.home-chart-slot .interactive-chart,.home-chart-slot .chart-empty').waitFor();
   }
   if(item.path==='/stats'){
    await page.locator('.stats-counters article:not(.counter-skeleton) strong').first().waitFor();
    const bad=await page.locator('.stats-counters article:not(.counter-skeleton) strong > span').evaluateAll(values=>values.filter(el=>el.getClientRects().length).flatMap(el=>{const r=document.createRange();r.selectNodeContents(el);const box=el.getBoundingClientRect(),card=el.closest('article').getBoundingClientRect();return box.left<card.left || box.right>card.right || new Set([...r.getClientRects()].map(rect=>Math.round(rect.top))).size!==1?[el.textContent]:[]}));
    if(bad.length)throw new Error('Clipped or split counter values: '+bad.join(', '));
   }
   if(item.path==='/blocks'){
    await page.locator('.block-list .block-row').first().waitFor();
    for(const selector of ['.block-tx-count','.block-gas'])if(!await page.locator('.block-list .block-row').first().locator(selector).isVisible())throw new Error('Hidden block data: '+selector);
   }
   if(item.path==='/txs')await page.locator('.tx-row').first().waitFor();
   if(['/accounts','/internal-txs','/deposits','/withdrawals','/token-transfers'].includes(item.path))await page.locator('.data-ledger tbody tr,.data-ledger .empty').first().waitFor();
   const state=await page.evaluate(()=>({lang:document.documentElement.lang,dir:document.documentElement.dir,theme:document.documentElement.dataset.theme,overflow:document.documentElement.scrollWidth>innerWidth+1,main:document.querySelector('main')?.getBoundingClientRect().width}));row.state=state;
   if(state.lang!==item.locale||state.dir!==(item.locale==='ar'?'rtl':'ltr')||state.theme!==item.theme||state.overflow)throw new Error('Document state '+JSON.stringify(state));
   if(item.menu && item.width<1180){await page.locator('.drawer-trigger').click();await page.locator('.drawer-category').nth(2).click();await page.locator('.drawer-back').waitFor();if(!await page.locator('main').evaluate(el=>el.inert))throw new Error('Background remains interactive');await page.keyboard.press('Escape');if(await page.locator('.mobile-drawer').count())throw new Error('Drawer did not close');if(!await page.locator('.drawer-trigger').evaluate(el=>el===document.activeElement))throw new Error('Focus not restored');}
   if(errors.length)throw new Error(errors.join('; '));row.passed=true;
  }catch(error){row.error=error.message;row.errors=errors;await page.screenshot({path:`${output}/${engine}-${item.prefix?'testnet':'mainnet'}-${item.path.replaceAll('/','_')||'home'}-${item.locale}-${item.width}.png`}).catch(()=>{});}
  results.push(row);await save(false);console.log(JSON.stringify({engine,path:item.prefix+item.path,locale:item.locale,width:item.width,passed:row.passed,error:row.error}));await context.close();
 }}finally{await browser.close();}
}));
await save(true);if(results.some(r=>!r.passed))process.exitCode=1;
