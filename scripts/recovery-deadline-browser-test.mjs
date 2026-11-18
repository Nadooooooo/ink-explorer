import assert from 'node:assert/strict';import {readFile,mkdir,writeFile} from 'node:fs/promises';import {registerHooks} from 'node:module';import {chromium,firefox,webkit} from 'playwright-core';
registerHooks({resolve(s,c,n){try{return n(s,c)}catch(e){if(s.startsWith('./')&&c.parentURL?.includes('/src/')&&!/\.[a-z]+$/.test(s))return n(s+'.ts',c);throw e;}}});
const{handleRequest}=await import('../cloudflare/worker.mjs');const base=process.env.BASE_URL||'http://127.0.0.1:4214',out=process.env.DEADLINE_OUTPUT||'reports/page-arrival/deadline',publicSite=base.startsWith('https:');await mkdir(out,{recursive:true});
const template=await readFile('dist/index.html','utf8'),entry=template.match(/<script type="module"[^>]+src="([^"]+)"/)[1],env={PUBLIC_URL:base,ASSETS:{async fetch(r){try{return new Response(await readFile('dist'+new URL(r.url).pathname))}catch{return new Response('Missing',{status:404})}}}},results=[];
for(const[engine,launcher]of Object.entries({chromium,firefox,webkit})){
 const browser=await launcher.launch(engine==='chromium'?{args:['--no-sandbox']}:{});
 try{await Promise.all([['/blocks',true],['/blocks',false],['/tx/0x'+'a'.repeat(64),true],['/tx/0x'+'a'.repeat(64),false]].map(async([path,reduced])=>{
  const c=await browser.newContext({viewport:{width:390,height:844},reducedMotion:reduced?'reduce':'no-preference'}),p=await c.newPage();let release;const held=new Promise(r=>release=r),row={engine,path,reduced};let documents=0;
  p.on('request',r=>{if(r.resourceType()==='document')documents++});
  if(publicSite&&process.env.INK_RELEASE_VERSION)await c.setExtraHTTPHeaders({'Cloudflare-Workers-Version-Overrides':`inkexplorer="${process.env.INK_RELEASE_VERSION}"`});
  if(!publicSite)await c.route('**/*',async r=>{if(r.request().resourceType()!=='document')return r.fallback();const response=await handleRequest(new Request(r.request().url()),env);await r.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});});
  await c.route('**/api/**',r=>r.fulfill({status:503,json:{error:'Controlled API outage'}}));await c.routeWebSocket(/\/api\/live$/,s=>s.close());await c.route('**'+entry,async r=>{await held;await r.fallback().catch(()=>{})});
  try{
   await p.goto(base+path+'?lang=fr',{waitUntil:'commit'});await p.locator('#ink-startup').waitFor({state:'attached'});
   const button=p.locator('#ink-startup-reload');assert.equal(await button.isVisible(),false);
   await p.waitForTimeout(900);assert.equal(await button.isVisible(),false,'Recovery must not appear early, even with reduced motion');
   row.before=await p.evaluate(()=>({time:performance.now(),display:getComputedStyle(document.querySelector('.startup-recovery')).display,delayed:document.documentElement.dataset.startupDelayed}));assert.equal(row.before.display,'none');
   await button.waitFor({state:'visible',timeout:9500});row.after=await p.evaluate(()=>({time:performance.now(),delayed:document.documentElement.dataset.startupDelayed,display:getComputedStyle(document.querySelector('.startup-recovery')).display}));
   assert(row.after.time>=7900,'Recovery respects the eight-second deadline');assert.equal(row.after.delayed,'true');assert.equal(row.after.display,'block');assert.equal(documents,1);
   release();await p.locator('#ink-startup').waitFor({state:'detached'});assert.equal(await p.locator('html').getAttribute('data-startup-delayed'),null);assert.equal(documents,1);row.passed=true;console.log('PASS deadline',engine,path,reduced);
  }catch(e){row.passed=false;row.error=e.stack;throw e;}finally{release();results.push(row);await c.close();}
 }));}finally{await browser.close();await writeFile(out+'/results.json',JSON.stringify({base,apiMocked:true,physicalDevices:false,results},null,2));}
}
console.log(`${results.length} startup deadlines verified`);
