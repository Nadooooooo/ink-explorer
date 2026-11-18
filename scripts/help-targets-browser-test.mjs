import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4310',out=process.env.HELP_TARGET_OUTPUT||'reports/touch-help/browser',baseline=process.env.HELP_TARGET_BASELINE==='1',results=[];
const widths=(process.env.HELP_TARGET_WIDTHS||'320,768,1440').split(',').map(Number),engines=(process.env.HELP_TARGET_ENGINES||'chromium,firefox,webkit').split(',');
const entities={mainnet:{block:58792075,token:'0x2D270e6886d130D724215A266106e6832161EAEd'},sepolia:{block:63287191,token:'0xFabab97dCE620294D2B0b0e46C68964e326300Ac'}};
await mkdir(out,{recursive:true});
for(const engine of engines){const browser=await({chromium,firefox,webkit})[engine].launch(engine==='chromium'?{args:['--no-sandbox']}:{});
 try{for(const prefix of(process.env.HELP_TARGET_MAIN_ONLY==='1'?['']:['','/testnet']))for(const width of widths){
  const entity=entities[prefix?'sepolia':'mainnet'],locale=process.env.HELP_TARGET_LOCALE||(width===768?'ar':width===1440?'en':'fr'),touch=process.env.HELP_TARGET_TOUCH==='1'||width<1440;
  const routes=[['home','/','.utilization-metric .info-button'],['gas','/gas-tracker','.gas-estimates-title .info-button'],['transactions','/txs','.transaction-summary .info-button'],['tokens','/tokens','.token-list-controls .info-button'],['accounts','/accounts','.ledger-heading-title .info-button'],['forks','/blocks?type=reorg','.block-kind-help .info-button'],['block','/block/'+entity.block,'.block-definitions .info-button'],['token','/token/'+entity.token,'.token-summary .info-button']];
  for(const [name,path,ready] of routes){
   if(process.env.HELP_TARGET_ROUTES&&!process.env.HELP_TARGET_ROUTES.split(',').includes(name))continue;
   const context=await browser.newContext({viewport:{width,height:900},hasTouch:touch,...(engine!=='firefox'?{isMobile:width<500}:{}),colorScheme:locale==='ar'?'dark':'light'}),page=await context.newPage(),errors=[],row={engine,prefix,width,locale,touch,name,baseline,passed:false,mockedApi:false};
   page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(25000);
   try{
    await page.goto(base+prefix+path+(path.includes('?')?'&':'?')+'lang='+locale,{waitUntil:'domcontentloaded'});await page.locator(ready).first().waitFor();await page.evaluate(()=>document.fonts.ready);
    const targets=page.locator('main .info-disclosure > .info-button:visible');row.targets=[];
    for(let index=0;index<await targets.count();index++){
     const target=targets.nth(index);await target.scrollIntoViewIfNeeded();
     const geometry=await target.evaluate(button=>{
      const b=button.getBoundingClientRect(),symbol=button.querySelector('svg').getBoundingClientRect(),visibleLabel=button.querySelector('.info-visible-label');
      let labelGeometry=null;
      if(visibleLabel){
       const range=document.createRange();range.selectNodeContents(visibleLabel);const rects=[...range.getClientRects()];
       labelGeometry={text:visibleLabel.textContent,lines:rects.length,contained:rects.every(r=>r.left>=b.left-1&&r.right<=b.right+1&&r.top>=b.top-1&&r.bottom<=b.bottom+1),overlapsIcon:rects.some(r=>Math.min(r.right,symbol.right)-Math.max(r.left,symbol.left)>1&&Math.min(r.bottom,symbol.bottom)-Math.max(r.top,symbol.top)>1)};
      }
      const container=button.closest('.metric,.gas-live-summary article,.stats-counters article,.stats-chart-card,.page-title-line,.ledger-heading-title,.gas-estimates-title,.block-kind-help,.definition-label-with-info,.token-list-controls,.token-table-head,.forked-block-state,.page-data-notice');
      const overlaps=[];
      const gauge=button.closest('.utilization-metric')?.querySelector('.utilization-gauge')?.getBoundingClientRect();
      const gaugeOverlap=gauge?Math.min(gauge.right,b.right)-Math.max(gauge.left,b.left)>.5&&Math.min(gauge.bottom,b.bottom)-Math.max(gauge.top,b.top)>.5:false;
      if(container){const walk=document.createTreeWalker(container,NodeFilter.SHOW_TEXT);let node;while(node=walk.nextNode()){
       if(!node.textContent.trim()||node.parentElement.closest('button,.info-disclosure,svg,[aria-hidden="true"],.sr-only,select,script'))continue;
       const range=document.createRange();range.selectNodeContents(node);
       for(const r of range.getClientRects())if(Math.min(r.right,b.right)-Math.max(r.left,b.left)>1&&Math.min(r.bottom,b.bottom)-Math.max(r.top,b.top)>1)overlaps.push(node.textContent.trim());
      }}
      const hit=[[b.left+2,b.top+b.height/2],[b.right-2,b.top+b.height/2],[b.left+b.width/2,b.top+2],[b.left+b.width/2,b.bottom-2]].map(([x,y])=>document.elementFromPoint(x,y)?.closest('button')===button);
      return{label:button.getAttribute('aria-label'),width:b.width,height:b.height,symbol:{width:symbol.width,height:symbol.height},labelGeometry,gaugeOverlap,overlaps,hit,context:container?.className};
     });row.targets.push(geometry);
     if(!baseline){assert(geometry.width>=(touch?44:32)-.1&&geometry.height>=(touch?44:32)-.1,`Small help target: ${geometry.label}`);assert(geometry.symbol.width===18&&geometry.symbol.height===18,'Help pictogram changed size');assert.deepEqual(geometry.overlaps,[],`Help target overlaps text: ${geometry.label}`);assert(geometry.hit.every(Boolean),`Help target is covered: ${geometry.label}`);
      if(geometry.labelGeometry){assert(geometry.labelGeometry.contained,'Visible help label is clipped');assert(!geometry.labelGeometry.overlapsIcon,'Visible help label overlaps its icon');}
      assert(!geometry.gaugeOverlap,'Help target overlaps the network gauge');
      const b=await target.boundingBox();if(touch)await page.touchscreen.tap(b.x+2,b.y+b.height/2);else await target.click();await page.locator('.info-floating').waitFor();const panel=await page.locator('.info-floating').boundingBox();assert(panel.x>=0&&panel.x+panel.width<=width+1&&panel.y>=0&&panel.y+panel.height<=901);await page.keyboard.press('Escape');await page.locator('.info-floating').waitFor({state:'hidden'});assert(await target.evaluate(e=>document.activeElement===e));
     }
    }
    if(name==='token'&&touch&&!baseline){
     row.metricRows=await page.locator('.token-summary .metric').evaluateAll(cards=>{
      const metrics=cards.map(card=>({card:card.getBoundingClientRect().toJSON(),value:card.querySelector(':scope > strong').getBoundingClientRect().toJSON()}));
      return[metrics.slice(0,2),metrics.slice(2,4)].map(pair=>({bottomDifference:Math.abs(pair[0].value.bottom-pair[1].value.bottom),gap:Math.max(pair[0].card.left,pair[1].card.left)-Math.min(pair[0].card.right,pair[1].card.right)}));
     });
     assert(row.metricRows.every(pair=>pair.bottomDifference<1&&pair.gap>=8),'Token values or card spacing are misaligned');
    }
    assert(row.targets.length>0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);
    await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`${out}/${engine}-${prefix?'sepolia':'mainnet'}-${width}-${locale}-${touch?'touch':'mouse'}-${name}.png`});row.passed=true;
   }catch(error){row.error=error.stack;await page.screenshot({path:`${out}/failure-${engine}-${prefix?'sepolia':'mainnet'}-${width}-${locale}-${name}.png`}).catch(()=>{});}
   finally{await context.close();}
   results.push(row);console.log(JSON.stringify(row));await writeFile(out+'/results.json',JSON.stringify({base,complete:false,results},null,2));
  }
 }}finally{await browser.close();}
}
await writeFile(out+'/results.json',JSON.stringify({base,complete:true,passed:results.every(r=>r.passed),physicalDeviceTest:false,results},null,2));if(results.some(r=>!r.passed))process.exitCode=1;
