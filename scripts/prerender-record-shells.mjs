import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
const origin='https://inkexplorer.xyz',template=await readFile('dist/index.html','utf8'),manifest=[];
const browser=await chromium.launch({args:['--no-sandbox']});
await mkdir('dist/snapshots/records',{recursive:true});
const jobs=['mainnet','sepolia'].flatMap(network=>['en','fr','es','pt','ar','ru','hi','bn','zh','ja'].map(language=>({network,language})));let next=0;
try{await Promise.all(Array.from({length:3},async()=>{while(next<jobs.length){
 const {network,language}=jobs[next++],context=await browser.newContext({viewport:{width:1440,height:900},locale:language}),errors=[];let chainResponses=0;
 await context.route('**/*',r=>{const u=new URL(r.request().url());assert.equal(u.origin,origin);if(/^\/(testnet\/)?api\//.test(u.pathname))return;if(r.request().resourceType()==='document')return r.fulfill({status:200,contentType:'text/html',body:template});return r.fulfill({path:'dist'+u.pathname});});
 await context.routeWebSocket(/.*/,()=>{});
 const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(/\/(?:testnet\/)?api\//.test(new URL(r.url()).pathname))chainResponses++;});
 try{for(const kind of ['block','transaction','address','token']){
  const id=kind==='block'?'1234567890123':'0x'+'a'.repeat(kind==='transaction'?64:40),route='/'+(kind==='transaction'?'tx':kind)+'/'+id;
  await p.goto(origin+(network==='sepolia'?'/testnet':'')+route+'?lang='+language,{waitUntil:'domcontentloaded'});
  await p.locator('.record-arrival-header h1').waitFor();await p.locator('.site-footer').waitFor();await p.waitForFunction(lang=>document.documentElement.lang===lang,language);
  assert.deepEqual(errors,[]);assert.equal(chainResponses,0);
  const snapshot=await p.locator('#root').evaluate((root,{kind,network,language})=>{
   for(const select of root.querySelectorAll('select'))for(const option of select.options)option.toggleAttribute('selected',option.selected);
   for(const input of root.querySelectorAll('input'))input.setAttribute('value',input.value);
   const form=root.querySelector('.global-search');form.setAttribute('action',network==='sepolia'?'/testnet/search':'/search');form.setAttribute('method','get');form.querySelector('input').name='q';
   if(language!=='en'){const hidden=document.createElement('input');hidden.type='hidden';hidden.name='lang';hidden.value=language;form.append(hidden);}
   for(const control of root.querySelectorAll('button,input,select,textarea'))if(!control.closest('.global-search')&&!control.matches('.mobile-search-trigger'))control.disabled=true;
   root.querySelector('#main-content').outerHTML='<main id="main-content" tabindex="-1" data-record-shell=""></main>';
   return {kind,network,language,html:root.innerHTML,styles:[...document.querySelectorAll('link[rel="stylesheet"]')].map(l=>new URL(l.href).pathname)};
  },{kind,network,language});
  assert(!snapshot.html.includes(id));assert(!snapshot.html.includes('127.0.0.1'));assert(snapshot.html.includes('<main id="main-content" tabindex="-1" data-record-shell=""></main>'));
  const path=`snapshots/records/${kind}-${network}-${language}.json`;await writeFile('dist/'+path,JSON.stringify(snapshot));manifest.push({kind,network,language,path,chainObservations:0});
 } }finally{await context.close();}
}}));}finally{await browser.close();}
// Keep the manifest stable across different completion orders of the captures.
manifest.sort((left, right) => left.path.localeCompare(right.path, 'en'));
await writeFile('dist/snapshots/records-manifest.json',JSON.stringify(manifest,null,2));console.log('Prepared',manifest.length,'record shells; no chain observations or record identifiers stored.');
