import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4317',out=process.env.INVENTORY_LAYOUT_OUTPUT||'reports/account-inventory/layout',large=process.env.INVENTORY_FONT_MIN==='24',results=[];
const account='0x'+'a'.repeat(40),token='0x'+'b'.repeat(40),locales=large?['en','fr','ar']:['en','fr','ar','zh','hi','bn','es','pt','ru','ja'];
await mkdir(out,{recursive:true});const browser=await(large?firefox:process.env.INVENTORY_LAYOUT_ENGINE==='webkit'?webkit:chromium).launch(large?{firefoxUserPrefs:{'font.minimum-size.x-western':24}}:process.env.INVENTORY_LAYOUT_ENGINE==='webkit'?{}:{args:['--no-sandbox']});
try{for(const locale of locales)for(const width of large?[320,390]:[320,390,768,1440]){
 const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage(),row={locale,width,large,passed:false},errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await context.routeWebSocket(/\/api\/live$/,ws=>ws.close());
 await context.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname,headers={date:new Date().toUTCString(),'x-ink-data-status':'fresh','x-ink-data-fetched-at':new Date().toISOString()};
  if(path.endsWith('/nft'))return route.fulfill({headers,json:{items:Array.from({length:8},(_,id)=>({id,value:id===1?'9007199254740993':'1',owner:{hash:account,name:'Community vault'},token:{address_hash:token,name:'Ink collection · '+id,type:'ERC-1155'}})),next_page_params:null}});
  if(path.endsWith('/token-balances'))return route.fulfill({headers,json:[]});if(path.endsWith('/counters'))return route.fulfill({headers,json:{transactions_count:'1',token_transfers_count:'0'}});
  if(path.endsWith(account))return route.fulfill({headers,json:{hash:account,is_contract:false,coin_balance:'0'}});
  return route.fulfill({status:503,json:{error:'Controlled unrelated source'}});
 });
 try{
  await page.goto(`${base}/address/${account}?tab=nft&lang=${locale}`,{waitUntil:'domcontentloaded'});await page.locator('.nft-item').nth(7).waitFor();await page.evaluate(()=>document.fonts.ready);
  const geometry=await page.evaluate(()=>{
   const clipped=[...document.querySelectorAll('.account-inventory .nft-item > span,.account-inventory .nft-placeholder small:not(.sr-only)')].filter(el=>el.scrollWidth>el.clientWidth+1||el.scrollHeight>el.clientHeight+1).map(el=>el.textContent);
   const cards=[...document.querySelectorAll('.nft-item')].map(el=>el.getBoundingClientRect().toJSON());
   return{clipped,cards,overflow:document.documentElement.scrollWidth-innerWidth};
  });
  assert.equal(await page.locator('.nft-placeholder[title] .sr-only').count(),8,'Missing image status remains accessible');assert.deepEqual(geometry.clipped,[]);assert(geometry.overflow<=1);assert(geometry.cards.every(c=>c.width<=321&&c.width>140));
  for(let i=0;i<geometry.cards.length;i++)for(let j=i+1;j<geometry.cards.length;j++){const a=geometry.cards[i],b=geometry.cards[j];assert(a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top,'Cards overlap');}
  assert.deepEqual(errors,[]);await page.locator('.account-inventory').scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/${locale}-${width}.png`});row.passed=true;row.cardWidths=geometry.cards.map(c=>c.width);
 }catch(error){row.error=error.stack;await page.screenshot({path:`${out}/failure-${locale}-${width}.png`}).catch(()=>{});}finally{await context.close();}
 results.push(row);console.log(JSON.stringify(row));await writeFile(`${out}/results.json`,JSON.stringify({base,complete:false,results},null,2));
}}finally{await browser.close();}
await writeFile(`${out}/results.json`,JSON.stringify({base,complete:true,passed:results.every(row=>row.passed),mockedApi:true,physicalDeviceTest:false,results},null,2));if(results.some(row=>!row.passed))process.exitCode=1;
