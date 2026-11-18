import assert from 'node:assert/strict';import{chromium}from'playwright-core';import{mkdir,writeFile}from'node:fs/promises';const base=process.env.BASE_URL||'http://127.0.0.1:4310',out=process.env.TOKEN_LAYOUT_OUTPUT||'reports/token-ergonomics/layout';await mkdir(out,{recursive:true});const b=await chromium.launch({args:['--no-sandbox']}),results=[];
try{for(const locale of['en','fr','ar','es','pt','zh','ja','ru','hi','bn'])for(const width of[320,1440]){
 const page=await b.newPage({viewport:{width,height:1000},colorScheme:width===320?'light':'dark'}),row={locale,width,passed:false};page.setDefaultTimeout(15000);
 try{
  await page.goto(base+'/tokens?lang='+locale,{waitUntil:'domcontentloaded'});await page.locator('.token-row').first().waitFor();await page.evaluate(()=>document.fonts.ready);
  row.firstTokenY=(await page.locator('.token-row').first().boundingBox()).y;
  for(const target of await page.locator('.token-directory-filters button,.token-directory-filters select,.token-list-controls .cursor-pagination button').all()){const box=await target.boundingBox();assert(box.height>=44&&box.width>=44,'Touch controls');}
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.screenshot({path:`${out}/${locale}-${width}-directory.png`});
  await page.goto(base+'/token/0x4200000000000000000000000000000000000006?lang='+locale,{waitUntil:'domcontentloaded'});await page.locator('.token-summary').waitFor();await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.locator('.token-summary .metric').count(),4);row.headerHeight=(await page.locator('.token-detail-header').boundingBox()).height;
  const layout=await page.locator('.token-detail-header').evaluate(el=>{const rect=el.getBoundingClientRect(),price=el.querySelector('.token-price').getBoundingClientRect(),identity=el.querySelector('.token-id').getBoundingClientRect();return{priceInside:price.right<=rect.right+1&&price.left>=rect.left-1,overlap:Math.min(price.right,identity.right)>Math.max(price.left,identity.left)+1&&Math.min(price.bottom,identity.bottom)>Math.max(price.top,identity.top)+1};});assert(layout.priceInside&&!layout.overlap);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.equal(await page.locator('.token-summary strong').evaluateAll(es=>es.some(e=>e.scrollWidth>e.clientWidth+1)),false);await page.screenshot({path:`${out}/${locale}-${width}-profile.png`});row.passed=true;
 }catch(e){row.error=e.stack;await page.screenshot({path:`${out}/failure-${locale}-${width}.png`}).catch(()=>{});}finally{await page.close();}
 results.push(row);console.log(JSON.stringify(row));await writeFile(out+'/results.json',JSON.stringify({complete:false,results},null,2));
}}finally{await b.close();}
await writeFile(out+'/results.json',JSON.stringify({complete:true,passed:results.every(r=>r.passed),physicalDeviceTest:false,results},null,2));if(results.some(r=>!r.passed))process.exitCode=1;
