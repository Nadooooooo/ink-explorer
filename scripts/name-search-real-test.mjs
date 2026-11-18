import {chromium,webkit} from 'playwright-core';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4322',out=process.env.NAMES_REAL_OUTPUT||'reports/name-search/real-final',results=[];await mkdir(out,{recursive:true});
for(const[engine,launcher,widths]of[['chromium',chromium,[390,1440]],['webkit',webkit,[390]]]){
 const b=await launcher.launch(engine==='chromium'?{args:['--no-sandbox']}:{});
 try{for(const prefix of['','/testnet'])for(const width of widths){
  const p=await b.newPage({viewport:{width,height:950},colorScheme:'dark'}),requests=[],responses=[],row={engine,prefix,width,passed:false};
  p.on('request',r=>{if(/\/names\/(domains|addresses):lookup/.test(r.url()))requests.push(r.url());});
  p.on('response',r=>{if(/\/names\/(domains|addresses):lookup/.test(r.url()))responses.push(r.status());});
  try{
   await p.goto(base+prefix+'/name-services?lang=fr',{waitUntil:'domcontentloaded'});
   const input=p.locator('.explorer-search input');await input.waitFor();await p.locator('.explorer-search select option[value="ens"]').waitFor({state:'attached'});
   assert.equal(requests.length,0);assert.equal(await p.locator('main [role="alert"]').count(),0);await p.screenshot({path:`${out}/${engine}-${prefix?'sepolia':'mainnet'}-${width}-initial.png`});
   await input.fill('vitalik.eth');await input.press('Enter');await p.locator('.explorer-list .explorer-record').first().waitFor({timeout:30000});
   assert(responses.every(s=>s===200));assert(requests.every(url=>new URL(url).searchParams.get('name')==='vitalik.eth'));row.results=await p.locator('.explorer-record-heading').allTextContents();
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await p.screenshot({path:`${out}/${engine}-${prefix?'sepolia':'mainnet'}-${width}-result.png`});
   await input.fill('');assert.equal(await p.locator('.explorer-list').count(),0);assert.equal(await p.locator('main [role="alert"]').count(),0);row.passed=true;
  }catch(e){row.error=e.stack;row.responses=responses;}
  results.push(row);console.log(JSON.stringify(row));await p.close();
 }}finally{await b.close();}
}
await writeFile(out+'/results.json',JSON.stringify({base,complete:true,passed:results.every(r=>r.passed),realApi:true,physicalDeviceTest:false,results},null,2));if(results.some(r=>!r.passed))process.exitCode=1;
