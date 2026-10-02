import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.BASE_URL || 'http://127.0.0.1:4188';
const address = '0x' + '1'.repeat(40), hash = '0x' + '2'.repeat(64), hash2 = '0x' + '3'.repeat(64);
const tx = {hash, block_number:100, status:'ok', timestamp:'2026-09-30T12:00:00Z', from:{hash:address}, to:{hash:address}, fee:{type:'actual',value:'24003533088'},l1_fee:'23371143287',gas_used:'264709',gas_price:'2389',value:'0'};
const block = {height:100,hash,parent_hash:hash2,timestamp:tx.timestamp,transactions_count:2};
const browser = await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
try {
  for (const width of [320,390,1440]) {
    const context=await browser.newContext({viewport:{width,height:900}});
    // Prevent a real node stream from contaminating deterministic finality.
    await context.routeWebSocket(/\/api\/live$/,ws=>ws.close());
    const page=await context.newPage(), errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    let pageFailure=true, delayPage=false, stateFailure=true, sourceAvailable=false, sourceFailure=false;
    await page.route('**/api/explorer/**',async route=>{
      const url=new URL(route.request().url()), path=url.pathname.replace('/api/explorer/','');
      let data;
      if(path==='blocks/100')data=block;
      else if(path==='blocks')data={items:[{...block,height:url.search?99:100}],next_page_params:url.search?null:{block_number:100}};
      else if(path==='transactions')data={items:[{...tx,hash:url.search?hash2:hash}],next_page_params:url.search?null:{block_number:100}};
      else if(path===`tokens/${address}`)data={address_hash:address,name:'Fixture collection',symbol:'NFT',type:'ERC-721',decimals:0};
      else if(path===`tokens/${address}/instances/1`)data={id:'1',metadata:{name:'Fixture NFT'},owner:{hash:address}};
      else if(path===`tokens/${address}/instances/1/transfers`)data={items:[{transaction_hash:url.search?hash2:hash,from:{hash:address},to:{hash:address},token:{symbol:'NFT',decimals:0},total:{value:'1'}}],next_page_params:url.search?null:{index:0}};
      else if(path==='blocks/100/transactions'){
        if(url.search && pageFailure){await route.fulfill({status:502,json:{error:'Fixture page unavailable'}});return;}
        data={items:[{...tx,hash:url.search?hash2:hash}],next_page_params:url.search?null:{index:0,block_number:100}};
      }
      else if(path==='tokens')data={items:[{address_hash:address,name:url.search?'Beta token':'Alpha token',type:'ERC-20',symbol:'TEST'}],next_page_params:url.search?null:{index:0}};
      else if(path==='smart-contracts')data={items:[{address:{hash:address},name:url.search?'Beta contract':'Alpha contract'}],next_page_params:url.search?null:{index:0}};
      else if(path===`addresses/${address}`)data={hash:address,is_contract:true,is_verified:false};
      else if(path===`addresses/${address}/transactions`){
        if(url.search && pageFailure){await route.fulfill({status:502,json:{error:'Address page unavailable'}});return;}
        data={items:[{...tx,hash:url.search?hash2:hash}],next_page_params:url.search?null:{index:0}};
      }
      else if(path===`smart-contracts/${address}`){
        if(sourceFailure){await route.fulfill({status:503,json:{error:'Source index unavailable'}});return;}
        if(!sourceAvailable){await route.fulfill({status:404,json:{error:'Contract not verified'}});return;}
        await new Promise(r=>setTimeout(r,800));
        data={source_code:'pragma solidity ^0.8.0; contract Fixture {}',file_path:'Fixture.sol',additional_sources:[{file_path:'Helper.sol',source_code:'library Helper {}'}]};
      }
      else if(path===`transactions/${hash}`)data={...tx,decoded_input:{method_call:'set(uint256 value)',parameters:[{name:'value',type:'uint256',value:'9007199254740993'}]},revert_reason:{raw:'0xdead'}};
      else if(path===`transactions/${hash2}`)data={...tx,hash:hash2,status:null,block_number:null,timestamp:null,fee:{type:'maximum',value:'1'}};
      else if(path===`transactions/${hash}/logs`){
        if(url.search && delayPage)await new Promise(r=>setTimeout(r,700));
        data={items:[{transaction_hash:hash,index:url.search?1:0,address:{hash:address},topics:[url.search?hash2:hash],data:url.search?'0x5678':'0x1234',decoded:{method_call:'Event(uint256 value)',parameters:[{name:'value',type:'uint256',value:url.search?'43':'42'}]}}],next_page_params:url.search?null:{index:0}};
      }
      else if(path===`transactions/${hash}/state-changes`){
        if(stateFailure){await route.fulfill({status:429,json:{error:'State index rate limited'}});return;}
        data={items:[{type:'coin',address:{hash:address},balance_before:'900719925474099312345678901234567890',balance_after:'900719925474099312345678901234567932',change:'42'}, {type:'token',address:{hash:address},token:{symbol:'NFT'},token_id:'9007199254740993',change:[{direction:'from',total:{token_id:'9007199254740993',value:'1'}}]}]};
      }
      else data={items:[]};
      await route.fulfill({json:data});
    });
    const visit=async path=>{await page.goto(base+path);await page.locator('.detail-header').waitFor();};
    const tab=async name=>{
      if(width<500)await page.locator('.section-picker select').selectOption(name);
      else await page.locator('.tabs button').filter({hasText:({logs:'Logs',l2:'L2 fees',input:'Input data',read:'Read contract',transactions:'Transactions',state:'State changes',contract:'Contract source'})[name]}).click();
    };
    await visit('/block/100');
    assert.equal((await page.locator('.detail-header .status').textContent()).trim(),'Confirmed','No node evidence must not imply finality');
    await page.locator('.detail-feed .pagination button').click();
    await page.getByRole('alert').waitFor();
    assert.match(await page.getByRole('alert').innerText(),/Fixture page unavailable/);
    assert.equal(await page.locator('.detail-feed .tx-row').count(),1,'Failure must preserve loaded transactions');
    pageFailure=false;
    await page.locator('.detail-feed .pagination button').click();
    await page.waitForFunction(()=>document.querySelectorAll('.detail-feed .tx-row').length===2);
    assert.equal(await page.locator('.detail-feed .pagination').count(),0,'Reached end must disable further pages');
    await visit('/tx/'+hash2);
    assert.equal((await page.locator('.detail-header .status').textContent()).trim(),'Pending');
    assert.doesNotMatch(await page.locator('main').innerText(),/Invalid Date|NaN|1970/);
    assert.equal(await page.locator('main button').filter({hasText:'NaN'}).count(),0);
    await visit('/tx/'+hash);
    await tab('input');
    assert.match(await page.locator('.code-panel').innerText(),/9007199254740993/);
    assert.match(await page.locator('.code-panel').innerText(),/0xdead/);
    await tab('l2');
    assert.match(await page.locator('.definitions').innerText(),/0\.0000000006 ETH/);
    await tab('logs');
    await page.locator('.event-log').waitFor();
    assert.match(await page.locator('.event-log').innerText(),/0x1234/);
    assert.match(await page.locator('.event-log').innerText(),/Event\(uint256 value\)/);
    assert.match(await page.locator('.event-log').innerText(),new RegExp(hash));
    await page.locator('main > .pagination button').click();
    await page.waitForFunction(()=>document.querySelectorAll('.event-log').length===2);
    assert.match(await page.locator('.event-log').first().innerText(),/0x1234/);
    assert.match(await page.locator('.event-log').nth(1).innerText(),/0x5678/,'Different logs in one transaction must remain distinct');
    assert.equal(await page.locator('main > .pagination').count(),0);
    await tab('state');await page.getByRole('alert').filter({hasText:'State index rate limited'}).waitFor();
    assert.equal(await page.locator('.section-picker select').inputValue(),'state','Failure must keep the selected section');
    stateFailure=false;await page.getByRole('button',{name:'Retry',exact:true}).click();
    await page.locator('.state-row').first().waitFor();assert.match(await page.locator('.state-row').first().innerText(),/42/);
    assert.match(await page.locator('.state-row').first().innerText(),/900719925474099312345678901234567890/,'Before balance must remain visible on mobile');
    assert.match(await page.locator('.state-row').first().innerText(),/900719925474099312345678901234567932/,'After balance must remain visible');
    assert.match(await page.locator('.state-row').nth(1).innerText(),/9007199254740993/);
    assert.match(await page.locator('.state-row .state-change-value').nth(1).innerText(),/"direction": "from"/);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
    // A response belonging to a previous tab must never replace the new page.
    await visit('/tx/'+hash);await tab('logs');await page.locator('.event-log').waitFor();
    delayPage=true;await page.locator('main > .pagination button').click();
    if(width<500)await page.locator('.section-picker select').selectOption('overview');
    else await page.locator('.tabs button').filter({hasText:'Overview'}).click();
    await page.waitForTimeout(900);
    assert.equal(await page.locator('.event-log').count(),0);
    for(const [path,selector,first,second] of [['/tokens','.token-row','Alpha token','Beta token'],['/contracts','.contract-card','Alpha contract','Beta contract']]){
      await page.goto(base+path);await page.locator(selector).waitFor();
      assert.match(await page.locator(selector).innerText(),new RegExp(first));
      await page.getByRole('button',{name:'Older',exact:true}).click();
      await page.locator(selector).filter({hasText:second}).waitFor();
      assert.equal(await page.getByRole('button',{name:'Older',exact:true}).isDisabled(),true);
      await page.getByRole('button',{name:'Newest',exact:true}).click();
      await page.locator(selector).filter({hasText:first}).waitFor();
    }
    await page.goto(base+'/address/'+address);await page.locator('.detail-header').waitFor();
    await tab('read');await page.locator('.contract-interaction').waitFor();
    await page.locator('.contract-interaction select').selectOption('custom');
    await page.locator('.contract-interaction textarea').fill('[{"type":"function","name":"value","stateMutability":"view","inputs":[],"outputs":[{"type":"uint256"}]}]');
    await page.getByRole('button',{name:'Use ABI',exact:true}).click();
    await page.locator('.contract-method').waitFor();
    assert.match(await page.locator('.contract-method').innerText(),/value\(\)/);
    await tab('transactions');await page.locator('.address-activity .tx-row').waitFor();
    pageFailure=true;await page.locator('.address-pagination button').click();
    await page.getByRole('alert').filter({hasText:'Address page unavailable'}).waitFor();
    assert.equal(await page.locator('.address-activity .tx-row').count(),1);
    pageFailure=false;await page.locator('.address-pagination button').click();
    await page.waitForFunction(()=>document.querySelectorAll('.address-activity .tx-row').length===2);
    assert.equal(await page.locator('.address-pagination button').isDisabled(),true);
    sourceAvailable=true;sourceFailure=true;await tab('contract');
    await page.getByRole('alert').filter({hasText:'Source index unavailable'}).waitFor();
    sourceFailure=false;await page.getByRole('button',{name:'Retry',exact:true}).click();
    await page.locator('.source-file').first().waitFor();assert.equal(await page.locator('.source-file').count(),2);
    assert.match(await page.locator('.source-file').first().innerText(),/pragma solidity/);
    assert.equal(await page.locator('.section-picker select').inputValue(),'contract');
    await page.goto(base+`/token/${address}/instance/1`);
    await page.locator('.nft-activity .generic-row').waitFor();
    await page.locator('.nft-activity .pagination button').click();
    await page.waitForFunction(()=>document.querySelectorAll('.nft-activity .generic-row').length===2);
    assert.equal(await page.locator('.nft-activity .pagination').count(),0);
    await page.goto(base+'/txs');await page.locator('.tx-row').waitFor();
    await page.getByRole('button',{name:'Older',exact:true}).click();
    await page.locator('.tx-row').filter({hasText:hash2.slice(0,7)}).waitFor();
    if(width<500)await page.locator('.menu').click();
    await page.locator('header nav button').filter({hasText:'Blocks'}).click();
    await page.locator('.block-row').waitFor();
    assert.match(await page.locator('.block-height').innerText(),/100/,'Ledger navigation must discard the previous cursor');
    await page.goto(base+'/tx/%E0%A4%A');
    await page.getByRole('heading',{name:'Page not found'}).waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
    assert.deepEqual(errors,[]);
    console.log(`Explorer integrity passed at ${width}px (finality, pending, fees, logs, complete pagination, retry, race, malformed URL).`);
    await context.close();
  }
} finally {await browser.close();}
