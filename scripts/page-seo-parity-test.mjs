import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';

// Read actual server documents, then compare their metadata with the application
// after startup and SPA navigation. Chain reads are aborted only in this test:
// live data is irrelevant to document metadata and must not enter snapshots.
const base=process.env.BASE_URL||'http://127.0.0.1:4468';
const output=process.env.SEO_PARITY_OUTPUT||'reports/seo-parity';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
const languages=['en','zh','hi','es','fr','ar','bn','pt','ru','ja'];
const rows=[],errors=[];let next=0;
const jobs=['','/testnet'].flatMap(prefix=>languages.map(lang=>({prefix,lang})));
const paths=['/','/blocks','/txs','/tokens','/pools','/contracts','/analytics','/advanced','/developers','/network','/accounts','/internal-txs','/token-transfers','/deposits','/withdrawals','/batches','/dispute-games','/ops','/name-services','/gas-tracker','/apps','/contract-verification','/public-tags/submit','/approvals','/stats'];
try {
 await Promise.all(Array.from({length:3},async()=>{
  while(next<jobs.length){
   const {prefix,lang}=jobs[next++],context=await browser.newContext();
   await context.route(/\/(?:testnet\/)?api\//,route=>route.abort());
   await context.routeWebSocket(/.*/,()=>{});
   const page=await context.newPage(),runtime=[];
   page.on('pageerror',e=>runtime.push(e.message));
   try {for(const path of paths){
    const target=prefix+path+(lang==='en'?'':'?lang='+lang);
    const response=await page.goto(base+target,{waitUntil:'domcontentloaded'});
    assert.equal(response.status(),200,target);
    const html=await response.text();
    await page.locator('#ink-startup').waitFor({state:'detached'});
    const pair=await page.evaluate(html=>{
     const read=doc=>({title:doc.title,description:doc.querySelector('meta[name="description"]')?.content,canonical:doc.querySelector('link[rel="canonical"]')?.getAttribute('href'),robots:doc.querySelector('meta[name="robots"]')?.content,lang:doc.documentElement.lang,graph:JSON.parse(doc.querySelector('#ink-page-schema')?.textContent||'null'),alternates:[...doc.querySelectorAll('link[rel="alternate"][hreflang]')].map(x=>({lang:x.hreflang,href:x.getAttribute('href')}))});
     return {raw:read(new DOMParser().parseFromString(html,'text/html')),rendered:read(document)};
    },html);
    assert.deepEqual(pair.rendered,pair.raw,target+' changed during startup');
    assert.match(pair.rendered.title,/Ink Explorer/);
    if(prefix)assert.match(pair.rendered.title,/Ink Sepolia/);
    rows.push({target,...pair.rendered});
   }
   // Revisit blocks through the client router; a static-title workaround fails.
   const target=prefix+'/blocks'+(lang==='en'?'':'?lang='+lang);
   await page.evaluate(target=>{history.pushState({},'',target);dispatchEvent(new PopStateEvent('popstate'));},target);
   const expected=rows.find(r=>r.target===target);
   await page.waitForFunction(expected=>document.title===expected.title&&document.querySelector('meta[name="description"]')?.content===expected.description,expected);
   assert.deepEqual(runtime,[],`${prefix} ${lang} runtime errors`);
   console.log(JSON.stringify({prefix,lang,documents:paths.length,spa:true}));
   } catch(e){errors.push({prefix,lang,error:e.stack});}
   finally{await context.close();}
  }
 }));
} finally {
 await browser.close();
 const report={at:new Date().toISOString(),base,fixture:'API calls aborted; metadata only',passed:errors.length===0&&rows.length===500,documents:rows.length,spaNavigations:jobs.length,errors,rows};
 await writeFile(output+'/results.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({passed:report.passed,documents:rows.length,errors}));
 if(!report.passed)process.exitCode=1;
}
