import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4325',output=process.env.TOKEN_FILTER_BROWSER_OUTPUT||'reports/token-filter/browser';
await mkdir(output,{recursive:true});const results=[];
for(const [engine,launcher] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await launcher.launch(engine==='chromium'?{args:['--no-sandbox']}:{});
 try{for(const prefix of ['','/testnet'])for(const [index,type] of ['ERC-20','ERC-721','ERC-1155'].entries()){
  const width=(engine==='chromium')===(index===0)?1440:320,page=await browser.newPage({viewport:{width,height:900},colorScheme:width===320?'light':'dark'}),row={engine,prefix,type,width,passed:false},errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(65000);
  try{
   const endpoint=prefix+'/api/v1/transactions',fetching=page.waitForResponse(r=>new URL(r.url()).pathname===endpoint);
   await page.goto(base+prefix+'/txs?'+new URLSearchParams({transaction_types:type,age_to:'2026-10-22T08:00:00Z',lang:'fr'}),{waitUntil:'domcontentloaded'});
   const response=await fetching;assert.equal(response.status(),200);const body=await response.json();assert(body.items.length>0);assert.equal(body.meta.chainId,prefix?763373:57073);const expected=JSON.parse(await readFile(`reports/token-filter/real-complete/${prefix?763373:57073}-${type}-1-api.json`,'utf8'));assert.deepEqual(body.items.map(x=>x.hash),expected.items.map(x=>x.hash));assert.deepEqual(body.next_page_params,expected.next_page_params);
   await page.locator('.filtered-activity .table-shell[aria-busy="false"]').waitFor();
   const hashes=await page.locator('.filtered-activity .tx-primary a[href*="/tx/"]').evaluateAll(nodes=>nodes.map(node=>new URL(node.href).pathname.split('/').at(-1)));
   assert.deepEqual(hashes,body.items.map(x=>x.hash));assert.equal(new Set(hashes).size,hashes.length);
   assert.equal(await page.locator('main [role="alert"]').count(),0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   const dl=page.waitForEvent('download');await page.locator('.filtered-activity .table-toolbar button').filter({hasText:'CSV'}).click();const csv=await readFile(await(await dl).path(),'utf8');assert.equal(csv.trim().split(/\r?\n/).length,body.items.length+1);for(const hash of hashes)assert(csv.includes(hash));
   await page.screenshot({path:`${output}/${engine}-${prefix?'sepolia':'mainnet'}-${type}-${width}.png`});
   await page.locator('.filtered-activity .tx-primary a[href*="/tx/"]').first().click();await page.waitForURL(url=>url.pathname===prefix+'/tx/'+hashes[0]);await page.locator('.detail-header').waitFor();assert.deepEqual(errors,[]);
   row.rows=hashes.length;row.csvVerified=true;row.passed=true;
  }catch(error){row.error=error.stack;await page.screenshot({path:`${output}/failure-${engine}-${prefix?'sepolia':'mainnet'}-${type}.png`}).catch(()=>{});}
  results.push(row);console.log(JSON.stringify(row));await page.close();await writeFile(output+'/results.json',JSON.stringify({base,complete:false,results},null,2));
 }}finally{await browser.close();}
}
await writeFile(output+'/results.json',JSON.stringify({base,complete:true,passed:results.every(x=>x.passed),realApi:true,physicalDeviceTest:false,results},null,2));if(results.some(x=>!x.passed))process.exitCode=1;
