import{chromium}from'playwright';import{readFile,mkdir,writeFile}from'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4310',output='reports/redesign/details';await mkdir(output,{recursive:true});const axe=await readFile('node_modules/axe-core/axe.min.js','utf8'),results=[];
const browser=await chromium.launch({args:['--no-sandbox']});
try{for(const prefix of ['', '/testnet']){
 const [blocks,transactions]=await Promise.all(['/blocks','/transactions'].map(path=>fetch(base+prefix+'/api/explorer'+path).then(r=>r.json())));
 const block=blocks.items[5] || blocks.items[0],tx=transactions.items[10] || transactions.items[0],address='0x4200000000000000000000000000000000000006';
 const paths=[`/block/${block.height}`,`/tx/${tx.hash}`,`/address/${address}`,`/token/${address}`];
 for(const theme of ['light','dark'])for(const width of [390,1440]){
  const context=await browser.newContext({viewport:{width,height:900},colorScheme:theme,bypassCSP:true});
  for(const path of paths){const row={prefix,path,theme,width,passed:false},page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
   try{await page.goto(base+prefix+path,{waitUntil:'domcontentloaded'});await page.locator('h1').waitFor();await page.locator('.definitions,.address-summary,.token-summary,.metric-grid').first().waitFor();await page.evaluate(()=>document.fonts.ready);await page.addScriptTag({content:axe});row.violations=await page.evaluate(async()=> (await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary})).slice(0,10)})));row.overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);row.errors=errors;row.passed=!row.violations.length&&!row.overflow&&!errors.length;if(!row.passed)await page.screenshot({path:`${output}/${prefix?'testnet':'mainnet'}-${path.split('/')[1]}-${theme}-${width}.png`});}
   catch(error){row.error=error.message;}results.push(row);console.log(JSON.stringify(row));await page.close();
  }await context.close();
 }
}}finally{await browser.close();await writeFile(output+'/results.json',JSON.stringify({complete:true,passed:results.every(r=>r.passed),results},null,2));}
if(results.some(r=>!r.passed))process.exitCode=1;
