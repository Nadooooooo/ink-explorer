import assert from 'node:assert/strict';import {chromium,firefox,webkit} from 'playwright';import {mkdir,writeFile,readFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4318',out=process.env.NFT_LAYOUT_OUTPUT||'reports/nft-details/layout',large=process.env.NFT_FONT_MIN==='24',engine=large?'firefox':process.env.NFT_LAYOUT_ENGINE||'chromium',results=[];
const contract='0x'+'a'.repeat(40),owner='0x'+'b'.repeat(40),id=(2n**256n-1n).toString(),locales=large?['en','fr','ar']:['en','fr','ar','zh','hi','bn','es','pt','ru','ja'];
await mkdir(out,{recursive:true});const browser=await({chromium,firefox,webkit})[engine].launch(large?{firefoxUserPrefs:{'font.minimum-size.x-western':24}}:engine==='chromium'?{args:['--no-sandbox']}:{});
try{for(const locale of locales)for(const width of large?[320,390]:[320,390,768,1440]){
 const context=await browser.newContext({viewport:{width,height:1000},colorScheme:width===320?'dark':'light'}),page=await context.newPage(),row={locale,width,engine,large,passed:false},errors=[];page.on('pageerror',e=>errors.push(e.message));
 await context.routeWebSocket(/\/api\/live$/,ws=>ws.close());await context.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname,headers={date:new Date().toUTCString(),'x-ink-data-status':'fresh','x-ink-data-fetched-at':new Date().toISOString()};
  if(path.endsWith('/transfers-count'))return route.fulfill({headers,json:{transfers_count:'9007199254740993'}});
  if(path.endsWith('/instances/'+id))return route.fulfill({headers,json:{id,owner:{hash:owner,name:'Ink community vault'},creator:{hash:owner},metadata:{name:'Fresh INK – OpenSea x Ink Commemorative NFT',description:'Inked permanently onchain, this commemorative NFT celebrates the launch of INK on OpenSea.',attributes:[{trait_type:'Network',value:'Ink'},{trait_type:'Powered by',value:'Community explorers'},{trait_type:'Identifier',value:'x'.repeat(150)},{trait_type:'Mint',value:0}]}}});
  if(path.endsWith(contract))return route.fulfill({headers,json:{address_hash:contract,type:'ERC-1155',name:'Ink collection',symbol:'INK'}});return route.fulfill({status:503,json:{error:'Controlled unrelated source'}});
 });
 try{
  await page.goto(`${base}/token/${contract}/instance/${id}?lang=${locale}`,{waitUntil:'domcontentloaded'});await page.locator('.nft-facts').waitFor();await page.evaluate(()=>document.fonts.ready);
  const geometry=await page.evaluate(()=>{
   const clipped=[...document.querySelectorAll('.nft-heading h1,.nft-facts dt,.nft-facts dd,.nft-attributes article span,.nft-attributes article strong,.nft-media .nft-placeholder span')].filter(el=>el.scrollWidth>el.clientWidth+1||el.scrollHeight>el.clientHeight+1).map(el=>el.textContent);
   const boxes=[...document.querySelectorAll('.nft-facts .definition,.nft-attributes article')].map(el=>el.getBoundingClientRect().toJSON());
   return{clipped,boxes,overflow:document.documentElement.scrollWidth-innerWidth,media:document.querySelector('.nft-media').getBoundingClientRect().toJSON(),copy:[...document.querySelectorAll('.nft-facts .copyable button')].map(e=>e.getBoundingClientRect().toJSON())};
  });assert.deepEqual(geometry.clipped,[]);assert(geometry.overflow<=1);assert(geometry.media.width<=281);assert(geometry.copy.every(c=>c.width>=44&&c.height>=44));assert.deepEqual(errors,[]);
  for(let i=0;i<geometry.boxes.length;i++)for(let j=i+1;j<geometry.boxes.length;j++){const a=geometry.boxes[i],b=geometry.boxes[j];assert(a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top,'Content boxes overlap');}
  await page.screenshot({path:`${out}/${locale}-${width}.png`,fullPage:true});row.passed=true;row.mediaWidth=geometry.media.width;
 }catch(error){row.error=error.stack;await page.screenshot({path:`${out}/failure-${locale}-${width}.png`,fullPage:true}).catch(()=>{});}finally{await context.close();}
 results.push(row);console.log(JSON.stringify(row));await writeFile(`${out}/results.json`,JSON.stringify({base,complete:false,results},null,2));
}}finally{await browser.close();}
await writeFile(`${out}/results.json`,JSON.stringify({base,complete:true,passed:results.every(r=>r.passed),mockedApi:true,physicalDeviceTest:false,results},null,2));if(results.some(r=>!r.passed))process.exitCode=1;
