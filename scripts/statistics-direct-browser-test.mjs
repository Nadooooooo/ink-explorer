import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright-core';
import {createServer} from 'vite';
import {mkdir,realpath,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const out=path.resolve(process.env.STATISTICS_DIRECT_OUTPUT||'reports/statistics-direct');
await mkdir(out,{recursive:true});
const server=process.env.BASE_URL?null:await createServer({root,configFile:path.join(root,'vite.config.ts'),cacheDir:path.join(out,'.vite'),server:{host:'127.0.0.1',port:0,fs:{allow:[root,out,await realpath(path.join(root,'node_modules'))]}}});
if(server)await server.listen();
const base=process.env.BASE_URL||`http://127.0.0.1:${server.httpServer.address().port}`;
const results=[],day=86400000,stamp=time=>new Date(time).toISOString().slice(0,10);
const definitions=[
  {id:'newTxns',title:'New transactions',description:'Number of new transactions',units:null,resolutions:['DAY','WEEK']},
  {id:'averageTxnFee',title:'Average transaction fee',description:'Average fee',units:'ETH',resolutions:['DAY','WEEK']},
  {id:'newAccounts',title:'New accounts',description:'Number of new accounts',units:null,resolutions:['DAY','WEEK']},
];
const sections=[{id:'transactions',title:'Transactions',charts:definitions.slice(0,2)},{id:'accounts',title:'Accounts',charts:definitions.slice(2)}];
const freshHeaders=()=>({date:new Date().toUTCString(),'x-ink-data-status':'fresh','x-ink-data-fetched-at':new Date().toISOString()});
function series(url,invalid=false){
  const metric=url.pathname.split('/').at(-1),info=definitions.find(row=>row.id===metric);
  assert(info,`Unexpected chart ${metric}`);
  const to=Date.parse(url.searchParams.get('to')||stamp(Date.now()));
  const from=Date.parse(url.searchParams.get('from')||stamp(to-29*day));
  const chart=[];
  for(let time=from,index=0;time<=to;time+=day,index++)chart.push({date:stamp(time),value:metric==='averageTxnFee'?'0.0001':String(index+10),is_approximate:false});
  return {info:invalid?{...info,id:'wrongMetric'}:info,chart};
}
try{
  for(const[engine,launcher]of Object.entries({chromium,firefox,webkit})){
    const browser=await launcher.launch(engine==='chromium'?{args:['--no-sandbox']}:{});
    try{for(const prefix of['','/testnet']){
      const context=await browser.newContext({viewport:{width:390,height:900},locale:'en'}),page=await context.newPage();
      const errors=[],requests=[],row={engine,prefix,passed:false};
      page.setDefaultTimeout(15000);
      let mode='fresh',blocked=0,sequence=0;
      page.on('pageerror',error=>errors.push(error.message));
      // Both source and built routes must work without the former directory
      // module or its otherwise unrelated ethers/units dependency.
      await context.route(/(?:\/src\/ExplorerPages\.tsx(?:\?|$)|\/assets\/module-(?:ExplorerPages|units)-[^/?]+\.js(?:\?|$)|\/ethers\/|\/ethers(?:_[^/?]+)?\.js(?:\?|$))/,route=>{
        blocked++;
        return route.fulfill({status:404,contentType:'text/plain',body:'Statistics must not request ExplorerPages or ethers/units'});
      });
      const frame=()=>({type:'snapshot',protocol:'ink-observer.live.v1',sequence:++sequence,network:{chainId:prefix?763373:57073,expectedChainId:prefix?763373:57073,head:90000000,online:true,synced:true,stale:false,sampledAt:new Date().toISOString()},blocks:[],transactions:[]});
      await context.routeWebSocket(/\/api\/live$/,socket=>socket.send(JSON.stringify(frame())));
      await context.route('**/api/**',async route=>{
        const url=new URL(route.request().url()),name=url.pathname.replace(/^\/testnet/,'');
        const reply=value=>route.fulfill({headers:freshHeaders(),json:value});
        if(name==='/api/live/config')return reply({url:base.replace(/^http/,'ws')+prefix+'/api/live'});
        if(name==='/api/live/snapshot')return reply(frame());
        if(name.startsWith('/api/stats/'))requests.push(url.pathname+url.search);
        if(name==='/api/stats/counters')return reply({counters:[{id:'averageBlockTime',title:'Average block time',description:'Time per block',units:'s',value:'2'}]});
        if(name==='/api/stats/lines')return reply({sections:mode==='badCatalogue'?[null]:sections});
        if(name.startsWith('/api/stats/lines/'))return reply(series(url,mode==='badChart'));
        return reply({items:[],counters:[]});
      });
      const cards=page.locator('.stats-chart-card'),category=page.locator('.stats-category-select select'),metric=page.locator('.stats-chart-select select');
      const graph=page.locator('.interactive-chart');
      const location=()=>new URL(page.url());
      const waitPoints=count=>page.locator(`.interactive-chart[data-points="${count}"]`).waitFor();
      try{
        await page.goto(base+prefix+'/analytics?lang=en&category=transactions',{waitUntil:'domcontentloaded'});
        await cards.nth(1).waitFor();await waitPoints(30);
        assert.equal(await page.locator('.stats-heading h1').innerText(),'Chain stats');
        assert.deepEqual(await cards.locator('h2').allTextContents(),definitions.slice(0,2).map(row=>row.title));
        const chartSearch=page.getByRole('textbox',{name:'Search charts'});
        await chartSearch.fill('No statistic result fixture');
        await page.waitForFunction(()=>document.querySelector('.statistics-page [role="status"].sr-only')?.textContent==='No records found');
        assert.equal(await cards.count(),0);
        await chartSearch.fill('');await cards.nth(1).waitFor();await waitPoints(30);
        assert.equal(location().pathname,prefix+'/analytics');assert.equal(location().search,'?lang=en&category=transactions');
        assert.equal(blocked,0);
        await metric.selectOption('averageTxnFee');await page.waitForFunction(()=>document.querySelectorAll('.stats-chart-card').length===1);
        assert.equal(await cards.locator('h2').innerText(),'Average transaction fee');await waitPoints(30);
        assert.equal(location().search,'?lang=en&category=transactions','Metric selection must retain the original URL behavior');
        await category.selectOption('accounts');await waitPoints(30);
        assert.equal(await metric.inputValue(),'');assert.equal(await cards.locator('h2').innerText(),'New accounts');
        assert.equal(location().searchParams.get('category'),'accounts');assert.equal(location().searchParams.get('lang'),'en');
        const detailLink=cards.locator('.chart-card-actions a');assert.equal(await detailLink.getAttribute('href'),prefix+'/stats/newAccounts');
        await detailLink.click();await page.locator('.stats-heading h1').getByText('New accounts',{exact:true}).waitFor();await waitPoints(30);
        assert.equal(location().pathname,prefix+'/stats/newAccounts');assert.equal(location().search,'');assert.equal(await metric.count(),0);
        assert.equal(await page.locator('.stats-gas-link').getAttribute('href'),prefix+'/analytics');
        const detailUrl=page.url();await page.locator('article.stat-chart select').selectOption('7');await waitPoints(7);
        assert.equal(page.url(),detailUrl);assert.equal(await graph.getAttribute('data-points'),'7');
        const chartRequest=new URL(requests.findLast(url=>url.includes('/stats/lines/newAccounts?')),base);
        assert.equal(chartRequest.pathname,prefix+'/api/stats/lines/newAccounts');
        assert.equal(chartRequest.searchParams.get('resolution'),'DAY');
        assert.equal(chartRequest.searchParams.get('from'),stamp(Date.parse(chartRequest.searchParams.get('to'))-6*day));
        await page.locator('.stats-heading a').click();await cards.nth(1).waitFor();await waitPoints(30);
        assert.equal(location().pathname,prefix+'/analytics');assert.equal(await category.inputValue(),'transactions');assert.equal(await metric.inputValue(),'');
        await metric.selectOption('newTxns');await page.waitForFunction(()=>document.querySelectorAll('.stats-chart-card').length===1);await waitPoints(30);
        mode='badChart';await page.locator('article.stat-chart select').selectOption('7');await page.locator('.chart-error').waitFor();
        assert.equal(await graph.count(),0,'Invalid series metadata cannot become chart data');
        mode='fresh';await page.locator('.chart-error button').click();await waitPoints(7);
        assert.equal(location().pathname,prefix+'/analytics');assert.equal(location().search,'');
        mode='badCatalogue';await page.goto(base+prefix+'/stats/newTxns?lang=en',{waitUntil:'domcontentloaded'});
        const error=page.locator('.statistics-page .error-state[role="alert"]');await error.waitFor();assert.equal(await cards.count(),0);
        mode='fresh';await error.getByRole('button',{name:'Retry',exact:true}).click();
        await page.locator('.stats-heading h1').getByText('New transactions',{exact:true}).waitFor();await waitPoints(30);
        assert.equal(location().pathname,prefix+'/stats/newTxns');assert.equal(location().search,'?lang=en');
        await page.goto(base+prefix+'/stats?lang=en',{waitUntil:'domcontentloaded'});await cards.nth(1).waitFor();await waitPoints(30);
        assert.equal(await page.locator('.stats-heading h1').innerText(),'Chain stats');assert.equal(await category.inputValue(),'transactions');
        assert.equal(blocked,0,'Direct Statistics routes must never load ExplorerPages or ethers/units');
        assert.deepEqual(errors,[]);assert(requests.every(url=>url.startsWith(prefix+'/api/stats/')),'Statistics requests must stay on the selected network');
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
        Object.assign(row,{passed:true,blocked,requests,checks:['analytics and stats list render without deferred modules','metric and category selection preserve URL behavior','chart detail link uses network path','detail route and period selection preserve identity and URL','stats key resets category and metric on list return','invalid chart metadata stays unavailable and retries','invalid catalogue stays unavailable and retries','cold stats list and detail render directly','network isolation']});
      }catch(error){Object.assign(row,{error:error.stack,errors,blocked,requests});await page.screenshot({path:path.join(out,`${engine}-${prefix?'sepolia':'mainnet'}-failure.png`)}).catch(()=>{});}
      finally{await context.close();}
      results.push(row);console.log(JSON.stringify(row));
      await writeFile(path.join(out,'results.json'),JSON.stringify({base,apiMocked:true,complete:false,results},null,2));
    }}finally{await browser.close();}
  }
}finally{if(server)await server.close();}
await writeFile(path.join(out,'results.json'),JSON.stringify({base,apiMocked:true,complete:true,passed:results.every(row=>row.passed),results},null,2));
if(results.some(row=>!row.passed))process.exitCode=1;
