import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4311',out=process.env.LEDGER_TOUCH_OUTPUT||'reports/ledger-placement/touch';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({args:['--no-sandbox']}),results=[];
try { for(const prefix of ['', '/testnet']) for(const route of ['internal-txs','deposits','withdrawals','accounts','token-transfers']) {
 const c=await browser.newContext({viewport:{width:390,height:900},isMobile:true,hasTouch:true,colorScheme:'dark',acceptDownloads:true}),p=await c.newPage(),r={prefix,route,passed:false},errors=[];
 p.on('pageerror',e=>errors.push(e.message));
 try {
  await p.goto(base+prefix+'/'+route+'?lang=en',{waitUntil:'domcontentloaded'});
  const rows=p.locator('.ledger-record,.transfer-record'),view=p.locator('.ledger-scroll');
  await rows.first().waitFor({timeout:45000});await p.evaluate(()=>document.fonts.ready);
  r.firstRow=await rows.first().boundingBox();
  assert(r.firstRow.height<190,'First real row unexpectedly tall');
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await p.screenshot({path:`${out}/${prefix?'sepolia':'mainnet'}-${route}.png`});
  const cd=await c.newCDPSession(p),y=(await view.boundingBox()).y+90;
  await cd.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:340,y}]});
  for(let x=320;x>=80;x-=20){await cd.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y}]});await p.waitForTimeout(20);}
  await cd.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await p.waitForTimeout(300);
  r.scroll=await view.evaluate(e=>e.scrollLeft);assert(r.scroll>150,'Native touch failed to scroll table');
  await p.screenshot({path:`${out}/${prefix?'sepolia':'mainnet'}-${route}-swipe.png`});
  await view.evaluate(e=>e.scrollLeft=0);
  // Traverse links with real Tab events: each focused action must be inside its viewport.
  await view.focus();let checked=0;
  for(let i=0;i<14;i++){
   await p.keyboard.press('Tab');
   const focus=await p.evaluate(()=>{const e=document.activeElement,v=document.querySelector('.ledger-scroll');if(!v.contains(e))return null;const b=e.getBoundingClientRect(),vb=v.getBoundingClientRect();return{inside:b.left>=vb.left-1&&b.right<=vb.right+1,width:b.width};});
   if(!focus)break;assert(focus.inside,'Focused action clipped by table viewport');checked++;
  }
  assert(checked>=3,'Too few keyboard actions');r.keyboardActions=checked;
  const download=p.waitForEvent('download');await p.locator('.transfer-export').click();await(await download).saveAs(`${out}/${prefix?'sepolia':'mainnet'}-${route}.csv`);
  // Check a local transaction/account link without assuming external L1 order.
  const local=rows.first().locator('a[href^="'+(prefix||'')+'/tx/"],a[href^="'+(prefix||'')+'/address/"]').first();
  const href=await local.getAttribute('href');await local.click();await p.waitForURL(u=>u.pathname===new URL(href,base).pathname);await p.locator('.detail-header').waitFor({timeout:30000});
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);r.passed=true;
 }catch(e){r.error=e.stack;await p.screenshot({path:`${out}/failure-${prefix?'sepolia':'mainnet'}-${route}.png`}).catch(()=>{});}
 finally{await c.close();}
 results.push(r);console.log(JSON.stringify(r));await writeFile(out+'/results.json',JSON.stringify({base,complete:false,results},null,2));
}}finally{await browser.close();}
await writeFile(out+'/results.json',JSON.stringify({base,complete:true,passed:results.every(r=>r.passed),realApi:true,physicalDevices:false,results},null,2));if(results.some(r=>!r.passed))process.exitCode=1;
