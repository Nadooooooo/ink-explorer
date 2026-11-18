import assert from 'node:assert/strict';import{chromium}from'playwright';import{readFile,writeFile,mkdir}from'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4310',out=process.env.DETAIL_LAYOUT_OUTPUT||'reports/detail-ergonomics/layout',data=JSON.parse(await readFile('reports/detail-ergonomics/comparison/results.json','utf8'));await mkdir(out,{recursive:true});
const browser=await chromium.launch({args:['--no-sandbox']}),results=[];
try{for(const locale of['en','fr','ar','es','pt','zh','ja','ru','hi','bn'])for(const width of[320,768,1440]){
 const page=await browser.newPage({viewport:{width,height:1000},colorScheme:width===320?'light':'dark',hasTouch:width<1000}),row={locale,width,passed:false};page.setDefaultTimeout(15000);
 try{for(const kind of['block','tx']){
  await page.goto(base+'/'+kind+'/'+(kind==='block'?data.block.hash:data.tx.hash)+'?lang='+locale,{waitUntil:'domcontentloaded'});await page.locator('.definitions').waitFor();await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(250);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,kind+' viewport overflow');
  const rects=await page.locator('.definitions .definition').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect(),dd=e.querySelector('dd'),d=dd.getBoundingClientRect();return{left:r.left,right:r.right,ddLeft:d.left,ddRight:d.right,text:dd.innerText,clipped:dd.scrollWidth>dd.clientWidth+1};}));assert(!rects.some(r=>r.ddLeft<r.left-1||r.ddRight>r.right+1||r.clipped),kind+' detail values fit');
  if(kind==='block'){
   for(const a of await page.locator('.detail-actions a').all()){const box=await a.boundingBox();assert(box.width>=44&&box.height>=44);}
   assert.equal(await page.locator('.inline-section-navigation .tabs button[aria-pressed="true"]').count(),1);
   if(width===320)assert.equal(await page.locator('.inline-section-navigation .section-picker').isVisible(),false);
   await page.screenshot({path:`${out}/${locale}-${width}-block.png`});
  }else{
   const first=await page.locator('.transaction-definitions').boundingBox();row.firstTransactionFactY=first.y;
   assert.equal(await page.locator('.detail-party .entity-mark').count(),2);
   await page.screenshot({path:`${out}/${locale}-${width}-tx.png`});
  }
 }row.passed=true;}catch(e){row.error=e.stack;await page.screenshot({path:`${out}/${locale}-${width}-failure.png`,fullPage:true}).catch(()=>{});}finally{await page.close();}
 results.push(row);console.log(JSON.stringify(row));await writeFile(out+'/results.json',JSON.stringify({complete:false,results},null,2));
}}finally{await browser.close();}
await writeFile(out+'/results.json',JSON.stringify({complete:true,passed:results.every(r=>r.passed),physicalDeviceTest:false,results},null,2));if(results.some(r=>!r.passed))process.exitCode=1;
