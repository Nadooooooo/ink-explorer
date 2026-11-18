import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
import {createServer} from 'vite';
import {mkdir,realpath,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const out=path.resolve(process.env.LINK_MEMO_OUTPUT||'reports/navigation/link-memo');await mkdir(out,{recursive:true});
const harness=`
import React,{useState,useMemo} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {ExplorerLink,ExplorerNavigationProvider} from '/src/ExplorerLink.tsx';
window.React=React;
const data={hrefCalls:[],navigations:[],onNavigate:0,onClick:0,native:[]};let update;
function Fixture(){
 const [state,setState]=useState({to:'/blocks',locale:'en',network:'mainnet',version:0,tick:0,disabled:false,noProvider:false,prevent:false});
 update=patch=>flushSync(()=>setState(previous=>({...previous,...patch})));
 const navigation=useMemo(()=>({href:to=>{data.hrefCalls.push({to,locale:state.locale,network:state.network,version:state.version});return(state.network==='sepolia'?'/testnet':'')+'/'+state.locale+to;},navigate:to=>data.navigations.push(to)}),[state.locale,state.network,state.version]);
 const link=React.createElement(ExplorerLink,{id:'subject',to:state.to,disabled:state.disabled,target:state.target,download:state.download,className:'fixture-link',title:'Fixture destination',onClick:event=>{data.onClick++;if(state.prevent)event.preventDefault();},onNavigate:()=>data.onNavigate++},'Destination '+state.tick);
 return state.noProvider?link:React.createElement(ExplorerNavigationProvider,{value:navigation},link);
}
document.addEventListener('click',event=>{if(event.target.closest('#subject')){data.native.push({prevented:event.defaultPrevented,button:event.button,ctrl:event.ctrlKey,meta:event.metaKey,shift:event.shiftKey,alt:event.altKey});event.preventDefault();}});
flushSync(()=>createRoot(document.getElementById('mount')).render(React.createElement(Fixture)));
window.probe={data,update:patch=>update(patch),reset:()=>{data.navigations=[];data.onNavigate=0;data.onClick=0;data.native=[];}};
`;
// This fixture serves the actual component with React; it never starts the product server.
const server=await createServer({root,configFile:false,cacheDir:path.join(out,'.vite'),optimizeDeps:{entries:[],include:['react','react-dom','react-dom/client','react/jsx-runtime']},server:{host:'127.0.0.1',port:0,fs:{allow:[root,out,await realpath(path.join(root,'node_modules'))]}},plugins:[{
  name:'explorer-link-fixture',
  resolveId(id){if(id==='virtual:explorer-link-fixture')return '\0explorer-link-fixture';},
  load(id){if(id==='\0explorer-link-fixture')return harness;},
  configureServer(instance){instance.middlewares.use('/__link-memo',(_request,response)=>{response.setHeader('content-type','text/html');response.end('<!doctype html><html><head><meta charset="utf-8"></head><body><div id="mount"></div><script type="module" src="/@id/virtual:explorer-link-fixture"></script></body></html>');});},
}]});
await server.listen();const base=`http://127.0.0.1:${server.httpServer.address().port}`,results=[];
try{for(const[engine,launcher]of Object.entries({chromium,firefox,webkit})){
  const browser=await launcher.launch(engine==='chromium'?{args:['--no-sandbox']}:{});
  try{
    const page=await browser.newPage(),errors=[],row={engine,passed:false};page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));
    const update=patch=>page.evaluate(patch=>window.probe.update(patch),patch),calls=()=>page.evaluate(()=>window.probe.data.hrefCalls.length),href=()=>page.locator('#subject').getAttribute('href');
    try{
      await page.goto(base+'/__link-memo',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!window.probe);
      assert.equal(await calls(),1);assert.equal(await href(),'/en/blocks');
      for(let tick=1;tick<=20;tick++)await update({tick});
      assert.equal(await page.locator('#subject').innerText(),'Destination 20');assert.equal(await calls(),1,'Changing children while provider/destination stay stable must not regenerate href');
      const paths=['/address/0x'+'1'.repeat(40),'/tx/0x'+'a'.repeat(64)+'#logs','/apps?category=Tools#list'];
      for(const to of paths){const before=await calls();await update({to});assert.equal(await calls(),before+1);assert.equal(await href(),'/en'+to);}
      let before=await calls();await update({locale:'fr'});assert.equal(await calls(),before+1);assert.equal(await href(),'/fr'+paths.at(-1));
      before=await calls();await update({network:'sepolia'});assert.equal(await calls(),before+1);assert.equal(await href(),'/testnet/fr'+paths.at(-1));
      before=await calls();await update({version:1});assert.equal(await calls(),before+1,'Replacing the provider must invalidate even when its result is identical');
      before=await calls();await update({disabled:true});assert.equal(await calls(),before);assert.equal(await href(),null);assert.equal(await page.locator('#subject').getAttribute('aria-disabled'),'true');assert.equal(await page.locator('#subject').getAttribute('tabindex'),'-1');
      await update({to:'/blocks?type=reorg#selection'});assert.equal(await calls(),before);await update({disabled:false});assert.equal(await calls(),before+1);assert.equal(await href(),'/testnet/fr/blocks?type=reorg#selection');
      before=await calls();await update({to:undefined});assert.equal(await href(),null);assert.equal(await calls(),before);await update({to:'/blocks'});assert.equal(await calls(),before+1);
      before=await calls();await update({noProvider:true,to:'/blocks?type=reorg#selection'});assert.equal(await href(),'/blocks?type=reorg#selection');await update({tick:21});assert.equal(await calls(),before,'A native link outside the provider uses the raw destination');
      await update({noProvider:false,to:'/blocks',disabled:false,target:undefined,download:undefined,prevent:false});
      const click=async(patch,event,spa,prevented)=>{
        await update({disabled:false,target:undefined,download:undefined,prevent:false,...patch});await page.evaluate(()=>window.probe.reset());
        await page.locator('#subject').dispatchEvent('click',{button:0,...event});
        const data=await page.evaluate(()=>window.probe.data);
        assert.equal(data.onClick,1);assert.equal(data.navigations.length,spa?1:0);assert.equal(data.onNavigate,spa?1:0);assert.equal(data.native.length,1);assert.equal(data.native[0].prevented,prevented);
        if(spa)assert.deepEqual(data.navigations,['/blocks']);
      };
      await click({}, {},true,true);
      for(const modifier of['ctrlKey','metaKey','shiftKey','altKey'])await click({}, {[modifier]:true},false,false);
      await click({}, {button:1},false,false);await click({target:'_blank'}, {},false,false);await click({target:'_self'}, {},true,true);await click({download:'records.csv'}, {},false,false);
      await click({prevent:true}, {},false,true);await click({disabled:true}, {},false,true);await click({noProvider:true}, {},false,false);
      assert.equal(await page.locator('#subject').getAttribute('class'),'explorer-link fixture-link');assert.equal(await page.locator('#subject').getAttribute('title'),'Fixture destination');assert.deepEqual(errors,[]);
      Object.assign(row,{passed:true,stableChildRerenders:20,hrefCallsForStableRerenders:1,representativePaths:paths,nativeCases:12,checks:['stable provider/destination avoids repeat generation','to and provider identity invalidate','locale and network invalidate','disabled and absent destination remove href','provider-free native fallback','SPA, modifiers, middle click, target, download, prevented click and onNavigate preserved']});
    }catch(error){Object.assign(row,{error:error.stack,errors});await page.screenshot({path:path.join(out,engine+'-failure.png')}).catch(()=>{});}
    results.push(row);console.log(JSON.stringify(row));await writeFile(path.join(out,'results.json'),JSON.stringify({base,actualComponent:true,complete:false,results},null,2));await page.close();
  }finally{await browser.close();}
}}finally{await server.close();}
await writeFile(path.join(out,'results.json'),JSON.stringify({base,actualComponent:true,complete:true,passed:results.every(row=>row.passed),results},null,2));if(results.some(row=>!row.passed))process.exitCode=1;
