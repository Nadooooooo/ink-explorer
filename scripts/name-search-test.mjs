import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright-core';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4322',out=process.env.NAMES_OUTPUT||'reports/name-search/browser',results=[];
const address='0x'+'12'.repeat(20),axeSource=await readFile('node_modules/axe-core/axe.min.js','utf8');await mkdir(out,{recursive:true});
for(const[engine,launcher]of Object.entries({chromium,firefox,webkit}).filter(([name])=>!process.env.NAMES_ENGINES||process.env.NAMES_ENGINES.split(',').includes(name))){
 const b=await launcher.launch(engine==='chromium'?{args:['--no-sandbox']}:{});
 try{for(const prefix of['','/testnet'])for(const width of[320,1440]){
  const c=await b.newContext({viewport:{width,height:950},colorScheme:width===320?'dark':'light'}),p=await c.newPage(),row={engine,prefix,width,passed:false},requests=[],errors=[];let release,fail=true;
  p.on('pageerror',e=>errors.push(e.message));
  await c.routeWebSocket(/\/api\/live$/,ws=>ws.close());
  await c.route('**/api/**',async r=>{
   const u=new URL(r.request().url());
   if(u.pathname.endsWith('/names/protocols'))return r.fulfill({json:{items:[{id:'ens',title:'ENS'},{id:'inknames',title:'Ink names'}]}});
   if(/\/names\/(?:domains|addresses):lookup$/.test(u.pathname)){
    requests.push({path:u.pathname,params:Object.fromEntries(u.searchParams),method:r.request().method()});
    const name=u.searchParams.get('name')||'address-result.eth';
    if(name==='delayed.eth')await new Promise(resolve=>{release=resolve;});
    if(name==='retry.eth'&&fail)return r.fulfill({status:503,json:{error:'Fixture unavailable'}});
    return r.fulfill({json:{items:[{name,protocol:{id:'ens',short_name:'ENS'},resolved_address:address,registration_date:'2024-01-01T00:00:00Z',expiry_date:'2027-01-01T00:00:00Z'}],next_page_params:null}}).catch(()=>{});
   }
   return r.fulfill({status:503,json:{error:'Fixture unavailable'}});
  });
  try{
   await p.goto(base+prefix+'/name-services?lang=fr',{waitUntil:'domcontentloaded'});
   const form=p.locator('.explorer-search'),input=form.locator('input'),select=form.locator('select'),submit=form.locator('button[type="submit"]'),list=p.locator('.explorer-list');await input.waitFor();await select.locator('option[value="inknames"]').waitFor({state:'attached'});
   assert.equal(await list.count(),0);assert.equal(await p.locator('main [role="alert"]').count(),0);assert(await submit.isDisabled());assert.equal(requests.length,0);
   await select.selectOption('inknames');await input.fill('   ');assert(await submit.isDisabled());await input.press('Enter');assert.equal(requests.length,0);assert.equal(await list.count(),0);
   await input.fill('  example.eth  ');await p.evaluate(axeSource);assert.deepEqual(await p.evaluate(async()=>(await axe.run('.explorer-search',{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>v.id)),[]);await input.press('Enter');await list.getByText('example.eth',{exact:true}).waitFor();assert.equal(await input.inputValue(),'example.eth');
   let last=requests.at(-1);assert.equal(last.params.name,'example.eth');assert.equal(last.params.protocols,'inknames');assert.equal(last.method,'GET');assert(last.path.startsWith(prefix+'/api/'));
   const identity=list.locator(`a[href="${prefix}/address/${address}?lang=fr"]`);assert.equal(await identity.count(),1);const domain=list.locator('a[href*="/name-services/domains/"]');assert((await domain.getAttribute('href')).includes('lang=fr'));assert((await domain.getAttribute('href')).includes('protocol_id=ens'));
   await select.selectOption('ens');await p.waitForFunction(()=>document.querySelector('.explorer-list')?.getAttribute('aria-busy')==='false');assert.equal(requests.at(-1).params.protocols,'ens');
   await input.fill(address);await submit.click();await list.getByText('address-result.eth',{exact:true}).waitFor();last=requests.at(-1);assert(last.path.endsWith('/addresses:lookup'));assert.equal(last.params.address,address);assert.equal(last.params.resolved_to,'true');assert.equal(last.params.owned_by,'true');assert(!last.params.name);
   await input.fill('delayed.eth');await input.press('Enter');await p.waitForFunction(()=>document.querySelector('.explorer-list')?.getAttribute('aria-busy')==='true');
   while(!release)await new Promise(r=>setTimeout(r,10));await input.fill('');assert.equal(await list.count(),0);release();await p.waitForTimeout(50);assert.equal(await list.count(),0);assert.equal(await p.getByText('delayed.eth',{exact:true}).count(),0);
   await input.fill('retry.eth');await input.press('Enter');await list.locator('[role="alert"]').waitFor();fail=false;await list.locator('[role="alert"] button').click();await list.getByText('retry.eth',{exact:true}).waitFor();
   await input.fill('');assert.equal(await list.count(),0);assert.equal(await p.locator('main [role="alert"]').count(),0);assert(requests.every(r=>r.params.name?.trim()||r.params.address));assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);
   await p.evaluate(axeSource);const violations=await p.evaluate(async()=>(await axe.run('.explorer-search',{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})));assert.deepEqual(violations,[]);
   await p.screenshot({path:`${out}/${engine}-${prefix?'sepolia':'mainnet'}-${width}.png`});row.passed=true;row.lookupCount=requests.length;
  }catch(e){row.error=e.stack;row.requests=requests;await p.screenshot({path:`${out}/failure-${engine}-${prefix?'sepolia':'mainnet'}-${width}.png`}).catch(()=>{});}finally{release?.();await c.close();}
  results.push(row);console.log(JSON.stringify(row));await writeFile(out+'/results.json',JSON.stringify({base,complete:false,results},null,2));
 }}finally{await b.close();}
}
await writeFile(out+'/results.json',JSON.stringify({base,complete:true,passed:results.every(r=>r.passed),mockedApi:true,physicalDeviceTest:false,results},null,2));if(results.some(r=>!r.passed))process.exitCode=1;
