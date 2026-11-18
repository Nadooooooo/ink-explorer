import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'https://inkexplorer.xyz',output=process.env.FILTER_BROWSER_OUTPUT||'reports/filter-integrity/public-browser';
const samples=JSON.parse(await readFile('reports/filter-integrity/before-real.json','utf8')),results=[];await mkdir(output,{recursive:true});
for(const [engine,launcher] of [['chromium',chromium],['firefox',firefox],['webkit',webkit]]){
 const browser=await launcher.launch(engine==='chromium'?{args:['--no-sandbox']}:{});
 try{for(const sample of samples)for(const width of [320,1440]){
  const {prefix,failed,query}=sample,page=await browser.newPage({viewport:{width,height:900},colorScheme:'dark'}),row={engine,prefix,width,passed:false},errors=[];page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));
  try{
   const endpoint=prefix+'/api/v1/transactions',load=async status=>{
    const response=page.waitForResponse(r=>new URL(r.url()).pathname===endpoint);
    await page.goto(base+prefix+'/txs?'+new URLSearchParams({...query,status,lang:'fr'}),{waitUntil:'domcontentloaded'});const r=await response;assert.equal(r.status(),200);const body=await r.json();await page.locator('.filtered-activity .table-shell[aria-busy="false"]').waitFor();return body;
   };
   const data=await load('failed');assert(data.items.some(x=>x.hash===failed.hash));
   const txRow=page.locator('.filtered-activity .tx-row').filter({has:page.locator(`a[href*="/tx/${failed.hash}"]`)});assert.equal(await txRow.count(),1);assert.equal(new URL(await txRow.locator('a[href*="/tx/"]').first().getAttribute('href'),base).pathname,prefix+'/tx/'+failed.hash);assert.equal(await txRow.locator('.tx-type-icon.failed').count(),1);assert.equal(await txRow.locator('.failure-label').count(),1);
   assert.equal(await page.locator('main [role="alert"]').count(),0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   const downloadEvent=page.waitForEvent('download');await page.locator('.filtered-activity .table-toolbar button').filter({hasText:'CSV'}).click();const download=await downloadEvent;const csv=await readFile(await download.path(),'utf8');assert(csv.includes(failed.hash));assert(csv.includes('"error"'));row.exportVerified=true;
   await page.screenshot({path:`${output}/${engine}-${prefix?'sepolia':'mainnet'}-${width}-failed.png`});
   await txRow.locator(`a[href*="/tx/${failed.hash}"]`).click();await page.waitForURL(url=>url.pathname===prefix+'/tx/'+failed.hash);await page.locator('.detail-header').waitFor();
   const success=await load('success');assert(!success.items.some(x=>x.hash===failed.hash));assert.equal(await page.locator('.filtered-activity .tx-row').count(),0);assert(await page.locator('.filtered-activity .empty').isVisible());
   const all=await load('');assert(all.items.some(x=>x.hash===failed.hash));assert.equal(await page.locator('.filtered-activity .failure-label').count(),1);assert.deepEqual(errors,[]);row.passed=true;
  }catch(error){row.error=error.stack;await page.screenshot({path:`${output}/failure-${engine}-${prefix?'sepolia':'mainnet'}-${width}.png`}).catch(()=>{});}
  results.push(row);console.log(JSON.stringify(row));await page.close();
 }}finally{await browser.close();}
}
await writeFile(output+'/results.json',JSON.stringify({base,passed:results.every(x=>x.passed),realApi:true,physicalDeviceTest:false,results},null,2));if(results.some(x=>!x.passed))process.exitCode=1;
