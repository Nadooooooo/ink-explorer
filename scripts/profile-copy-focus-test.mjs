import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';

const base=process.env.BASE_URL||'http://127.0.0.1:4488';
const output=process.env.PROFILE_COPY_OUTPUT||'reports/profile-copy-focus';
const address='0xcccccccccccccccccccccccccccccccccccccccc',results=[];
await mkdir(output,{recursive:true});
const save=complete=>writeFile(output+'/results.json',JSON.stringify({base,complete,passed:complete&&results.length===36&&results.every(row=>row.passed),physicalDeviceTest:false,apiMocked:true,results},null,2));
for(const [engine,launcher]of Object.entries({chromium,firefox,webkit})){
 const browser=await launcher.launch(engine==='chromium'?{args:['--no-sandbox']}:{});
 try{for(const prefix of ['','/testnet'])for(const mode of ['native','fallback','denied'])for(const transition of ['ready','error']){
  const chainId=prefix?763373:57073,row={engine,chainId,mode,transition,passed:false};
  const context=await browser.newContext({viewport:{width:320,height:844}}),page=await context.newPage();
  let release;const gate=new Promise(resolve=>release=resolve);
  await context.addInitScript(mode=>{
   window.copiedValue=null;
   Object.defineProperty(navigator,'clipboard',{value:{async writeText(value){if(mode!=='native')throw Error('Controlled clipboard denial');window.copiedValue=value;}}});
   document.execCommand=command=>{if(command==='copy'&&mode==='fallback'){window.copiedValue=document.activeElement.value;return true;}return false;};
  },mode);
  await context.routeWebSocket(/\/api\/live$/,socket=>socket.close());
  await context.route('**/api/**',async route=>{
   const path=new URL(route.request().url()).pathname,profile=path===`${prefix}/api/explorer/addresses/${address}`;
   if(profile)await gate;
   const headers={date:new Date().toUTCString(),'x-ink-data-status':'fresh','x-ink-data-fetched-at':new Date().toISOString()};
   try{
    if(profile&&transition==='error')return await route.fulfill({status:503,json:{error:'Controlled profile failure'},headers:{...headers,'retry-after':'1'}});
    const json=profile?{hash:address,is_contract:false,chain_id:chainId}:path.endsWith('/token-balances')?[]:path.endsWith('/counters')?{}:{items:[],next_page_params:null};
    await route.fulfill({json,headers});
   }catch{/* A disposed StrictMode request may already have been aborted. */}
  });
  try{
   await page.goto(`${base}${prefix}/address/${address}?lang=fr`);
   const button=page.locator('.detail-header .copy-button').first();await button.waitFor();
   const originalButton=await button.elementHandle();await button.focus();await page.keyboard.press('Enter');
   await page.locator(mode==='denied'?'.copy-fallback input':'.copy-button.copied').waitFor();
   const originalInput=mode==='denied'?await page.locator('.copy-fallback input').elementHandle():null;
   assert(await page.locator('.record-arrival-loading').isVisible(),'The copy must precede the held profile response');
   release();
   await page.locator(transition==='ready'?'.address-page .section-navigation':'.address-page > .error-state').waitFor();
   assert(await originalButton.evaluate(element=>element.isConnected),'Profile transition must preserve the original copy control');
   if(mode==='denied'){
    assert(await originalInput.evaluate(element=>element.isConnected&&element===document.activeElement&&element.value==='0xcccccccccccccccccccccccccccccccccccccccc'&&element.readOnly&&element.selectionStart===0&&element.selectionEnd===element.value.length),'Manual copy and its exact selection must survive the profile transition');
    assert.equal(await button.getAttribute('class'),'copy-button','Denied copies must never announce success');
   }else{
    assert.equal(await page.evaluate(()=>window.copiedValue),address,'Clipboard receives the complete address');
    assert(await originalButton.evaluate(element=>element===document.activeElement),'Keyboard copy focus survives the profile transition');
   }
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   row.passed=true;row.originalControlRetained=true;row.focusRetained=true;
  }catch(error){row.error=error.stack;await page.screenshot({path:`${output}/failure-${engine}-${chainId}-${mode}-${transition}.png`}).catch(()=>{});}
  finally{release();await context.close();}
  results.push(row);await save(false);console.log(`${row.passed?'PASS':'FAIL'} ${engine} ${chainId} ${mode} profile-${transition}`);
 }}finally{await browser.close();}
}
await save(true);assert.equal(results.length,36);assert(results.every(row=>row.passed),JSON.stringify(results.filter(row=>!row.passed),null,2));
console.log('All36 copy-focus profile transitions passed.');
