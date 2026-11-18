import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4311',out=process.env.LEDGER_LAYOUT_OUTPUT||'reports/ledger-placement/layout';await mkdir(out,{recursive:true});
const browser=await chromium.launch({args:['--no-sandbox']}),results=[];
try{for(const [width,locale] of [[390,'en'],[768,'ar'],[1440,'fr']])for(const route of ['accounts','internal-txs','deposits','withdrawals','token-transfers']){
 const p=await browser.newPage({viewport:{width,height:1000},colorScheme:width===1440?'light':'dark'}),r={route,width,locale,passed:false};
 try{
  await p.goto(base+'/'+route+'?lang='+locale,{waitUntil:'domcontentloaded'});await p.locator('.ledger-record,.transfer-record').first().waitFor({timeout:40000});await p.evaluate(()=>document.fonts.ready);
  r.geometry=await p.evaluate(()=>{
   const v=document.querySelector('.ledger-scroll'),table=v.querySelector('table'),heads=[...table.querySelectorAll('th')],cells=[...table.querySelector('tbody tr').children];
   return{overflow:document.documentElement.scrollWidth>innerWidth+1,firstRow:table.querySelector('tbody tr').getBoundingClientRect().toJSON(),tabIndex:v.getAttribute('tabindex'),needsScroll:v.scrollWidth>v.clientWidth+1,
    nativeCells:cells.every(c=>getComputedStyle(c).display==='table-cell'),headingsAligned:heads.every((h,i)=>{const a=h.getBoundingClientRect(),b=cells[i].getBoundingClientRect();return Math.abs(a.x-b.x)<1&&Math.abs(a.width-b.width)<1;}),
    numericHeadings:[...table.querySelectorAll('th.ledger-heading-value,th.ledger-heading-percentage,th.ledger-heading-count,th.ledger-heading-gas')].map(h=>getComputedStyle(h).textAlign),
    summaryInside:[...document.querySelectorAll('.bridge-summary article')].every(e=>{const b=e.getBoundingClientRect();return [...e.querySelectorAll('strong,svg')].every(c=>{const cb=c.getBoundingClientRect();return !cb.width||(cb.left>=b.left&&cb.right<=b.right+1&&cb.top>=b.top&&cb.bottom<=b.bottom+1);});})};
  });
  assert(!r.geometry.overflow);assert(r.geometry.headingsAligned);assert(r.geometry.nativeCells);assert(r.geometry.summaryInside);assert(r.geometry.numericHeadings.every(x=>x==='end'));assert.equal(r.geometry.tabIndex,r.geometry.needsScroll?'0':null);
  if(route==='internal-txs')assert.equal(await p.locator('.ledger-scroll th').count(),6);
  if(route==='token-transfers')assert.equal(await p.locator('.ledger-scroll th').count(),7);
  await p.screenshot({path:`${out}/${width}-${route}.png`});r.passed=true;
 }catch(e){r.error=e.stack;await p.screenshot({path:`${out}/failure-${width}-${route}.png`}).catch(()=>{});}
 finally{await p.close();}results.push(r);console.log(JSON.stringify({route,width,passed:r.passed,error:r.error}));await writeFile(out+'/results.json',JSON.stringify({base,complete:false,results},null,2));
}}finally{await browser.close();}
await writeFile(out+'/results.json',JSON.stringify({base,complete:true,passed:results.every(r=>r.passed),realApi:true,results},null,2));if(results.some(r=>!r.passed))process.exitCode=1;
