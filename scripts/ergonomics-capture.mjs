import { chromium } from 'playwright-core';
import { mkdir,writeFile } from 'node:fs/promises';
const output=process.env.ERGONOMICS_OUTPUT||'reports/ergonomics/before';await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
const results=[];
for(const site of [{id:'ours',url:process.env.BASE_URL||'http://127.0.0.1:4310'},{id:'reference',url:'https://explorer.inkonchain.com'}].filter(site=>!process.env.ERGONOMICS_SITE||site.id===process.env.ERGONOMICS_SITE)){
 for(const width of [390,1440]){
  const context=await browser.newContext({viewport:{width,height:900},colorScheme:'dark',isMobile:width<500,hasTouch:width<500});
  await context.addInitScript(()=>localStorage.setItem('ink-theme','dark'));
  const page=await context.newPage();
  for(const path of ['/','/txs','/blocks','/stats']){
   const id=`${site.id}-${width}-${path.slice(1)||'home'}`;
   try{
    await page.goto(site.url+path,{waitUntil:'domcontentloaded',timeout:45000});
    await page.waitForTimeout(2500);await page.evaluate(()=>document.fonts.ready);
    await page.screenshot({path:`${output}/${id}.png`,fullPage:false});
    if(path==='/')await page.screenshot({path:`${output}/${id}-full.png`,fullPage:true});
    results.push({id,url:page.url(),title:await page.title(),text:(await page.locator('body').innerText()).slice(0,22000)});
   }catch(error){results.push({id,error:String(error)});}
   await writeFile(`${output}/results.json`,JSON.stringify(results,null,2));
  }
  await context.close();
 }
}
await browser.close();console.log(JSON.stringify(results.map(({text,...r})=>r)));
