import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4310',out=process.env.SUMMARY_OUTPUT||'reports/journeys/summary-layout';await mkdir(out,{recursive:true});
const results=[];
for(const [engine,launcher] of Object.entries({chromium,firefox,webkit})){
 const browser=await launcher.launch(engine==='chromium'?{args:['--no-sandbox']}:{});
 try{for(const width of [320,390,430,768,1440])for(const lang of ['en','fr','ar']){
  const theme=lang==='fr'?'light':'dark',context=await browser.newContext({viewport:{width,height:900},colorScheme:theme}),page=await context.newPage(),row={engine,width,lang,theme,passed:false};
  await context.route(/\/api\/stats\/counters$/,r=>r.fulfill({json:{counters:[{id:'newTxns24h',title:'Transactions (24h)',value:'464310'},{id:'txnsFee24h',title:'Transactions fees (24h)',value:'1000.123456789',units:'ETH'},{id:'averageTxnFee24h',title:'Avg. transaction fee (24h)',value:'0.000000319',units:'ETH'}]}}));
  try{
   await page.goto(base+'/txs?lang='+lang,{waitUntil:'domcontentloaded'});await page.locator('.transaction-summary strong span').last().waitFor();await page.evaluate(()=>document.fonts.ready);
   row.geometry=await page.locator('.transaction-summary .metric').evaluateAll(cards=>cards.map(card=>{
    const c=card.getBoundingClientRect(),top=card.querySelector('.metric-top').getBoundingClientRect(),strong=card.querySelector('strong').getBoundingClientRect();
    return {overlap:Math.min(top.right,strong.right)-Math.max(top.left,strong.left)>1 && Math.min(top.bottom,strong.bottom)-Math.max(top.top,strong.top)>1,values:[...card.querySelectorAll('strong>span')].map(span=>{const r=document.createRange();r.selectNodeContents(span);const bounds=span.getBoundingClientRect();return {text:span.textContent,lines:r.getClientRects().length,inside:bounds.left>=c.left && bounds.right<=c.right};})};
   }));
   for(const metric of row.geometry){assert.equal(metric.overlap,false);for(const value of metric.values){assert.equal(value.lines,1,JSON.stringify(value));assert.equal(value.inside,true,JSON.stringify(value));}}
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   for(const info of await page.locator('.transaction-summary .info-button').all()){
    await info.click();await page.locator('.info-floating').waitFor();const box=await page.locator('.info-floating').boundingBox();assert.ok(box.x>=0 && box.x+box.width<=width+1);await page.keyboard.press('Escape');
   }
   if(engine==='chromium' && [320,390,1440].includes(width))await page.locator('.transaction-summary').screenshot({path:`${out}/${engine}-${width}-${lang}.png`});
   row.passed=true;
  }catch(e){row.error=e.message;await page.screenshot({path:`${out}/failure-${engine}-${width}-${lang}.png`});}
  results.push(row);console.log(JSON.stringify({engine,width,lang,passed:row.passed,error:row.error}));await writeFile(out+'/results.json',JSON.stringify({base,complete:false,results},null,2));await context.close();
 }}finally{await browser.close();}
}
await writeFile(out+'/results.json',JSON.stringify({base,complete:true,passed:results.every(r=>r.passed),results},null,2));if(results.some(r=>!r.passed))process.exitCode=1;
