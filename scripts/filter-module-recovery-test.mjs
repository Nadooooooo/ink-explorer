import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
import {createServer} from 'vite';
import {mkdir,readFile,realpath,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const out=path.resolve(process.env.FILTER_RECOVERY_OUTPUT||'reports/filters/module-recovery');
await mkdir(out,{recursive:true});
const copy=JSON.parse(await readFile(path.join(root,'src/locales/fr.json'),'utf8'));
// A standalone source run owns its cache and server; BASE_URL exercises a built candidate.
const server=process.env.BASE_URL?null:await createServer({root,configFile:path.join(root,'vite.config.ts'),cacheDir:path.join(out,'.vite'),server:{host:'127.0.0.1',port:0,fs:{allow:[root,out,await realpath(path.join(root,'node_modules'))]}}});
if(server)await server.listen();
const base=process.env.BASE_URL||`http://127.0.0.1:${server.httpServer.address().port}`;
const results=[],hash='0x'+'a'.repeat(64),address='0x'+'1'.repeat(40);
const filterModule=/(?:\/src\/TransactionFilters\.tsx|\/assets\/module-TransactionFilters-[^/]+\.js)(?:\?|$)/;
try{
  for(const[engine,launcher]of Object.entries({chromium,firefox,webkit})){
    const browser=await launcher.launch(engine==='chromium'?{args:['--no-sandbox']}:{});
    try{for(const prefix of['','/testnet']){
      const context=await browser.newContext({viewport:{width:390,height:900},locale:'fr'}),page=await context.newPage();
      page.setDefaultTimeout(15000);
      const errors=[],requests=[],row={engine,prefix,passed:false};let failing=true,blocked=0,documents=0,sequence=0;
      page.on('pageerror',error=>errors.push(error.message));
      page.on('request',request=>{if(request.isNavigationRequest()&&request.frame()===page.mainFrame())documents++;});
      await context.route(filterModule,route=>{
        if(failing){blocked++;return route.fulfill({status:404,headers:{'content-type':'text/plain','cache-control':'no-store'},body:'Controlled missing filter module'});}
        return route.fallback();
      });
      const transaction=()=>({hash,block_hash:'0x'+'b'.repeat(64),block_number:90000000,timestamp:new Date().toISOString(),status:'error',value:'0',from:{hash:address},to:{hash:address},fee:{value:'0'},transaction_types:['CONTRACT_INTERACTION'],method:'0xa9059cbb'});
      const frame=()=>({type:'snapshot',protocol:'ink-observer.live.v1',sequence:++sequence,network:{chainId:prefix?763373:57073,expectedChainId:prefix?763373:57073,head:90000000,online:true,synced:true,stale:false,sampledAt:new Date().toISOString()},blocks:[],transactions:[]});
      await context.routeWebSocket(/\/api\/live$/,socket=>socket.send(JSON.stringify(frame())));
      await context.route('**/api/**',route=>{
        const url=new URL(route.request().url()),name=url.pathname.replace(/^\/testnet/,'');
        requests.push(url.pathname+url.search);
        const reply=value=>route.fulfill({headers:{date:new Date().toUTCString(),'x-ink-data-status':'fresh','x-ink-data-fetched-at':new Date().toISOString()},json:value});
        if(name==='/api/live/config')return reply({url:base.replace(/^http/,'ws')+prefix+'/api/live'});
        if(name==='/api/live/snapshot')return reply(frame());
        if(name==='/api/v1/transactions'||name==='/api/explorer/transactions')return reply({items:[transaction()],next_page_params:null});
        return reply({items:[],counters:[]});
      });
      const url=base+prefix+'/txs?lang=fr&activity=filtered&status=failed&methods=0xa9059cbb#selection';
      try{
        await page.goto(url,{waitUntil:'domcontentloaded'});
        const alert=page.locator('.transaction-filter-bar[role="alert"]');
        await alert.waitFor({state:'visible'});
        assert(blocked>0,'The real filter import must receive an HTTP 404');
        assert.match(await alert.innerText(),new RegExp(copy.unavailable));
        const retry=alert.getByRole('button',{name:copy.retry,exact:true});await retry.waitFor({state:'visible'});
        await page.locator('.filtered-activity .table-shell[aria-busy="false"] .tx-row').first().waitFor();
        assert.equal(await page.locator('#main-content').count(),1);
        assert.equal(await page.locator('#ink-startup').count(),0,'Recovery must belong to the mounted React page');
        assert.equal(page.url(),url);assert.equal(documents,1,'Failure must not cause an automatic reload loop');
        await page.locator('.drawer-trigger').click();await page.locator('#mobile-navigation').waitFor({state:'visible'});
        await page.keyboard.press('Escape');await page.locator('#mobile-navigation').waitFor({state:'detached'});
        assert.equal(page.url(),url,'Using navigation controls preserves the current filters');
        assert.deepEqual(errors,[],'The local boundary must catch the rejected import');
        assert(requests.filter(p=>p.includes('/api/')).every(p=>prefix?p.startsWith('/testnet/api/'):p.startsWith('/api/')),'Data requests must stay on the selected network');
        failing=false;
        await Promise.all([page.waitForEvent('domcontentloaded'),retry.click()]);
        const trigger=page.locator('.filter-trigger');await trigger.waitFor({state:'visible'});
        assert.equal(documents,2,'Retry must perform one actual document reload');
        assert.equal(page.url(),url,'Reload preserves network, language, filter query and fragment');
        assert.equal(await page.locator('.transaction-filter-bar[role="alert"]').count(),0);
        await trigger.click();const dialog=page.locator('dialog.transaction-filter-dialog[open]');await dialog.waitFor({state:'visible'});
        assert.equal(await dialog.locator('[name="status"]').inputValue(),'failed');
        assert.equal(await dialog.locator('[name="methods"]').inputValue(),'0xa9059cbb');
        await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
        assert(await trigger.evaluate(element=>element===document.activeElement));
        assert.deepEqual(errors,[]);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
        Object.assign(row,{passed:true,blocked,documents,requests,checks:['controlled 404 caught locally','ledger stays visible','navigation drawer works','translated recovery','no uncaught exception or automatic reload','explicit reload preserves URL','real dialog recovers with selected filters']});
      }catch(error){Object.assign(row,{error:error.stack,errors,blocked,documents,requests});await page.screenshot({path:path.join(out,`${engine}-${prefix?'sepolia':'mainnet'}-failure.png`)}).catch(()=>{});}
      finally{await context.close();}
      results.push(row);console.log(JSON.stringify(row));await writeFile(path.join(out,'results.json'),JSON.stringify({base,apiMocked:true,complete:false,results},null,2));
    }}finally{await browser.close();}
  }
}finally{if(server)await server.close();}
await writeFile(path.join(out,'results.json'),JSON.stringify({base,apiMocked:true,complete:true,passed:results.every(row=>row.passed),results},null,2));
if(results.some(row=>!row.passed))process.exitCode=1;
