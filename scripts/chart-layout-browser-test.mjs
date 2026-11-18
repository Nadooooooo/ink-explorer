import assert from 'node:assert/strict';
import * as playwright from 'playwright-core';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const freshHeaders=()=>({date:new Date().toUTCString(),'x-ink-data-status':'fresh','x-ink-data-fetched-at':new Date().toISOString()});
const base=process.env.BASE_URL||'http://127.0.0.1:4310',out=process.env.CHART_LAYOUT_OUTPUT||'reports/chart-layout/browser';
await mkdir(out,{recursive:true});
const axe=await readFile('node_modules/axe-core/axe.min.js','utf8'),results=[];
const profiles=process.env.CHART_LAYOUT_LOCALES
 ? process.env.CHART_LAYOUT_LOCALES.split(',').map(locale=>({width:320,locale,theme:'light',timezoneId:'America/Los_Angeles'}))
 : [{width:320,locale:'fr',theme:'light',timezoneId:'America/Los_Angeles'},{width:390,locale:'ar',theme:'dark',timezoneId:'Asia/Tokyo'},{width:768,locale:'en',theme:'dark',timezoneId:'Europe/Paris'},{width:1440,locale:'en',theme:'light',timezoneId:'UTC'}];
for(const engine of (process.env.CHART_LAYOUT_ENGINES||'chromium,firefox,webkit').split(',')){
 const browser=await playwright[engine].launch(engine==='chromium'?{args:['--no-sandbox']}:{});
 try{for(const profile of profiles){
  const context=await browser.newContext({viewport:{width:profile.width,height:1000},hasTouch:profile.width<1000,bypassCSP:true,timezoneId:profile.timezoneId}),page=await context.newPage(),row={engine,...profile,checks:[],passed:false},errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.addInitScript(theme=>localStorage.setItem('ink-theme',theme),profile.theme);
   let metric='newAccounts',values=['641','653','1791','1100','1600','950','1010'];
   const info=()=>({id:metric,title:metric==='averageTxnFee'?'Average transaction fee':'New accounts',description:'Axis and interaction fixture',units:metric==='averageTxnFee'?'ETH':null,resolutions:['DAY','WEEK']});
   await page.route('**/api/stats/lines',r=>r.fulfill({headers:freshHeaders(),json:{sections:[{id:'accounts',title:'Accounts',charts:[info()]}]}}));
   await page.route(/\/api\/stats\/lines\/(newAccounts|averageTxnFee)\?/,r=>r.fulfill({headers:freshHeaders(),json:{info:info(),chart:values.map((value,index)=>({date:new Date(Date.now()-(values.length-1-index)*86400000).toISOString().slice(0,10),value,is_approximate:index===values.length-1}))}}));
   for(const scenario of (process.env.CHART_LAYOUT_SCENARIOS||'normal,zero,tiny,fee,gap').split(',')){
    if(scenario==='zero')values=Array(7).fill('0');
    if(scenario==='tiny'){metric='averageTxnFee';values=['1e-18','2e-18','3e-18','0','4e-18','1e-18','2e-18'];}
    if(scenario==='fee'){metric='averageTxnFee';values=Array(7).fill('0.000000239193511284625');}
    if(scenario==='gap'){metric='newAccounts';values=['100',null,null,'200',null,null,'300'];}
    await page.goto(`${base}/stats/${metric}?lang=${profile.locale}`,{waitUntil:'domcontentloaded'});
    await page.locator('.stat-chart[aria-busy=false] .scaled-chart').waitFor();await page.evaluate(()=>document.fonts.ready);
    const chart=page.locator('.scaled-chart .interactive-chart');await chart.scrollIntoViewIfNeeded();
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const plot=await chart.boundingBox();assert(plot.height>=(profile.width<=760?279:359));assert(plot.width>130);
    const geometry=await page.locator('.scaled-chart').evaluate(root=>{
      const box=el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}};
      return {plot:box(root.querySelector('.interactive-chart')),x:[...root.querySelectorAll('.chart-x-axis span')].map(el=>({...box(el),text:el.textContent})),y:[...root.querySelectorAll('.chart-y-tick')].map(el=>({...box(el),text:el.textContent,value:Number(el.dataset.value)}))};
    });
    for(const tick of geometry.y)assert(tick.left>=0 && tick.right<geometry.plot.left && tick.top>=geometry.plot.top-1 && tick.bottom<=geometry.plot.bottom+1,'Y labels fit next to the plot');
    for(let index=0;index<geometry.x.length;index++){const tick=geometry.x[index];assert(tick.left>=-1 && tick.right<=profile.width+1);if(index)assert(tick.left>=geometry.x[index-1].right,'Date labels do not collide');}
    assert.equal(new Set(geometry.y.map(tick=>tick.text)).size,geometry.y.length,'Axis labels distinguish tick values');
    const valueLines=await page.locator('.stat-chart-value').evaluate(element=>{const range=document.createRange();range.selectNodeContents(element);return [...range.getClientRects()].map(rect=>rect.top)});
    assert(valueLines.every(top=>Math.abs(top-valueLines[0])<1),'Current value and unit stay together on one line');
    const startDate=new Date(Date.now()-(values.length-1)*86400000).toISOString().slice(0,10);
    const firstTitle=await page.locator('.chart-x-axis span').first().getAttribute('title');
    assert.equal(firstTitle,new Date(startDate).toLocaleDateString(profile.locale,{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}),'Calendar dates stay on their UTC aggregation day in every time zone');
    await chart.focus();await page.keyboard.press('End');await page.locator('.chart-tooltip').waitFor();assert((await page.locator('.chart-tooltip strong').innerText()).includes('≈'));
    const tip=await page.locator('.chart-tooltip').boundingBox();assert(tip.x>=-1 && tip.x+tip.width<=profile.width+1);
    if(scenario==='gap'){await page.keyboard.press('ArrowLeft');assert.equal(await page.locator('.chart-tooltip strong').innerText(),'N/A');assert.equal(await page.locator('.chart-isolated-point').count(),3);}
    await page.keyboard.press('Escape');assert.equal(await page.locator('.chart-tooltip').count(),0);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    if(scenario==='normal'){await page.evaluate(axe);row.violations=await page.evaluate(async()=>(await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})));assert.deepEqual(row.violations,[]);}
    await page.evaluate(()=>{document.activeElement?.blur();scrollTo(0,0)});await page.screenshot({path:`${out}/${engine}-${profile.locale}-${profile.width}-${scenario}.png`});row.checks.push({scenario,plotWidth:plot.width,plotHeight:plot.height,ticks:geometry.y.map(tick=>({value:tick.value,label:tick.text}))});
   }
   assert.deepEqual(errors,[]);row.passed=true;
  }catch(error){row.error=error.stack;}finally{await context.close();}
  results.push(row);console.log(JSON.stringify({engine,...profile,passed:row.passed,error:row.error}));await writeFile(out+'/results.json',JSON.stringify({base,complete:false,results},null,2));
 }}finally{await browser.close();}
}
await writeFile(out+'/results.json',JSON.stringify({base,complete:true,passed:results.every(r=>r.passed),results},null,2));if(results.some(r=>!r.passed))process.exitCode=1;
