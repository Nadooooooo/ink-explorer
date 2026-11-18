import assert from 'node:assert/strict';
import * as playwright from 'playwright';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4310',out=process.env.ACTIVITY_CONTROLS_OUTPUT||'reports/activity-controls/browser';
const sources=JSON.parse(await readFile(process.env.ACTIVITY_SOURCES||'reports/activity-controls/sources.json'));
const axe=await readFile('node_modules/axe-core/axe.min.js','utf8'),results=[];
const address=n=>'0x'+n.toString(16).padStart(40,'0'),hash=n=>'0x'+n.toString(16).padStart(64,'0');
const touch=process.env.ACTIVITY_TOUCH!=='0';
await mkdir(out,{recursive:true});
for(const engine of(process.env.ACTIVITY_ENGINES||'chromium,firefox,webkit').split(',')){
 const browser=await playwright[engine].launch(engine==='chromium'?{args:['--no-sandbox']}:{});
 try{for(const prefix of(process.env.ACTIVITY_MAIN_ONLY==='1'?['']:['','/testnet']))for(const width of(process.env.ACTIVITY_WIDTHS||'320,768,1024,1440').split(',').map(Number)){
  const locale=process.env.ACTIVITY_LOCALE||(width===768?'ar':'fr'),source=sources[prefix?'sepolia':'mainnet'];
  const from={hash:address(1),is_contract:false},to={hash:address(2),is_contract:true,is_verified:true,proxy_type:'eip1967',name:'Ink community router with a long readable contract name'};
  const tx={...source.transaction,hash:hash(10),from,to,method:'transfer',status:'error',timestamp:new Date(Date.now()-60000).toISOString(),transaction_types:['contract_call']};
  const tx2={...tx,hash:hash(11),status:'ok',from:to,to:from,method:'swapExactTokensForTokens'};
  const block={...source.block,miner:to};
  const transfer={transaction_hash:tx.hash,from,to,timestamp:tx.timestamp,method:'transfer',total:{value:'123456789',decimals:'6'},token:{address_hash:address(3),name:'Community token',symbol:'INK',decimals:'6',type:'ERC-20'}};
  const log={address:to,transaction_hash:tx.hash,index:0,topics:[hash(4)],data:'0x',decoded:{method_call:'Transfer(address from, address to, uint256 value)',parameters:[{name:'from',type:'address',value:from.hash}]}};
  const state={address:to,type:'coin',change:'1000000000000000000',balance_before:'0',balance_after:'1000000000000000000'};
  const routes=[['transactions','/txs','.tx-row'],['blocks','/blocks','.block-row'],['transfers','/tx/'+tx.hash+'?tab=transfers','.generic-row'],['logs','/tx/'+tx.hash+'?tab=logs','.event-log'],['state','/tx/'+tx.hash+'?tab=state','.state-row']].filter(([name])=>!process.env.ACTIVITY_ROUTES||process.env.ACTIVITY_ROUTES.split(',').includes(name));
  for(const[name,path,selector]of routes){
   const context=await browser.newContext({viewport:{width,height:1000},hasTouch:touch,colorScheme:width===768?'dark':'light',bypassCSP:true}),page=await context.newPage(),row={engine,prefix,width,locale,touch,name,passed:false},errors=[];
   page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
   await context.routeWebSocket(/\/api\/live$/,socket=>socket.close());
   await page.route('**/api/live/snapshot',r=>r.fulfill({status:503,json:{error:'Controlled unavailable live feed'}}));
   await page.addInitScript(()=>{window.copies=[];window.rejectCopy=false;Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{if(window.rejectCopy)throw Error('Denied');window.copies.push(value)}}});document.execCommand=()=>false;});
   await page.route(/\/api\/explorer\/(transactions|blocks)(?:\/|\?|$)/,async route=>{
    const url=new URL(route.request().url()),part=url.pathname.split('/api/explorer/')[1];
    const data=part==='transactions'?{items:[tx,tx2],next_page_params:null}:part==='blocks'?{items:[block],next_page_params:null}:part==='transactions/'+tx.hash?tx:part.endsWith('/token-transfers')?{items:[transfer]}:part.endsWith('/logs')?{items:[log]}:part.endsWith('/state-changes')?{items:[state]}:null;
    if(data)return route.fulfill({json:data});return route.continue();
   });
   try{
    await page.goto(base+prefix+path+(path.includes('?')?'&':'?')+'lang='+locale,{waitUntil:'domcontentloaded'});
    const record=page.locator(selector).first();await record.waitFor();await page.evaluate(()=>document.fonts.ready);const before=page.url();
    const buttons=record.locator('.copy-button:visible');assert(await buttons.count()>0);row.targets=[];
    for(const button of await buttons.all()){
     await button.evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));
     const geometry=await button.evaluate(e=>{const r=e.getBoundingClientRect(),text=e.parentElement.querySelector('.mono'),b=text.getBoundingClientRect(),inside=(x,y)=>document.elementFromPoint(x,y)?.closest('button')===e;return{width:r.width,height:r.height,expected:text.title||text.textContent,overlap:Math.min(r.right,b.right)-Math.max(r.left,b.left)>1&&Math.min(r.bottom,b.bottom)-Math.max(r.top,b.top)>1,edgeHits:[[r.left+2,r.top+r.height/2],[r.right-2,r.top+r.height/2],[r.left+r.width/2,r.top+2],[r.left+r.width/2,r.bottom-2]].every(([x,y])=>inside(x,y))}});
     const minimum=touch||width<=760||name==='transactions'&&width<=1100?44:24;
     assert(geometry.width>=minimum-.1&&geometry.height>=minimum-.1,'Copy target is too small');row.targets.push(geometry);assert(!geometry.overlap&&geometry.edgeHits,'Copy target overlaps or cannot be hit near its edges');
     const box=await button.boundingBox();if(touch)await page.touchscreen.tap(box.x+2,box.y+box.height/2);else await button.click({position:{x:2,y:box.height/2}});
     await page.waitForFunction(expected=>window.copies.at(-1)===expected,geometry.expected);assert.equal(page.url(),before,'Copy must not follow the neighboring link');
    }
    const first=buttons.first(),expected=row.targets[0].expected;await page.evaluate(()=>window.rejectCopy=true);await first.click();const fallback=first.locator('..').locator('.copy-fallback input');await fallback.waitFor();assert.equal(await fallback.inputValue(),expected);assert(await fallback.evaluate(e=>document.activeElement===e&&e.selectionStart===0&&e.selectionEnd===e.value.length));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.evaluate(()=>window.rejectCopy=false);await first.click();await fallback.waitFor({state:'hidden'});assert.equal(page.url(),before);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    const bounds=await record.boundingBox();row.recordHeight=bounds.height;row.childrenInside=await record.evaluate(e=>{const r=e.getBoundingClientRect();return[...e.children].every(child=>{const b=child.getBoundingClientRect();return !b.width||(b.left>=r.left-1&&b.right<=r.right+1)})});assert(row.childrenInside,'A field escapes its record');
    if(name==='transactions'){const parties=record.locator('.flow-party');assert.equal(await parties.count(),2);assert((await parties.last().locator('.text-link').innerText()).includes(to.name));if(width<=480)assert((await parties.nth(1).boundingBox()).y>=(await parties.first().boundingBox()).y+(await parties.first().boundingBox()).height-1);}
    if(name==='logs'){const dictionary=JSON.parse(await readFile('src/locales/'+locale+'.json'));assert.equal(await record.locator('.event-raw summary').innerText(),dictionary['Raw log data']||'Raw log data');await record.locator('.text-link').first().hover();}
    await page.evaluate(axe);row.violations=await page.evaluate(async()=>(await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})));assert.deepEqual(row.violations,[]);assert.deepEqual(errors,[]);
    await record.scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/${engine}-${prefix?'sepolia':'mainnet'}-${width}-${name}.png`});row.passed=true;
   }catch(error){row.error=error.stack;await page.screenshot({path:`${out}/failure-${engine}-${prefix?'sepolia':'mainnet'}-${width}-${name}.png`}).catch(()=>{});}finally{await context.close();}
   results.push(row);console.log(JSON.stringify({engine,prefix,width,locale,name,passed:row.passed,error:row.error}));await writeFile(out+'/results.json',JSON.stringify({base,complete:false,results},null,2));
  }
 }}finally{await browser.close();}
}
await writeFile(out+'/results.json',JSON.stringify({base,complete:true,passed:results.every(r=>r.passed),mockedClipboard:true,mockedApi:true,physicalDeviceTest:false,results},null,2));if(results.some(r=>!r.passed))process.exitCode=1;
