import {chromium} from 'playwright-core';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
const base=process.env.BASE_URL || 'http://127.0.0.1:4310';
const axe=await readFile(new URL('../node_modules/axe-core/axe.min.js',import.meta.url),'utf8');
const results=[];await mkdir('reports/redesign/accessibility',{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const paths=(process.env.REDESIGN_PATHS || '/,/txs,/blocks,/stats,/gas-tracker,/accounts,/internal-txs,/deposits,/withdrawals,/token-transfers,/tokens,/pools,/developers').split(',');
for(const theme of ['light','dark'])for(const width of [390,1440]) {
  const context=await browser.newContext({viewport:{width,height:900},bypassCSP:true});
  await context.addInitScript(theme=>localStorage.setItem('ink-theme',theme),theme);
  for(const path of paths){
    const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    try{
      await page.goto(base+path,{waitUntil:'domcontentloaded'});await page.locator('h1').waitFor();
      const selector=path==='/stats'?'.stats-chart-card':path==='/gas-tracker'?'.gas-estimates':path==='/developers'?'.api-endpoints':path==='/'?'.compact-tx-row':path==='/txs'?'.tx-row':path==='/blocks'?'.block-row':path==='/tokens'?'.token-row':path==='/pools'?'.pool-row':path==='/contracts'?'.contract-card':'.data-ledger tbody tr';
      await page.locator(selector).first().waitFor({timeout:45000});
      if(path==='/stats'){await page.locator('.stats-chart-card').first().scrollIntoViewIfNeeded();await page.locator('.stats-chart-card .interactive-chart').first().waitFor({timeout:25000});}
      await page.addScriptTag({content:axe});
      const violations=await page.evaluate(async()=> (await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(item=>({id:item.id,impact:item.impact,nodes:item.nodes.map(node=>({target:node.target,summary:node.failureSummary})).slice(0,10)})));
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
      results.push({path,width,theme,overflow,errors,violations,passed:!overflow && !errors.length && !violations.length});
      if(!results.at(-1).passed)await page.screenshot({path:`reports/redesign/accessibility/${path.replaceAll('/','_')||'home'}-${width}-${theme}.png`,fullPage:false});
    }catch(error){results.push({path,width,theme,error:error.message,passed:false});}
    console.log(JSON.stringify(results.at(-1)));
    await writeFile('reports/redesign/accessibility/results.json',JSON.stringify({complete:false,results},null,2));
    await page.close();
  }
  await context.close();
}
await browser.close();
await writeFile('reports/redesign/accessibility/results.json',JSON.stringify({complete:true,passed:results.every(result=>result.passed),results},null,2));
if(results.some(result=>!result.passed))process.exitCode=1;
