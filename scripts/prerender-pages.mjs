import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {initialPageRoutes,initialPageKey} from '../server/page-snapshots.mjs';
import {startupCopy} from '../server/startup-shell.mjs';
import {prerenderEcosystemDetails} from './prerender-ecosystem-details.mjs';
import ecosystem from '../src/ink-ecosystem.json' with { type: 'json' };

const ecosystemLogos = new Set(ecosystem.map(app => app.imageUrl));

const origin='https://inkexplorer.xyz',template=await readFile('dist/index.html','utf8');
const languages=['en','fr','es','pt','ar','ru','hi','bn','zh','ja'],manifest=[];
await mkdir('dist/snapshots/pages',{recursive:true});
const browser=await chromium.launch({args:['--no-sandbox']});
const jobs=['mainnet','sepolia'].flatMap(network=>languages.map(language=>({network,language})));let nextJob=0;
try{await Promise.all(Array.from({length:3},async()=>{while(nextJob<jobs.length){
 const {network,language}=jobs[nextJob++];
 const context=await browser.newContext({viewport:{width:1440,height:900},locale:language,colorScheme:'light'});
 const errors=[];let chainResponses=0;
 // Use the canonical URL in API documentation, while fulfilling all files from
 // this build. Never contact the public site or an upstream during capture.
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(route.request().resourceType()==='image' && ecosystemLogos.has(url.href)) {
   // Keep the original logo URL in the snapshot without fetching it at build time.
   return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"/>'});
  }
  assert.equal(url.origin,origin,'A snapshot must not contact an external host');
  if(/^\/(testnet\/)?api\//.test(url.pathname))return;
  if(route.request().resourceType()==='document')return route.fulfill({status:200,contentType:'text/html',body:template});
  return route.fulfill({path:'dist'+url.pathname});
 });
 await context.routeWebSocket(/.*/,()=>{});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(/\/(?:testnet\/)?api\//.test(new URL(r.url()).pathname))chainResponses++;});
 try{for(const route of initialPageRoutes){
  console.log('Capturing',network,language,route);
  await page.goto(origin+(network==='sepolia'?'/testnet':'')+route+'?lang='+language,{waitUntil:'domcontentloaded'});
  await page.locator('#main-content h1').waitFor();await page.locator('.site-footer').waitFor();
  if(route==='/txs')await page.locator('.transaction-filter-bar[role="group"]').waitFor();
  await page.waitForFunction(lang=>document.documentElement.lang===lang,language);
  assert.deepEqual(errors,[]);assert.equal(chainResponses,0);
  assert.equal(await page.locator('[data-live-head]').getAttribute('data-live-head'),'');
  assert.equal(await page.locator('.tx-row,.block-row:not(.home-block-placeholder),.ledger-record,.token-row,.pool-row').count(),0,'No captured chain records');
  const snapshot=await page.locator('#root').evaluate((root,{route,language,network,loadingLabel})=>{
   const main=root.querySelector('#main-content');
   main.setAttribute('data-initial-page',route);
   if(route!=='/developers'&&route!=='/apps')main.setAttribute('aria-busy','true');
   for(const select of root.querySelectorAll('select'))for(const option of select.options)option.toggleAttribute('selected',option.selected);
   for(const input of root.querySelectorAll('input')){
    if(input.type==='checkbox'||input.type==='radio')input.toggleAttribute('checked',input.checked);
    else input.setAttribute('value',input.value);
   }
   const form=root.querySelector('.global-search');
   form.setAttribute('action',network==='sepolia'?'/testnet/search':'/search');form.setAttribute('method','get');form.querySelector('input').name='q';
   if(language!=='en'){const hidden=document.createElement('input');hidden.type='hidden';hidden.name='lang';hidden.value=language;form.append(hidden);}
   // Preserve native links, details and global search. Other controls need React
   // and must not accept input that would be lost during its first commit.
   for(const field of root.querySelectorAll('button,input,select,textarea'))if(!field.closest('.global-search')&&!field.matches('.mobile-search-trigger'))field.disabled=true;
   const styles=[...document.querySelectorAll('link[rel="stylesheet"]')].map(e=>new URL(e.href).pathname);
   const html=root.innerHTML,clone=root.cloneNode(true),neutralMain=clone.querySelector('#main-content');
   const heading=document.createElement('div');heading.className='stats-heading';heading.append(main.querySelector('h1').cloneNode(true));
   const loading=main.querySelector('.ledger-skeleton,.loading');
   neutralMain.replaceChildren(heading);
   if(loading)neutralMain.append(loading.cloneNode(true));
   else { const status=document.createElement('div');status.className='loading';status.setAttribute('role','status');const text=document.createElement('span');text.textContent=loadingLabel;status.append(document.createElement('i'),text);neutralMain.append(status); }
   // API documentation does not read URL filters; keep its complete static text.
   return {route,language,network,html,neutralHtml:route==='/developers'?html:clone.innerHTML,styles};
  },{route,language,network,loadingLabel:startupCopy[language][0]});
  assert(!snapshot.html.includes('127.0.0.1'));assert(!snapshot.html.includes('localhost'));assert(!snapshot.html.includes('ink-startup'));
  const path=`snapshots/pages/${initialPageKey(route)}-${network}-${language}.json`;
  await writeFile('dist/'+path,JSON.stringify(snapshot));
  manifest.push({route,network,language,path,bytes:Buffer.byteLength(snapshot.html),chainObservations:0,styles:snapshot.styles});
  if (route === '/apps') await prerenderEcosystemDetails(page, network, language, ecosystem);
 }
 console.log(`Prerendered ${initialPageRoutes.length} pages for ${network}/${language}`);
 }finally{await context.close();}
}}));}finally{await browser.close();}
manifest.sort((a,b)=>`${a.network}/${a.language}/${a.route}`.localeCompare(`${b.network}/${b.language}/${b.route}`));
await writeFile('dist/snapshots/pages-manifest.json',JSON.stringify(manifest,null,2));
console.log(`Prerendered ${manifest.length} directory/tool documents without chain observations.`);
