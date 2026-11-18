import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {homePageTitles,homeGuideCopy,homeDataCopy} from '../src/home-guide-copy.ts';

const base=process.env.BASE_URL||'http://127.0.0.1:4303',out=process.env.BRAND_OUTPUT||'reports/seo-release-20261111/brand';
await mkdir(out,{recursive:true});const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']}),results=[];
try {
 for(const prefix of ['','/testnet'])for(const lang of Object.keys(homePageTitles)){
  const network=prefix?'Ink Sepolia':'Ink Mainnet',url=base+prefix+'/?lang='+lang;
  const catalogue=JSON.parse(await readFile('src/locales/'+lang+'.json','utf8'));
  const context=await browser.newContext({viewport:{width:lang==='fr'?320:lang==='ar'?390:1440,height:1000}});
  await context.routeWebSocket(/\/api\/live$/,ws=>ws.close());
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const response=await page.goto(url,{waitUntil:'domcontentloaded'});assert.equal(response.status(),200);const raw=await response.text();
  const expected={title:homePageTitles[lang].replace('Ink Mainnet',network),description:homeGuideCopy[lang][1].replace('{network}',network)};
  const native=await page.evaluate(raw=>{
   const d=new DOMParser().parseFromString(raw,'text/html');return{title:d.title,description:d.querySelector('meta[name="description"]').content,h1:d.querySelectorAll('h1').length,missingAlt:d.querySelectorAll('img:not([alt])').length,footer:d.querySelector('.site-footer .footer-brand p')?.textContent,graph:JSON.parse(d.querySelector('#ink-page-schema').textContent),twitterImage:d.querySelector('meta[name="twitter:image"]')?.content,guide:d.querySelector('.home-data-guide')?.textContent};
  },raw);
  assert.equal(native.title,expected.title);assert.equal(native.description,expected.description);assert.equal(native.h1,1);assert.equal(native.missingAlt,0);
  assert.equal(native.footer,catalogue.independent);assert(native.guide.includes(homeDataCopy[lang][0]));assert(native.twitterImage.endsWith('/brand/ink-symbol.png'));
  const publisher=native.graph['@graph'].find(item=>item['@type']==='Organization');assert.equal(publisher.name,'Ink Explorer');
  await page.locator('#ink-startup').waitFor({state:'detached'});
  assert.equal(await page.title(),native.title);assert.equal(await page.locator('meta[name="description"]').getAttribute('content'),native.description);
  assert.equal(await page.locator('.site-footer .footer-brand p').textContent(),native.footer);assert.equal(await page.locator('h1').count(),1);
  assert(await page.locator('.home-data-guide').isVisible());assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);
  await page.evaluate(prefix=>{history.pushState({},'',prefix+'/tokens'+location.search);dispatchEvent(new PopStateEvent('popstate'));},prefix);
  await page.locator('.token-directory').waitFor();assert.equal(await page.locator('.site-footer .footer-brand p').textContent(),native.footer);
  await page.evaluate(prefix=>{history.pushState({},'',prefix+'/'+location.search);dispatchEvent(new PopStateEvent('popstate'));},prefix);
  await page.waitForFunction(title=>document.title===title,expected.title);assert.equal(await page.locator('meta[name="description"]').getAttribute('content'),expected.description);
  if(!prefix&&['en','fr'].includes(lang))await page.screenshot({path:`${out}/home-${lang}.png`,fullPage:true});
  results.push({prefix,lang,passed:true,title:native.title,description:native.description,footer:native.footer,h1:1});await context.close();
 }
}finally{await browser.close();await writeFile(out+'/results.json',JSON.stringify({base,results},null,2));}
console.log(JSON.stringify({passed:true,homes:results.length,locales:10,networks:2,spaHomeReturns:results.length}));
