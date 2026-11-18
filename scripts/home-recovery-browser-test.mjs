import assert from 'node:assert/strict';import{readFile,writeFile,mkdir}from'node:fs/promises';import{registerHooks}from'node:module';import{chromium,firefox,webkit}from'playwright-core';import axe from'axe-core';
registerHooks({resolve(s,c,n){try{return n(s,c)}catch(e){if(s.startsWith('./')&&c.parentURL?.includes('/src/')&&!/\.[a-z]+$/.test(s))return n(s+'.ts',c);throw e;}}});
const{handleRequest}=await import('../cloudflare/worker.mjs');const base=process.env.BASE_URL||'http://127.0.0.1:4214',publicSite=base.startsWith('https:'),out=process.env.RECOVERY_OUTPUT||'reports/arrival-seo/home-recovery';await mkdir(out,{recursive:true});const template=await readFile('dist/index.html','utf8'),entry=template.match(/<script type="module"[^>]+src="([^"]+)"/)[1],results=[];
const env={PUBLIC_URL:base,ASSETS:{async fetch(r){try{return new Response(await readFile('dist'+new URL(r.url).pathname));}catch{return new Response('Missing',{status:404});}}}};
for(const[engine,launcher]of Object.entries({chromium,firefox,webkit})){
 const browser=await launcher.launch(engine==='chromium'?{args:['--no-sandbox']}:{});
 try{for(const mode of['entry','dependency']){
  const context=await browser.newContext({viewport:{width:320,height:900},reducedMotion:'reduce',colorScheme:'dark'}),page=await context.newPage();let failed=true,documents=0;
  page.on('request',r=>{if(r.resourceType()==='document')documents++;});
  if(!publicSite)await context.route('**/*',async route=>{if(route.request().resourceType()!=='document')return route.fallback();const r=await handleRequest(new Request(route.request().url()),env);await route.fulfill({status:r.status,headers:Object.fromEntries(r.headers),body:Buffer.from(await r.arrayBuffer())});});
  await context.route('**/api/**',r=>r.fulfill({status:503,json:{error:'Controlled API outage'}}));await context.routeWebSocket(/\/api\/live$/,s=>s.close());
  await context.route('**/assets/**',r=>{const path=new URL(r.request().url()).pathname;return failed&&path.endsWith('.js')&&(mode==='entry'?path===entry:path!==entry)?r.fulfill({status:404,headers:{'cache-control':'no-store','content-type':'text/plain'},body:'Missing'}):r.fallback();});
  try{
   const url=base+'/?lang=fr#keep-position';await page.goto(url);await page.locator('#ink-startup-reload').waitFor({state:'visible',timeout:12000});assert.equal(await page.locator('.home-guide').isVisible(),true);
   const bounds=await page.locator('#ink-startup').boundingBox();assert(bounds.width<=288&&bounds.height<350);assert.equal(documents,1);
   await page.evaluate(axe.source);const violations=await page.evaluate(async()=>(await axe.run(document)).violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})));assert.deepEqual(violations,[]);
   await page.screenshot({path:out+'/'+engine+'-'+mode+'.png'});failed=false;await page.locator('#ink-startup-reload').click();await page.locator('#ink-startup').waitFor({state:'detached'});assert.equal(page.url(),url);assert.equal(documents,2);assert.equal(await page.locator('.home-feed-tabs').isVisible(),true);
   results.push({engine,mode,passed:true,bounds});console.log('PASS compact home recovery',engine,mode);
  }finally{await context.close();}
 }}finally{await browser.close();}
}
await writeFile(out+'/results.json',JSON.stringify({base,publicSite,apiMocked:true,physicalDeviceTest:false,results},null,2));
