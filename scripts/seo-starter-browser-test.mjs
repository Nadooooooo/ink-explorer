import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';

const base=process.env.BASE_URL||'http://127.0.0.1:4301',out=process.env.SEO_OUTPUT||'reports/seo-starter/browser';
await mkdir(out,{recursive:true});const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']}),results=[];
try {
  for(const prefix of ['','/testnet'])for(const [width,lang] of [[320,'fr'],[768,'ar'],[1440,'en']]){
    const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage(),errors=[];
    // Content and navigation must remain useful without successful chain reads.
    await context.route(/\/(?:testnet\/)?api\//,route=>route.abort());await context.routeWebSocket(/.*/,ws=>ws.close());
    page.on('pageerror',error=>errors.push(error.message));
    for(const path of ['/tokens','/contracts','/accounts','/internal-txs','/deposits']){
      const url=base+prefix+path+'?lang='+lang,response=await page.goto(url,{waitUntil:'domcontentloaded'}),html=await response.text();assert.equal(response.status(),200);
      assert(html.includes('page-summary'),'Descriptions must exist in the native HTTP document');
      const summary=page.locator('main .page-summary').first();await summary.waitFor();assert((await summary.innerText()).length>25);
      await page.locator('#ink-startup').waitFor({state:'detached'});
      const doc=await page.evaluate(()=>({title:document.title,description:document.querySelector('meta[name="description"]').content,canonical:document.querySelector('link[rel="canonical"]').href,robots:document.querySelector('meta[name="robots"]').content,overflow:document.documentElement.scrollWidth-innerWidth,
        summary:[...document.querySelectorAll('main .page-summary')].map(el=>({text:el.innerText,display:getComputedStyle(el).display,visibility:getComputedStyle(el).visibility,clipped:el.scrollHeight>el.clientHeight+1}))}));
      assert(doc.overflow<=1);assert(doc.summary.every(p=>p.text&&p.display!=='none'&&p.visibility!=='hidden'&&!p.clipped));
      const native=await page.evaluate(html=>{const doc=new DOMParser().parseFromString(html,'text/html');return{title:doc.title,description:doc.querySelector('meta[name="description"]').content,canonical:doc.querySelector('link[rel="canonical"]').href,robots:doc.querySelector('meta[name="robots"]').content};},html);
      for(const key of Object.keys(native))assert.equal(doc[key],native[key]);
      results.push({prefix,width,lang,path,description:doc.summary[0].text,passed:true});
      if(path==='/accounts')await page.screenshot({path:`${out}/${prefix?'sepolia':'mainnet'}-${width}-${lang}.png`,fullPage:true});
    }
    const nft='/token/0x'+'a'.repeat(40)+'/instance/207';
    const raw=await fetch(base+prefix+nft+'?lang='+lang).then(r=>r.text());
    await page.evaluate(path=>{history.pushState({},'',path);dispatchEvent(new PopStateEvent('popstate'));},prefix+nft+'?lang='+lang);
    await page.waitForFunction(()=>document.title.includes('#207'));
    const initialTitle=raw.match(/<title>(.*?)<\/title>/)[1].replaceAll('&amp;','&');assert.equal(await page.title(),initialTitle);
    assert.deepEqual(errors,[]);await context.close();
  }
}finally{await browser.close();await writeFile(`${out}/results.json`,JSON.stringify({base,checks:results.length,results},null,2));}
console.log(JSON.stringify({passed:true,documents:results.length,nftSpaNavigations:6,mobileWidths:[320,768,1440],locales:['fr','ar','en']}));
