import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4321',out=process.env.SELECT_OUTPUT||'reports/select-controls/browser';
const results=[],axeSource=await readFile('node_modules/axe-core/axe.min.js','utf8');await mkdir(out,{recursive:true});
const routes=[['blocks','.ledger-filters'],['stats','.stats-filter-bar'],['pools','.pool-filter-grid'],['name-services','.explorer-search'],['contract-verification','.explorer-form']];
for(const[engine,launcher]of Object.entries({chromium,firefox,webkit}).filter(([name])=>!process.env.SELECT_ENGINES||process.env.SELECT_ENGINES.split(',').includes(name))){
 const minFont=Number(process.env.SELECT_MIN_FONT)||0;
 const browser=await launcher.launch(engine==='chromium'?{args:['--no-sandbox']}:engine==='firefox'&&minFont?{firefoxUserPrefs:{'font.minimum-size.x-western':minFont,'font.minimum-size.ar':minFont}}:{});
 try{for(const width of(process.env.SELECT_WIDTHS||'320,1440').split(',').map(Number))for(const locale of(process.env.SELECT_LOCALES||'fr,ar').split(','))for(const theme of(process.env.SELECT_THEMES||'light,dark').split(',')){
  const prefix=locale==='ar'?'/testnet':'',context=await browser.newContext({viewport:{width,height:950},colorScheme:theme}),page=await context.newPage();
  await context.routeWebSocket(/\/api\/live$/,ws=>ws.close());
  await context.route('**/api/**',r=>{
   const path=new URL(r.request().url()).pathname;
   if(path.endsWith('/stats/lines'))return r.fulfill({json:{sections:[]}});
   if(path.endsWith('/verification/config'))return r.fulfill({json:{verification_options:['standard-input','multi-part'],solidity_evm_versions:['default','paris'],solidity_compiler_versions:['v0.8.30+commit.73712a01'],license_types:{none:1,mit:2}}});
   if(path.endsWith('/names/protocols'))return r.fulfill({json:{items:[{id:'ens',title:'ENS'},{id:'basenames',title:'Basenames'}]}});
   return r.fulfill({status:503,json:{error:'Fixture unavailable'}});
  });
  for(const[path,scope]of routes.filter(([path])=>!process.env.SELECT_ROUTES||process.env.SELECT_ROUTES.split(',').includes(path))){
   const row={engine,width,locale,theme,prefix,path,minFont,passed:false};
   try{
    await page.goto(base+prefix+'/'+path+'?lang='+locale,{waitUntil:'domcontentloaded'});
    if(path==='pools'&&width===320)await page.locator('.pool-filter-toggle').click();
    const container=page.locator(scope);await container.waitFor();await page.waitForFunction(()=>document.fonts.status==='loaded');
    const controls=container.locator('select:visible');assert(await controls.count()>0);
    const metrics=await controls.evaluateAll(nodes=>nodes.map(el=>{
     const style=getComputedStyle(el),box=el.getBoundingClientRect(),swatch=document.createElement('span');swatch.style.color='var(--surface-field)';document.body.append(swatch);const expected=getComputedStyle(swatch).color;swatch.remove();
     return{appearance:style.appearance,bg:style.backgroundColor,expected,image:style.backgroundImage,pos:style.backgroundPositionX,padding:style.paddingInlineEnd,height:box.height,left:box.left,right:box.right};
    }));
    for(const m of metrics){assert.equal(m.appearance,'none');assert.equal(m.bg,path==='pools'?'rgba(0, 0, 0, 0)':m.expected);assert(m.image.includes('/brand/select-chevron.svg'));assert.equal(m.pos,path==='pools'?(locale==='ar'?'0px':'100%'):(locale==='ar'?'12px':'calc(100% - 12px)'));assert(parseFloat(m.padding)>=(path==='pools'?28:40));assert(m.height>=44&&m.left>=0&&m.right<=width+1,JSON.stringify(m));}
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    await page.keyboard.press('Tab');await controls.first().focus();assert.equal(await controls.first().evaluate(el=>getComputedStyle(el.closest('.pool-filter-grid')?el.closest('label'):el).outlineStyle),'solid');
    if(path==='blocks'){
     await controls.first().selectOption('reorg');assert.equal(new URL(page.url()).searchParams.get('type'),'reorg');await page.locator('.block-kind-help .info-button').click();await page.locator('.info-body').waitFor();await page.keyboard.press('Escape');await controls.first().selectOption('block');assert.equal(new URL(page.url()).searchParams.get('type'),null);
    }else if(path==='stats'){
     if(width===320){await container.locator('.stats-category-select select').selectOption('');assert.equal(new URL(page.url()).searchParams.get('category'),'');}
    }else if(path==='pools'){
     await controls.first().selectOption('liquidity');assert.equal(new URL(page.url()).searchParams.get('sort'),'liquidity');
    }else if(path==='name-services'){
     await controls.first().selectOption('ens');assert.equal(await controls.first().inputValue(),'ens');
    }else if(path==='contract-verification'){
     await controls.first().selectOption('multi-part');assert.equal(await controls.first().inputValue(),'multi-part');assert.equal(await container.locator('select:visible').count(),4);
    }
    if(width===320){await container.scrollIntoViewIfNeeded();await container.screenshot({path:`${out}/${engine}-${locale}-${theme}-${path}.png`});}
    if(locale==='fr'&&theme==='light'&&width===320){await page.evaluate(axeSource);const violations=await page.evaluate(async scope=>(await axe.run(document.querySelector(scope),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),scope);assert.deepEqual(violations,[]);}
    if(['stats','blocks','pools'].includes(path)){
     const clipped=await controls.evaluateAll(nodes=>nodes.filter(el=>{const s=getComputedStyle(el),c=document.createElement('canvas').getContext('2d');c.font=s.font;return c.measureText(el.selectedOptions[0]?.textContent||'').width>el.clientWidth-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight)+1;}).map(el=>el.selectedOptions[0]?.textContent));assert.deepEqual(clipped,[], 'Selected filter text must fit');
    }
    row.passed=true;
   }catch(e){row.error=e.stack;await page.screenshot({path:`${out}/failure-${engine}-${locale}-${theme}-${width}-${path}.png`}).catch(()=>{});}
   results.push(row);console.log(JSON.stringify(row));await writeFile(out+'/results.json',JSON.stringify({base,complete:false,results},null,2));
  }
  // Native arrows must remain visible in forced color mode, which can suppress images.
  if(engine==='chromium'&&locale==='fr'&&theme==='light'){
   await page.emulateMedia({forcedColors:'active'});await page.goto(base+'/blocks?lang=fr');const s=page.locator('.ledger-filters select');await s.waitFor();assert.equal(await s.evaluate(el=>getComputedStyle(el).appearance),'auto');assert.equal(await s.evaluate(el=>getComputedStyle(el).backgroundImage),'none');
   results.push({engine,width,stage:'forced colors',passed:true});
  }
  await context.close();
 }}finally{await browser.close();}
}
await writeFile(out+'/results.json',JSON.stringify({base,complete:true,passed:results.every(r=>r.passed),mockedApi:true,physicalDeviceTest:false,results},null,2));if(results.some(r=>!r.passed))process.exitCode=1;
