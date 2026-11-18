import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4310',out=process.env.POLISH_OUTPUT||'reports/polish/components';
await mkdir(out,{recursive:true});
const routes=['/','/txs','/blocks','/stats','/gas-tracker','/accounts','/internal-txs','/deposits','/withdrawals','/tokens','/token-transfers','/pools','/developers','/contracts','/batches','/dispute-games','/ops','/name-services','/apps','/network','/search?q=ETH'];
const blocks=await fetch(base+'/api/explorer/blocks').then(r=>r.json()),txs=await fetch(base+'/api/explorer/transactions').then(r=>r.json());
routes.push('/block/'+blocks.items[5].height,'/tx/'+txs.items[10].hash,'/address/0x4200000000000000000000000000000000000006','/token/0x4200000000000000000000000000000000000006');
const browser=await chromium.launch({args:['--no-sandbox']}),results=[];
try{for(const [width,theme] of [[390,'dark'],[1440,'light']]){
const context=await browser.newContext({viewport:{width,height:1000},colorScheme:theme});
for(const [index,path] of routes.entries()){
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const row={path,width,theme};
 try{
  await page.goto(base+path+(path.includes('?')?'&':'?')+'lang=fr',{waitUntil:'domcontentloaded'});
  await page.locator('h1').waitFor();await page.evaluate(()=>document.fonts.ready);
  await page.waitForTimeout(1200);
  const wait=page.locator('main .loading');if(await wait.count())await wait.first().waitFor({state:'hidden',timeout:20000}).catch(()=>{});
  if(path==='/stats')await page.locator('.stats-counters strong').first().waitFor();
  row.state=await page.evaluate(()=>{
   const visible=e=>{const b=e.getBoundingClientRect();return b.width>0&&b.height>0&&getComputedStyle(e).visibility!=='hidden'&&!e.closest('.sr-only,[aria-hidden="true"]');};
   const texts=[...document.querySelectorAll('main *')].filter(e=>visible(e)&&[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())&&parseFloat(getComputedStyle(e).fontSize)<12);
   return {overflow:document.documentElement.scrollWidth>innerWidth+1,tinyText:[...new Set(texts.map(e=>e.tagName+'.'+e.className+' '+getComputedStyle(e).fontSize))].slice(0,25),h1:document.querySelector('h1').innerText};
  });
  await page.screenshot({path:`${out}/${String(index).padStart(2,'0')}-${width}.png`});
  if(path==='/'){await page.locator('.compact-tx-row').first().screenshot({path:`${out}/transaction-${width}.png`});if(width===390){await page.locator('.drawer-trigger').click();await page.screenshot({path:out+'/drawer.png'});}}
  if(path==='/stats'){await page.locator('.stats-chart-card').first().scrollIntoViewIfNeeded();await page.waitForTimeout(700);await page.screenshot({path:`${out}/charts-${width}.png`});}
  row.passed=!row.state.overflow&&!errors.length;row.errors=errors;
 }catch(error){row.passed=false;row.error=error.message;}
 results.push(row);console.log(JSON.stringify(row));await writeFile(out+'/results.json',JSON.stringify({base,complete:false,results},null,2));await page.close();
}await context.close();}
}finally{await browser.close();await writeFile(out+'/results.json',JSON.stringify({base,complete:true,passed:results.every(r=>r.passed),results},null,2));}
if(results.some(r=>!r.passed))process.exitCode=1;
