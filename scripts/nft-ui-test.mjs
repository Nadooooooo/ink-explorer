import assert from 'node:assert/strict';import {chromium} from 'playwright-core';import {mkdir,writeFile,readFile} from 'node:fs/promises';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),base=process.env.BASE_URL||'http://127.0.0.1:4318',out=process.env.NFT_UI_OUTPUT||'reports/nft-details/interactions',results=[],contract='0x'+'a'.repeat(40),owner='0x'+'b'.repeat(40),id=(2n**256n-1n).toString();await mkdir(out,{recursive:true});const browser=await chromium.launch({args:['--no-sandbox']});
try{for(const width of[320,768,1440]){
 const context=await browser.newContext({viewport:{width,height:1000},permissions:['clipboard-read','clipboard-write']}),page=await context.newPage(),row={width,passed:false},errors=[];let failed=true,image='ready';page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
 await context.routeWebSocket(/\/api\/live$/,ws=>ws.close());await context.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname,headers={date:new Date().toUTCString(),'x-ink-data-status':'fresh','x-ink-data-fetched-at':new Date().toISOString()};
  if(path.includes('/media'))return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#8b5cf6"/><circle cx="200" cy="200" r="80" fill="#ede9fe"/></svg>'});
  if(path.endsWith('/transfers-count'))return route.fulfill({headers,json:{transfers_count:0}});
  if(path.endsWith('/transfers'))return route.fulfill({json:{items:[],next_page_params:null}});
  if(path.endsWith('/instances/'+id))return route.fulfill({headers,status:failed?503:200,json:failed?{error:'Data source unavailable'}:{id,owner:{hash:owner},image_url:'https://example.com/'+image+'.svg',metadata:{name:'Ink collectible',description:'Collection details',attributes:[{trait_type:'Network',value:'Ink'}]}}});
  if(path.endsWith(contract))return route.fulfill({headers,json:{address_hash:contract,name:'Ink collection',symbol:'INK',type:'ERC-721'}});return route.fulfill({status:503,json:{error:'Controlled unrelated source'}});
 });
 try{
  await page.goto(base+'/token/'+contract+'/instance/'+id+'?lang=fr',{waitUntil:'domcontentloaded'});await page.locator('.error-state button').waitFor();failed=false;await page.locator('.error-state button').click();await page.locator('.nft-media img.is-ready').waitFor();assert.equal(await page.locator('.nft-media .nft-placeholder').count(),0);
  await page.locator('.nft-facts .definition').filter({has:page.locator('dt', {hasText:'ID du jeton'})}).locator('.copy-button').click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),id);
  for(const tab of['overview','transfers','metadata']){
   if(await page.locator('.section-picker').isVisible())await page.locator('.section-picker select').selectOption(tab);else await page.locator('.section-navigation .tabs button').nth(['overview','transfers','metadata'].indexOf(tab)).click();
   await page.locator(tab==='overview'?'.nft-media img.is-ready':tab==='transfers'?'.nft-activity .empty':'.nft-json pre').waitFor();
   await page.addScriptTag({content:await readFile(require.resolve('axe-core/axe.min.js'),'utf8')});const scan=await page.evaluate(()=>axe.run(document.querySelector('.nft-instance-page'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));assert.deepEqual(scan.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);
   if(tab==='metadata'){await page.locator('.nft-json .info-button').click();await page.locator('.info-floating').first().waitFor();await page.keyboard.press('Escape');}
   await page.screenshot({path:`${out}/${width}-${tab}.png`,fullPage:true});
  }
  assert.deepEqual(errors,[]);row.passed=true;
 }catch(error){row.error=error.stack;await page.screenshot({path:`${out}/failure-${width}.png`,fullPage:true}).catch(()=>{});}finally{await context.close();}
 results.push(row);console.log(JSON.stringify(row));await writeFile(`${out}/results.json`,JSON.stringify({base,complete:false,results},null,2));
}}finally{await browser.close();}await writeFile(`${out}/results.json`,JSON.stringify({base,complete:true,passed:results.every(r=>r.passed),mockedApi:true,physicalDeviceTest:false,results},null,2));if(results.some(r=>!r.passed))process.exitCode=1;
