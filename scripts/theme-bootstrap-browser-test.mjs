import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {documentHeaders,renderPage} from '../server/page-document.mjs';
import {themeBootstrapHash} from '../server/theme-bootstrap-policy.mjs';
const base=process.env.BASE_URL||'http://127.0.0.1:4320',out=process.env.THEME_OUTPUT||'reports/theme-bootstrap/browser';
const publicSite=base.startsWith('https:'),template=await readFile('dist/index.html','utf8'),results=[];
await mkdir(out,{recursive:true});
const scenarios=[
 {preference:'dark',system:'light',expected:'dark'},
 {preference:'light',system:'dark',expected:'light'},
 {preference:'system',system:'dark',expected:'dark'},
 {preference:null,system:'light',expected:'light'},
 {preference:null,system:'dark',expected:'dark'},
 {preference:'invalid',system:'light',expected:'light'},
 {preference:'invalid',system:'dark',expected:'dark'},
 {blocked:true,system:'dark',expected:'dark'},
];
async function prepare(context,page){
 if(!publicSite)await context.route('**/*',async route=>{
  if(route.request().resourceType()!=='document')return route.fallback();
  const url=new URL(route.request().url()),prefix=url.pathname.startsWith('/testnet')?'/testnet':'';
  url.pathname=url.pathname.slice(prefix.length)||'/';
  const response=renderPage(template,url,{origin:base,basePath:prefix});
  return route.fulfill({status:response.status,headers:{...documentHeaders,'content-type':'text/html; charset=utf-8'},body:response.body});
 });
 await context.routeWebSocket(/\/api\/live$/,ws=>ws.close());
 await context.route('**/api/**',r=>r.fulfill({status:503,json:{error:'Fixture unavailable'}}));
}
async function record(row,run){try{await run();row.passed=true;}catch(e){row.error=e.stack;}results.push(row);console.log(JSON.stringify(row));await writeFile(out+'/results.json',JSON.stringify({base,publicSite,complete:false,results},null,2));}
for(const[engine,launcher]of Object.entries({chromium,firefox,webkit}).filter(([name])=>!process.env.THEME_ENGINES||process.env.THEME_ENGINES.split(',').includes(name))){
 const browser=await launcher.launch(engine==='chromium'?{args:['--no-sandbox']}:{});
 try{
  for(const prefix of['','/testnet'])for(const scenario of scenarios){
   const context=await browser.newContext({viewport:{width:390,height:844},colorScheme:scenario.system}),page=await context.newPage();
   await record({engine,prefix,scenario,stage:'before React',passed:false},async()=>{
    const requests=[];page.on('request',r=>requests.push(new URL(r.url()).pathname));
    await prepare(context,page);
    await context.addInitScript(s=>{
     if(s.blocked)Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Fixture storage disabled','SecurityError');}});
     else if(s.preference!==null)localStorage.setItem('ink-theme',s.preference);
     window.__violations=[];document.addEventListener('securitypolicyviolation',e=>window.__violations.push({directive:e.effectiveDirective,blocked:e.blockedURI}));
    },scenario);
    await context.route('**/assets/*.js',r=>r.abort());
    const response=await page.goto(base+prefix+'/blocks?lang=fr',{waitUntil:'domcontentloaded'});
    assert(response.headers()['content-security-policy'].includes(`'${themeBootstrapHash}'`));
    assert.equal(await page.locator('html').getAttribute('data-theme'),scenario.expected);
    assert.equal(await page.locator('meta[name="theme-color"]').getAttribute('content'),scenario.expected==='dark'?'#0f0f0f':'#fafafa');
    await page.locator('#ink-startup').waitFor();assert(!requests.includes('/theme.js'));
    assert.deepEqual(await page.evaluate(()=>window.__violations),[]);
    // The debugging channel installs the probe; only a real DOM script tests CSP enforcement.
    await page.evaluate(()=>{const s=document.createElement('script');s.textContent='window.__unapprovedScriptRan=true';document.head.append(s);});
    await page.waitForFunction(()=>window.__violations.some(v=>v.directive==='script-src-elem'&&v.blocked==='inline'));
    assert.equal(await page.evaluate(()=>window.__unapprovedScriptRan),undefined);
   });await context.close();
  }
  for(const prefix of['','/testnet'])for(const width of[390,1440]){
   const context=await browser.newContext({viewport:{width,height:900},colorScheme:'dark'}),page=await context.newPage();
   await record({engine,prefix,width,stage:'interactive controls',passed:false},async()=>{
    const errors=[];page.on('pageerror',e=>errors.push(e.message));await prepare(context,page);
    await page.goto(base+prefix+'/blocks?lang=fr',{waitUntil:'domcontentloaded'});await page.locator('.ledger-filters').waitFor();
    if(width===390)await page.locator('.drawer-trigger').click();
    const select=page.locator((width===390?'.drawer-preferences':'.utility-settings')+' .theme-control select');
    for(const theme of['light','dark','system']){
     await select.selectOption(theme);const expected=theme==='light'?'light':'dark';
     try{await page.waitForFunction(t=>document.documentElement.dataset.theme===t,expected);}
     catch(error){throw new Error(JSON.stringify({theme,expected,observed:await page.evaluate(()=>({theme:document.documentElement.dataset.theme,stored:localStorage.getItem('ink-theme'),systemDark:matchMedia('(prefers-color-scheme: dark)').matches,controls:[...document.querySelectorAll('.theme-control select')].map(e=>e.value)}))}),{cause:error});}
     assert.equal(await page.evaluate(()=>localStorage.getItem('ink-theme')),theme);
     assert.equal(await page.locator('meta[name="theme-color"]').getAttribute('content'),expected==='dark'?'#0f0f0f':'#fafafa');
    }
    await page.emulateMedia({colorScheme:'light'});await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');
    await select.selectOption('dark');await page.reload({waitUntil:'domcontentloaded'});await page.locator('.ledger-filters').waitFor();
    assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');assert.deepEqual(errors,[]);
    await page.screenshot({path:`${out}/${engine}-${prefix?'sepolia':'mainnet'}-${width}.png`});
   });await context.close();
  }
 }finally{await browser.close();}
}
await writeFile(out+'/results.json',JSON.stringify({base,publicSite,complete:true,passed:results.every(r=>r.passed),physicalDeviceTest:false,policyBypassed:false,results},null,2));
if(results.some(r=>!r.passed))process.exitCode=1;
