import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4310',out=process.env.STAT_REAL_OUTPUT||'reports/stat-freshness/real-values',results=[];
const dict=JSON.parse(await readFile('src/locales/fr.json','utf8'));await mkdir(out,{recursive:true});const browser=await chromium.launch({args:['--no-sandbox']});
try{for(const prefix of['','/testnet'])for(const width of[390,1440])for(const path of['stats','gas-tracker']){
 const context=await browser.newContext({viewport:{width,height:844}}),page=await context.newPage(),row={prefix,width,path,passed:false,mockedApi:false};
 try{
  const response=page.waitForResponse(r=>new URL(r.url()).pathname===prefix+(path==='stats'?'/api/stats/counters':'/api/explorer/stats')&&(path==='stats'||new URL(r.url()).searchParams.has('gas_oracle')));
  await page.goto(base+prefix+'/'+path+'?lang=fr',{waitUntil:'domcontentloaded'});const res=await response;assert.equal(res.status(),200);assert.equal(res.headers()['x-ink-data-status'],'fresh');const data=await res.json();row.fetchedAt=res.headers()['x-ink-data-fetched-at'];
  if(path==='stats'){
   await page.locator('.stats-essential[aria-busy="false"]').waitFor();assert.equal(await page.locator('.counter-source-state').count(),0);row.compared=0;
   for(const counter of data.counters){if(counter.id==='totalBlocks')continue;const card=page.locator('[data-counter="'+counter.id+'"]');assert.equal(await card.locator('strong').getAttribute('title'),String(counter.value));row.compared++;}
   await page.locator('.stats-totals summary').click();
   await page.waitForFunction(()=>{const head=document.querySelector('[data-live-head]')?.getAttribute('data-live-head');return !!head&&Number(document.querySelector('[data-counter="totalBlocks"] strong')?.getAttribute('title'))===Number(head)+1;});
   row.canonical=await page.evaluate(()=>({head:document.querySelector('[data-live-head]')?.getAttribute('data-live-head'),count:document.querySelector('[data-counter="totalBlocks"] strong')?.getAttribute('title')}));
  }else{
   await page.locator('.gas-estimates[aria-busy="false"]').waitFor();assert.equal(await page.locator('.gas-estimates-title .statistics-retry').count(),0);row.compared=0;
   for(const [index,speed] of ['slow','average','fast'].entries()){const raw=data.gas_prices[speed],price=Number(raw.wei)/1e9,expected=new Intl.NumberFormat('fr',{maximumFractionDigits:9}).format(price);assert.equal((await page.locator('.gas-estimates article strong').nth(index).innerText()).trim(),expected+' Gwei');row.compared++;}
  }
  await page.screenshot({path:`${out}/${prefix?'sepolia':'mainnet'}-${width}-${path}.png`});row.passed=true;
 }catch(error){row.error=error.stack;}finally{await context.close();}
 results.push(row);console.log(JSON.stringify(row));await writeFile(out+'/results.json',JSON.stringify({base,complete:false,results},null,2));
}}finally{await browser.close();}
await writeFile(out+'/results.json',JSON.stringify({base,complete:true,passed:results.every(r=>r.passed),results},null,2));if(results.some(r=>!r.passed))process.exitCode=1;
