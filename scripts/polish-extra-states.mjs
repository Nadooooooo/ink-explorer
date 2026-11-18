import {chromium} from 'playwright-core';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4310',out='reports/polish/extra-states';await mkdir(out,{recursive:true});
const pools=await fetch(base+'/api/contract-info/pools').then(r=>r.json());
const address='/address/0x4200000000000000000000000000000000000006';
const paths=[['pool','/pools/'+pools.items[0].pool_id],['nft','/token/0x1b35d13a2E2528f192637F14B05f0Dc0e7dEB566/instance/545'],['source',address+'?tab=contract'],['read',address+'?tab=read'],['write',address+'?tab=write'],['filters','/txs?activity=filtered'],['missing','/missing-page'],['network','/network'],['apps','/apps']];
const axe=await readFile('node_modules/axe-core/axe.min.js','utf8'),browser=await chromium.launch({args:['--no-sandbox']}),results=[];
try{for(const theme of ['light','dark'])for(const width of [390,1440]){
 const context=await browser.newContext({viewport:{width,height:1000},colorScheme:theme,bypassCSP:true});
 for(const [name,path]of paths){const page=await context.newPage(),errors=[],row={name,path,theme,width,passed:false};page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(base+path+(path.includes('?')?'&':'?')+'lang=fr',{waitUntil:'domcontentloaded'});
  await page.locator('h1').waitFor();await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(1000);
  if(['source','read','write'].includes(name))await page.locator('.contract-source,.contract-interaction').first().waitFor({timeout:30000});
  if(['read','write'].includes(name))await page.locator('.contract-method summary').first().click();
  if(name==='nft' && await page.locator('.raw-metadata summary').count())await page.locator('.raw-metadata summary').click();
  await page.addScriptTag({content:axe});row.violations=await page.evaluate(async()=>(await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary})).slice(0,6)})));
  row.overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);row.errors=errors;row.passed=!row.overflow&&!errors.length&&!row.violations.length;
  await page.screenshot({path:`${out}/${name}-${width}-${theme}.png`,animations:'disabled'});
 }catch(error){row.error=error.message;}
 results.push(row);console.log(JSON.stringify(row));await writeFile(out+'/results.json',JSON.stringify({complete:false,results},null,2));await page.close();
 }await context.close();
}}finally{await browser.close();await writeFile(out+'/results.json',JSON.stringify({base,complete:true,passed:results.every(r=>r.passed),results},null,2));}
if(results.some(r=>!r.passed))process.exitCode=1;
