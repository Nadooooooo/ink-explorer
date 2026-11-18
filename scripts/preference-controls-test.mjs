import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright-core';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4310',out=process.env.PREFERENCES_OUTPUT||'reports/identity-controls/preferences';await mkdir(out,{recursive:true});const results=[],locales=['en','fr','es','pt','ru','zh','ja','hi','ar','bn'];const axe=await readFile('node_modules/axe-core/axe.min.js','utf8');
for(const[engine,launcher]of Object.entries({chromium,firefox,webkit})){
 const browser=await launcher.launch(engine==='chromium'?{args:['--no-sandbox']}:{});
 try{for(const width of[320,1440])for(const[li,locale]of locales.entries()){
  const theme=(li+(width===320?1:0))%2?'dark':'light',prefix=li%2?'/testnet':'';
  const context=await browser.newContext({viewport:{width,height:950},colorScheme:theme,bypassCSP:true,hasTouch:width===320}),page=await context.newPage(),row={engine,width,locale,theme,prefix,passed:false},errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.routeWebSocket(/\/api\/live$/,ws=>ws.close());await context.route('**/api/live/snapshot',r=>r.fulfill({status:503,json:{error:'Fixture offline'}}));await context.route('**/api/explorer/**',r=>r.fulfill({json:{items:[],next_page_params:null}}));
  try{
   await page.goto(base+prefix+'/blocks?lang='+locale,{waitUntil:'domcontentloaded'});await page.locator('.ledger-filters').waitFor();if(width===320)await page.locator('.drawer-trigger').tap();
   const container=page.locator(width===320?'.drawer-preferences':'.utility-settings'),label=container.locator('.language-picker'),select=label.locator('select');await label.waitFor();await page.evaluate(()=>document.fonts.ready);assert.equal(await select.inputValue(),locale);
   const metrics=await label.evaluate(el=>{
    const select=el.querySelector('select'),style=getComputedStyle(select),box=el.getBoundingClientRect(),arrow=el.querySelector('.language-chevron').getBoundingClientRect(),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');ctx.font=style.font;
    const swatch=document.createElement('span');swatch.style.color='var(--surface-field)';document.body.append(swatch);const expected=getComputedStyle(swatch).color;swatch.remove();
    return{background:getComputedStyle(el).backgroundColor,expected,selectBackground:style.backgroundColor,appearance:style.appearance,labelHeight:box.height,textWidth:ctx.measureText(select.selectedOptions[0].textContent).width,available:select.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight),arrowInside:arrow.left>=box.left&&arrow.right<=box.right&&arrow.top>=box.top&&arrow.bottom<=box.bottom};
   });
   assert.equal(metrics.background,metrics.expected);assert.equal(metrics.selectBackground,'rgba(0, 0, 0, 0)');assert.equal(metrics.appearance,'none');assert(metrics.labelHeight>=(width===320?44:38));assert(metrics.arrowInside);assert(metrics.textWidth<=metrics.available+1,JSON.stringify(metrics));
   if(['fr','ar'].includes(locale)&&engine==='chromium'){await page.addScriptTag({content:axe});const violations=await page.evaluate(async()=> (await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})));assert.deepEqual(violations,[]);await page.screenshot({path:`${out}/${engine}-${locale}-${width}-${theme}.png`});}
   const next=locale==='fr'?'ar':'fr';await select.selectOption(next);await page.waitForFunction(next=>document.documentElement.lang===next,next);assert.equal(new URL(page.url()).pathname,prefix+'/blocks');assert.equal(new URL(page.url()).searchParams.get('lang'),next);assert.equal(await select.inputValue(),next);
   await container.locator('.theme-control select').selectOption(theme==='light'?'dark':'light');await page.waitForFunction(t=>document.documentElement.dataset.theme===t,theme==='light'?'dark':'light');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);Object.assign(row,{passed:true,metrics});
  }catch(e){row.error=e.stack;await page.screenshot({path:`${out}/failure-${engine}-${locale}-${width}.png`}).catch(()=>{});}finally{await context.close();}
  results.push(row);console.log(JSON.stringify(row));await writeFile(out+'/results.json',JSON.stringify({base,complete:false,results},null,2));
 }}finally{await browser.close();}
}
await writeFile(out+'/results.json',JSON.stringify({base,complete:true,passed:results.every(r=>r.passed),physicalDeviceTest:false,results},null,2));if(results.some(r=>!r.passed))process.exitCode=1;
