import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright-core';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4324',out=process.env.DIRECTORY_OUTPUT||'reports/directory-history/browser';await mkdir(out,{recursive:true});
const hash=n=>'0x'+n.toString(16).padStart(64,'0'),address=n=>'0x'+n.toString(16).padStart(40,'0');
const operation=(page,i)=>({hash:hash(page*100+i),address:{hash:address(1),is_contract:true,is_verified:true,proxy_type:'eip1967'},transaction_hash:hash(9),status:i===0?true:i===1?false:null,fee:'123456789012345678901',timestamp:'2026-10-22T00:00:00Z',entry_point_version:'v0.8'});
const contract=(page,i)=>({address:{hash:address(page*100+i),name:'Contract '+page+' / '+i,is_contract:true,is_verified:true},language:i===0?undefined:'solidity',compiler_version:'v0.8.20'});
const results=[],axe=await readFile('node_modules/axe-core/axe.min.js','utf8');
for(const [engine,launcher]of Object.entries({chromium,firefox,webkit}).filter(([name])=>!process.env.DIRECTORY_ENGINES||process.env.DIRECTORY_ENGINES.split(',').includes(name))){
 const browser=await launcher.launch(engine==='chromium'?{args:['--no-sandbox']}:{});
 try{for(const prefix of['','/testnet'])for(const width of[320,1440]){
  const locale=width===320?'fr':'ar',context=await browser.newContext({viewport:{width,height:900},colorScheme:prefix?'light':'dark'}),page=await context.newPage();page.setDefaultTimeout(15000);
  const result={engine,prefix,width,locale,passed:false},errors=[],requests=[];let failure=false,malformed=false,empty=false,hold=false,release;
  page.on('pageerror',e=>errors.push(e.message));await context.routeWebSocket(/\/api\/live$/,ws=>ws.close());await context.route(/\/api\/live\/snapshot/,route=>route.fulfill({status:503,json:{error:'Unavailable'}}));
  await context.route(/\/api\/explorer\/(smart-contracts|proxy\/account-abstraction\/operations|optimism\/deposits|optimism\/withdrawals)(?:\?|$)/,async route=>{
   const u=new URL(route.request().url()),contracts=u.pathname.endsWith('smart-contracts'),cursor=u.searchParams.get('page_token')||u.searchParams.get('smart_contract_id')||'',index=cursor.startsWith('2')?2:cursor.startsWith('3')?3:1;
   requests.push({path:u.pathname,cursor});if(hold&&index===2)await new Promise(resolve=>release=resolve);
   if(failure&&index===3)return route.fulfill({status:503,json:{error:'Page unavailable'}});
   if(malformed)return route.fulfill({json:{items:'invalid'}});
   const next=contracts?{smart_contract_id:String(index+1)}:{page_size:50,page_token:`${index+1},opaque%:/+`};
   return route.fulfill({headers:{'x-ink-data-status':'fresh'},json:{items:empty?[]:Array.from({length:3},(_,i)=>contracts?contract(index,i):operation(index,i)),next_page_params:index===3?null:next}}).catch(()=>{});
  });
  try{for(const route of['contracts','ops']){
   failure=false;empty=false;malformed=false;
   await page.goto(base+prefix+'/'+route+'?lang='+locale,{waitUntil:'domcontentloaded'});
   const top=page.locator('.directory-controls .ledger-top-pagination'),bottom=page.locator('.directory-page .pagination'),rows=page.locator(route==='contracts'?'.contract-card':'.protocol-row');
   const ready=async index=>{const link=route==='contracts'?`/address/${address(index*100)}`:`/op/${hash(index*100)}`;await page.locator(`.directory-page a[href*="${link}"]`).first().waitFor();};
   await ready(1);const start=requests.length;
   assert(await top.locator('button').nth(1).isDisabled());
   if(route==='ops'){
    assert.equal(await page.locator('.protocol-note,.operations-directory .section-navigation,.operations-directory .explorer-tools').count(),0);
    assert.equal(await rows.locator('.directory-status.completed').count(),1);assert.equal(await rows.locator('.directory-status.failed').count(),1);assert.equal(await rows.nth(2).locator('.directory-status').innerText(),'N/A');
    assert.match(await rows.first().locator('strong').getAttribute('title'),/123/);
   }else assert.match(await rows.first().locator('footer').innerText(),/N\/A/);
   hold=true;await top.locator('button').nth(2).click();await page.waitForFunction(()=>[...document.querySelectorAll('.directory-controls .ledger-top-pagination button')].every(button=>button.disabled));while(!release)await new Promise(resolve=>setTimeout(resolve,5));release();release=undefined;hold=false;await ready(2);
   await top.locator('button').nth(2).click();await ready(3);assert(await top.locator('button').nth(2).isDisabled());
   await top.locator('button').nth(1).click();await ready(2);await bottom.locator('button').nth(1).click();await ready(1);
   const cursors=requests.slice(start).map(item=>item.cursor);assert.deepEqual(cursors,route==='contracts'?['2','3','2','']:['2,opaque%:/+','3,opaque%:/+','2,opaque%:/+','']);
   await top.locator('button').nth(2).click();await ready(2);failure=true;await top.locator('button').nth(2).click();await page.locator('.directory-page [role="alert"]').waitFor();assert.equal(await rows.count(),0);assert(await top.locator('button').nth(1).isEnabled());
   failure=false;await page.locator('.directory-page .error-state button').click();await ready(3);await bottom.locator('button').nth(0).click();await ready(1);
   malformed=true;await top.locator('button').nth(2).click();await page.locator('.directory-page [role="alert"]').waitFor();malformed=false;await top.locator('button').nth(1).click();await ready(1);
   empty=true;await top.locator('button').nth(2).click();await page.locator('.directory-page .empty').waitFor();assert(await top.locator('button').nth(1).isEnabled());assert(await top.locator('button').nth(2).isEnabled());empty=false;await top.locator('button').nth(1).click();await ready(1);
   assert.equal(await page.locator('h1').count(),1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   const buttons=await page.locator('.directory-page .ledger-top-pagination button').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return {x:r.x,right:r.right,w:r.width,h:r.height};}));assert(buttons.every(r=>r.x>=-1&&r.right<=width+1&&r.w>=44&&r.h>=44),JSON.stringify(buttons));
   if(route==='ops'){
    const view=page.locator('.user-operation-ledger');await view.evaluate(node=>node.scrollLeft=document.dir==='rtl'?-500:500);const link=rows.first().locator('a[href*="/tx/"]');await link.focus();const b=await link.boundingBox(),v=await view.boundingBox();assert(b.x>=v.x-1&&b.x+b.width<=v.x+v.width+1);await view.evaluate(node=>node.scrollLeft=0);
   }
   await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`${out}/${engine}-${prefix?'sepolia':'mainnet'}-${width}-${route}.png`});await page.evaluate(axe);const violations=await page.evaluate(async()=>(await axe.run('.directory-page',{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})));assert.deepEqual(violations,[]);
  }
  // Switching the legacy Advanced section while a later page is pending must cancel its response.
  await page.goto(base+prefix+'/advanced?tab=userops&lang='+locale,{waitUntil:'domcontentloaded'});await page.locator('.protocol-row').first().waitFor();hold=true;await page.locator('.directory-controls .ledger-top-pagination button').nth(2).click();while(!release)await new Promise(resolve=>setTimeout(resolve,5));
  if(width===320)await page.locator('.section-picker select').selectOption('withdrawals');else await page.locator('.section-navigation .tabs button').nth(1).click();
  release();release=undefined;hold=false;await page.locator('.protocol-row').first().waitFor();assert.equal(await page.locator('.user-operation-ledger').count(),0);assert(await page.locator('.directory-controls .ledger-top-pagination button').nth(1).isDisabled());assert.equal(new URL(page.url()).searchParams.get('tab'),'withdrawals');
  await page.reload();await page.locator('.protocol-row').first().waitFor();assert.equal(await page.locator('.user-operation-ledger').count(),0);
  assert.deepEqual(errors,[]);assert(requests.every(item=>item.path.startsWith(prefix+'/api/')));result.passed=true;
  }catch(error){result.error=error.stack;await page.screenshot({path:`${out}/failure-${engine}-${prefix?'sepolia':'mainnet'}-${width}.png`}).catch(()=>{});}
  console.log(JSON.stringify(result));results.push(result);await context.close();
 }}finally{await browser.close();}
}
await writeFile(out+'/results.json',JSON.stringify({base,complete:true,passed:results.every(row=>row.passed),results},null,2));if(results.some(row=>!row.passed))process.exitCode=1;
