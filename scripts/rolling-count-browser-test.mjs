import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import axe from 'axe-core';
const base=process.env.BASE_URL||'http://127.0.0.1:4214',out=process.env.ROLLING_BROWSER_OUTPUT||'reports/rolling-metrics/browser',results=[];
await mkdir(out,{recursive:true});
const hash=c=>'0x'+c.repeat(64);
for(const engine of [chromium,firefox,webkit].filter(engine=>!process.env.ROLLING_ENGINES||process.env.ROLLING_ENGINES.split(',').includes(engine.name()))){
 const browser=await engine.launch(engine===chromium?{args:['--no-sandbox']}:{});
 try{for(const [prefix,chainId] of [['',57073],['/testnet',763373]].filter(([p])=>!process.env.ROLLING_PREFIX||p===process.env.ROLLING_PREFIX))for(const [width,locale] of [[320,'fr'],[1440,'ar']].filter(([w])=>!process.env.ROLLING_WIDTH||String(w)===process.env.ROLLING_WIDTH))for(const path of ['/','/txs','/stats'].filter(p=>!process.env.ROLLING_PATH||p===process.env.ROLLING_PATH)){
  const c=await browser.newContext({viewport:{width,height:900},bypassCSP:true,...(process.env.INK_RELEASE_VERSION?{extraHTTPHeaders:{'Cloudflare-Workers-Version-Overrides':`inkexplorer="${process.env.INK_RELEASE_VERSION}"`}}:{})}),p=await c.newPage(),errors=[],row={engine:engine.name(),prefix,width,locale,path};p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(10000);
  let now=Date.now(),height=100000,branch='a',count=10000,sequence=0,socket,failIndexer=false,chartReads=0,counterReads=0;
  const makeFrame=()=>{
   const sentAt=new Date(now).toISOString(),block={height,hash:hash(branch),timestamp:sentAt,gas_used:'1500000',gas_limit:'30000000',gas_used_percentage:5,transactions_count:0};
   return {type:'snapshot',protocol:'ink-observer.live.v1',sequence:++sequence,sentAt,network:{online:true,synced:true,stale:false,chainId,expectedChainId:chainId,head:height},block,blocks:[block],transactions:[],rolling24h:{status:'ready',source:'local-canonical-window',chainId,sampledAt:sentAt,transactions:count,unknownFees:count,missingReceipts:count,feeWei:null,window:{from:new Date(now-86400000).toISOString(),to:sentAt,seconds:86400,startExclusive:true,endInclusive:true,fromBlock:height-86399,toBlock:height,toBlockHash:hash(branch),boundaryBlock:height-86400,boundaryHash:hash('f'),blocks:86400}}};
  };
  let frame=makeFrame();
  await c.routeWebSocket(/\/api\/live$/,ws=>{socket=ws;ws.send(JSON.stringify(frame));});
  await c.route('**/api/**',route=>{
   const pathname=new URL(route.request().url()).pathname.replace(/^\/testnet/,'');
   const headers={date:new Date(now).toUTCString(),'x-ink-data-status':'fresh','x-ink-data-fetched-at':new Date(now).toISOString()};
   if(pathname==='/api/live/config')return route.fulfill({json:{url:base.replace(/^http/,'ws')+prefix+'/api/live'}});
   if(pathname==='/api/live/snapshot')return route.fulfill({json:frame});
   if(pathname==='/api/stats/counters'){counterReads++;return route.fulfill(failIndexer?{status:503,json:{error:'Data source unavailable'}}:{headers,json:{counters:[{id:'newTxns24h',title:'Transactions (24h)',description:'Indexer fixture',value:'42'},{id:'txnsFee24h',title:'Transaction fees · 24h',description:'Indexer fee fixture',units:'ETH',value:'0.1'}]}});}
   if(pathname==='/api/stats/lines')return route.fulfill({headers,json:{sections:[{id:'transactions',title:'Transactions',charts:[{id:'newTxns',title:'New transactions',description:'Transactions',resolutions:['DAY']}]}]}});
   if(pathname.startsWith('/api/stats/lines/')){chartReads++;return route.fulfill({headers,json:{chart:[{date:new Date(now-86400000).toISOString().slice(0,10),value:'1'}]}});}
   if(pathname==='/api/overview')return route.fulfill({headers,json:{stats:{total_addresses:'100'},blocks:[],transactions:[],chart:[]}});
   return route.fulfill({headers,json:{items:[]}});
  });
  const value=p.locator('[data-counter="newTxns24h"] strong');
  const wait=async n=>{if(n===null)await p.waitForFunction(()=>document.querySelector('[data-counter="newTxns24h"] strong')?.textContent==='N/A');else await p.waitForFunction(n=>document.querySelector('[data-counter="newTxns24h"] strong')?.getAttribute('title')===String(n),n);};
  const send=async change=>{frame=makeFrame();change?.(frame);socket.send(JSON.stringify(frame));};
  try{
   await p.clock.install({time:new Date(now)});await p.goto(base+prefix+path+'?lang='+locale);await wait(10000);await p.waitForTimeout(100);now=(await p.evaluate(()=>Date.now()))+1000;await p.clock.pauseAt(new Date(now));await send();await wait(10000);
   const before={chartReads,counterReads};height++;count=11000;await send();await wait(11000);assert.deepEqual({chartReads,counterReads},before,'New blocks must not refetch charts/counters');
   branch='b';height--;count=9000;await send(f=>f.rolling24h.window.toBlockHash=hash('a'));await wait(null);await send();await wait(9000);
   await send(f=>f.rolling24h.sampledAt=new Date(now-5001).toISOString());await wait(null);await send();await wait(9000);
   await send(f=>f.rolling24h=null);await wait(null);await send();await wait(9000);
   now+=5001;await p.clock.fastForward(5001);await wait(null);await send();await wait(9000);
   failIndexer=true;await p.evaluate(()=>dispatchEvent(new Event('focus')));await p.waitForTimeout(80);assert.equal(await value.getAttribute('title'),'9000');
   await p.evaluate(()=>dispatchEvent(new Event('offline')));await wait(null);await p.evaluate(()=>dispatchEvent(new Event('online')));await wait(9000);
   count=123456789;await send();await wait(count);
   const dictionary=JSON.parse(await readFile('src/locales/'+locale+'.json','utf8')),key='Transactions included in canonical blocks over the last 24 hours, including failed transactions and L1/system deposits. The window ends at the indicated block.';
   const info=p.locator('[data-counter="newTxns24h"] button').first();await info.click();await p.getByText(dictionary[key],{exact:false}).last().waitFor();await p.keyboard.press('Escape');
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   if(path==='/'){
    const geometry=await p.locator('[data-counter="newTxns24h"]').evaluate(card=>{
     const box=card.getBoundingClientRect(),button=card.querySelector('button').getBoundingClientRect(),label=card.querySelector('.info-visible-label').getBoundingClientRect(),symbol=card.querySelector('.info-symbol').getBoundingClientRect();
     const inside=[...card.querySelectorAll('svg,button')].filter(e=>e.getClientRects().length&&getComputedStyle(e).display!=='none').every(e=>{const r=e.getBoundingClientRect();return r.left>=box.left&&r.right<=box.right&&r.top>=box.top&&r.bottom<=box.bottom;});
     return {inside,height:button.height,noOverlap:label.right<=symbol.left+1||symbol.right<=label.left+1};
    });assert(geometry.inside,'All metric controls/icons stay inside the card');assert(geometry.height>=44);assert(geometry.noOverlap,'Help icon does not overlap the label');
   }
   await p.clock.resume();
   await p.evaluate(axe.source);const violations=await p.evaluate(async()=>(await axe.run(document)).violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})));assert.deepEqual(violations,[]);assert.deepEqual(errors,[]);
   await p.screenshot({path:`${out}/${engine.name()}-${chainId}-${width}-${path.replaceAll('/','')||'home'}.png`});row.passed=true;
  }catch(e){row.passed=false;row.error=e.stack;await p.screenshot({path:`${out}/failure-${engine.name()}-${chainId}-${width}-${path.replaceAll('/','')||'home'}.png`}).catch(()=>{});}
  finally{await c.close();}
  results.push(row);console.log(JSON.stringify(row));await writeFile(out+'/results.json',JSON.stringify({base,complete:false,results},null,2));
 }}finally{await browser.close();}
}
await writeFile(out+'/results.json',JSON.stringify({base,mockedData:true,physicalDevices:false,complete:true,passed:results.every(r=>r.passed),results},null,2));if(results.some(r=>!r.passed))process.exitCode=1;
