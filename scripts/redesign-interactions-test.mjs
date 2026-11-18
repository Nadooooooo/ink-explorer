import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4310',output='reports/redesign/interactions',results=[];
await mkdir(output,{recursive:true});const browser=await chromium.launch({args:['--no-sandbox']});
const h=n=>'0x'+n.toString(16).padStart(64,'0'),a=n=>'0x'+n.toString(16).padStart(40,'0');
try{for(const prefix of ['', '/testnet']){
 const chainId=prefix?763373:57073;
 const indexed=await fetch(base+prefix+'/api/explorer/transactions').then(r=>r.json());const tx=indexed.items[10]||indexed.items[0];
 async function check(name,run){const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));const row={prefix,name,passed:false};page.setDefaultTimeout(15000);console.log('START',prefix,name);try{await run(page,context);assert.deepEqual(errors,[]);row.passed=true;}catch(error){row.error=error.message;await page.screenshot({path:`${output}/${prefix?'testnet':'mainnet'}-${name}.png`});}finally{await context.close();results.push(row);console.log(JSON.stringify(row));await writeFile(output+'/results.json',JSON.stringify({complete:false,results},null,2));}}
 await check('transaction-indexing',async(page,context)=>{
  let calls=0;await context.route(`**${prefix}/api/explorer/transactions/${tx.hash}`,async route=>{calls++;assert.match(route.request().headers().accept,/vnd.ink.transaction-indexing/);await route.fulfill({status:calls===1?202:200,json:calls===1?{code:'TRANSACTION_INDEXING',chainId,transaction:{hash:tx.hash,blockNumber:String(tx.block_number),blockHash:tx.block_hash || h(123)},retryAfterMs:1000}:tx});});
  await page.goto(base+prefix+'/tx/'+tx.hash,{waitUntil:'domcontentloaded'});await page.locator('.transaction-indexing-notice').waitFor();assert.equal(await page.locator('.definitions').count(),0);await page.locator('.definitions').waitFor();assert.ok(calls>=2);
 });
 await check('transfer-filters-and-identities',async(page,context)=>{
  const requests=[];const types=[{is_contract:true},{is_contract:true,is_verified:true},{is_contract:true,proxy_type:'eip1967'},{is_contract:true,is_verified:true,proxy_type:'eip1967'}];
  const items=types.map((entity,i)=>({transaction_hash:h(i+10),hash:h(i+10),token_transfer_index:i,block_number:123,timestamp:new Date().toISOString(),method:'transfer',from:{hash:a(i+1),...entity},to:{hash:a(9)},token:{address_hash:a(100),symbol:'NFT',name:'Test collection',type:'ERC-721',decimals:'0'},total:{token_id:String(i+1),token_instance:{image_url:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aR00AAAAASUVORK5CYII='}}}));
  await context.route(`**${prefix}/api/explorer/token-transfers*`,r=>{requests.push(new URL(r.request().url()));return r.fulfill({json:{items,next_page_params:null}});});
  await context.route(`**${prefix}/api/explorer/advanced-filters*`,r=>{requests.push(new URL(r.request().url()));return r.fulfill({json:{items,next_page_params:null}});});
  await page.goto(base+prefix+'/token-transfers',{waitUntil:'domcontentloaded'});await page.locator('.data-ledger tbody tr').first().waitFor();
  for(const kind of ['contract','verified-contract','proxy','verified-proxy'])assert.equal(await page.locator(`[data-contract-kind="${kind}"]`).count(),1);
  assert.equal(await page.locator('.nft-thumbnail img').count(),4);
  await page.getByRole('button',{name:'Filters',exact:true}).click();const selected=page.waitForResponse(r=>r.url().includes('token-transfers?type=ERC-721'));await page.getByLabel('Token standard').selectOption('ERC-721');await selected;
  await page.locator('.transfer-filters input').nth(0).fill(a(1));await page.locator('.transfer-filters input').nth(2).fill('0xa9059cbb');
  const advanced=page.waitForResponse(r=>r.url().includes('/advanced-filters?'));await page.locator('.transfer-filters button[type=submit]').click();await advanced;
  assert.equal(requests.at(-1).searchParams.get('transaction_types'),'ERC-721');assert.equal(requests.at(-1).searchParams.get('from_address_hashes_to_include'),a(1));assert.equal(requests.at(-1).searchParams.get('methods'),'0xa9059cbb');
 });
 await check('live-reading-freeze',async(page,context)=>{
  let socket,sequence=1;const height=90000000;
  const frame=n=>({type:'snapshot',protocol:'ink-observer.live.v1',sequence:sequence++,sentAt:new Date().toISOString(),network:{chainId,expectedChainId:chainId,online:true,synced:true,head:n,stale:false},block:{height:n,hash:h(n),timestamp:new Date().toISOString()},blocks:[{height:n,hash:h(n),timestamp:new Date().toISOString()}],transactions:[{...tx,hash:h(n+100),block_hash:h(n),block_number:n,timestamp:new Date().toISOString(),_live:true}]});
  await context.route(`**${prefix}/api/live/config`,r=>r.fulfill({json:{url:`ws://127.0.0.1:4310${prefix}/api/live`}}));
  await context.route(`**${prefix}/api/live/snapshot`,r=>r.fulfill({json:frame(height)}));
  await page.routeWebSocket(`**${prefix}/api/live`,ws=>{socket=ws;ws.send(JSON.stringify(frame(height)));});
  await page.goto(base+prefix+'/txs',{waitUntil:'domcontentloaded'});await page.locator('.tx-row').first().waitFor();
  socket.send(JSON.stringify(frame(height+1)));await page.locator(`.tx-row a[href*="${h(height+101)}"]`).first().waitFor();
  const link=page.locator('.tx-row a[href*="/tx/"]').first();await link.hover();const before=await link.getAttribute('href');
  socket.send(JSON.stringify(frame(height+2)));await page.locator('.new-rows-button').waitFor();assert.equal(await link.getAttribute('href'),before);
  await page.locator('.new-rows-button').click();await page.locator(`.tx-row a[href*="${h(height+102)}"]`).first().waitFor();
  await page.waitForFunction(()=>document.querySelector('[data-live-transport]')?.getAttribute('data-live-transport')==='http',{},{timeout:20000});
 });
}}
finally{await browser.close();await writeFile(output+'/results.json',JSON.stringify({complete:true,passed:results.every(r=>r.passed),results},null,2));}
if(results.some(r=>!r.passed))process.exitCode=1;
