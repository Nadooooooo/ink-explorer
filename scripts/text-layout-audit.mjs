import {firefox} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'https://inkexplorer.xyz',out=process.env.TEXT_OUTPUT||'reports/text-layout/baseline';await mkdir(out,{recursive:true});
const b=await firefox.launch({firefoxUserPrefs:{'font.minimum-size.x-western':24}}),results=[];
try{for(const width of [390,1440])for(const route of ['','stats','stats/newTxns','gas-tracker','txs','blocks','accounts','tokens','pools','developers']){
 const p=await b.newPage({viewport:{width,height:1000},colorScheme:width===390?'dark':'light'}),r={width,route};
 try{
  await p.goto(base+'/'+route+'?lang=fr',{waitUntil:'domcontentloaded',timeout:30000});await p.locator('main').waitFor();await p.waitForTimeout(2000);await p.evaluate(()=>document.fonts.ready);
  r.metrics=await p.evaluate(()=>{
   const issues=[],walk=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
   let n;while(n=walk.nextNode()){
    const e=n.parentElement;if(!n.textContent.trim()||!(e instanceof HTMLElement)||e.closest('script,style,.sr-only,[aria-hidden=true]'))continue;
    const range=document.createRange();range.selectNodeContents(n);const boxes=[...range.getClientRects()].filter(r=>r.width&&r.height);if(!boxes.length)continue;
    for(let a=e;a&&a!==document.body;a=a.parentElement){const style=getComputedStyle(a);if(style.visibility==='hidden'||style.display==='none')break;const box=a.getBoundingClientRect();
     if(['hidden','clip'].includes(style.overflowX)||['hidden','clip'].includes(style.overflowY)){
      const clipped=boxes.some(r=>(['hidden','clip'].includes(style.overflowX)&&(r.left<box.left-2||r.right>box.right+2))||(['hidden','clip'].includes(style.overflowY)&&(r.top<box.top-2||r.bottom>box.bottom+2)));
      if(clipped){issues.push({text:n.textContent.trim().slice(0,65),element:e.tagName+'.'+e.className,container:a.tagName+'.'+a.className,visible:box.bottom>0&&box.top<innerHeight});break;}
     }
    }
   }
   return{overflow:document.documentElement.scrollWidth>innerWidth+1,scrollWidth:document.documentElement.scrollWidth,clippedText:issues.slice(0,30),buttons:[...document.querySelectorAll('main button')].filter(e=>e.getBoundingClientRect().width>0&&e.scrollHeight>e.clientHeight+2).map(e=>({text:e.textContent.slice(0,50),class:e.className,h:e.clientHeight,sh:e.scrollHeight})).slice(0,15)};
  });
  await p.screenshot({path:`${out}/${width}-${route.replaceAll('/','-')||'home'}.png`,fullPage:false});r.captured=true;
 }catch(e){r.error=e.message;}finally{await p.close();}results.push(r);console.log(JSON.stringify(r));await writeFile(out+'/results.json',JSON.stringify({base,complete:false,fontMinimum:24,results},null,2));
}}finally{await b.close();}
await writeFile(out+'/results.json',JSON.stringify({base,complete:true,fontMinimum:24,physicalDevices:false,results},null,2));
