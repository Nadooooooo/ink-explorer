import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:4311',out=process.env.USD_OUTPUT||'reports/usd-values/browser',baseline=process.env.USD_BASELINE==='1',results=[];
const address='0x'+'1'.repeat(40),token='0x'+'2'.repeat(40),pool='0x'+'a'.repeat(64);
const profiles=process.env.USD_PROFILES?process.env.USD_PROFILES.split(',').map(value=>{const[width,locale]=value.split(':');return[Number(width),locale];}):[[320,'en'],[390,'fr'],[768,'ar'],[1440,'en']];
await mkdir(out,{recursive:true});
for(const engine of (process.env.USD_ENGINES||'chromium,firefox,webkit').split(',')){
 const b=await({chromium,firefox,webkit})[engine].launch(engine==='chromium'?{args:['--no-sandbox']}:{});
 try{for(const prefix of baseline?['']:['','/testnet'])for(const[width,locale]of(baseline?[[390,'en']]:profiles)){
  const c=await b.newContext({viewport:{width,height:1000},colorScheme:width<400?'dark':'light'}),p=await c.newPage(),r={engine,prefix,width,locale,baseline,passed:false},errors=[];
  p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));
  let quote='2500',raw='1',marketValue='0.000000001';
  const headers=()=>({date:new Date().toUTCString(),'x-ink-data-status':'fresh','x-ink-data-fetched-at':new Date().toISOString()});
  const holdings=[
    {name:'Tiny priced',value:'1',decimals:'18',price:'2500'},
    {name:'Missing price',value:'1000000',decimals:'6',price:null},
    {name:'Blank price',value:'1000000',decimals:'6',price:' '},
    {name:'Numeric zero price',value:'1000000',decimals:'6',price:0},
    {name:'String zero price',value:'1000000',decimals:'6',price:'0'},
    {name:'Zero balance',value:'0',decimals:'18',price:'2500'},
    {name:'Unknown precision',value:'1000000',decimals:null,price:'2'},
    {name:'Underflow product',value:'1',decimals:'255',price:'1e-100'},
    {name:'Unsafe numeric amount',value:9007199254740992,decimals:'6',price:'2'},
    {name:'Priced asset',value:'1234500',decimals:'6',price:'2'},
  ];
  await c.routeWebSocket(/\/api\/live$/,ws=>ws.close());
  await c.route('**/api/**',route=>{
   const path=new URL(route.request().url()).pathname.replace(/^\/testnet/,'');
   let data={items:[],next_page_params:null};
   if(path==='/api/explorer/stats')data={coin_price:'2500.125'};
   else if(path==='/api/explorer/addresses/'+address)data={hash:address,coin_balance:raw,exchange_rate:quote,is_contract:false,block_number_balance_updated_at:100,balance_check:{status:'matched',source:'local'}};
   else if(path.endsWith('/counters'))data={transactions_count:0,token_transfers_count:0};
   else if(path.endsWith('/tokens'))data={items:holdings.map(row=>({value:row.value,token:{address_hash:token,decimals:row.decimals,name:row.name,symbol:'TEST',exchange_rate:row.price,type:'ERC-20'}})),next_page_params:null};
   else if(path.endsWith('/check'))data=null;
   else if(path.startsWith('/api/contract-info/pools')){
    const item={pool_id:pool,chain_id:prefix?763373:57073,is_contract:false,base_token_symbol:'AAA',quote_token_symbol:'BBB',base_token_address:address,quote_token_address:token,liquidity:marketValue,volume_usd_24h:'0',fee:'0.05',base_token_market_cap_usd:marketValue,base_token_fully_diluted_valuation_usd:marketValue,quote_token_market_cap_usd:null,quote_token_fully_diluted_valuation_usd:null,dex:{name:'Fixture'}};
    data=path.endsWith('/pools')?{items:[item],next_page_params:null}:item;
   }else return route.fulfill({status:503,json:{error:'Controlled unrelated source'}});
   return route.fulfill({headers:headers(),json:data});
  });
  const expected=await p.evaluate(locale=>{
   const money=new Intl.NumberFormat(locale,{style:'currency',currency:'USD',currencyDisplay:'narrowSymbol',maximumFractionDigits:2});
   const number=new Intl.NumberFormat(locale),decimal=number.formatToParts(1.1).find(p=>p.type==='decimal').value;
   return {zero:money.format(0),priced:money.format(2.469),ethPrice:money.format(2500.125),tiny:`< ${new Intl.NumberFormat(locale,{style:'currency',currency:'USD',currencyDisplay:'narrowSymbol',minimumFractionDigits:0,maximumFractionDigits:2}).format(.01)}`,oneWei:number.format(0)+decimal+number.format(0).repeat(17)+number.format(1)};
  },locale);
  const usd=n=>n===0?expected.zero:expected.priced,tiny=expected.tiny;
  const openAddress=async()=>{await p.goto(`${base}${prefix}/address/${address}?lang=${locale}`,{waitUntil:'domcontentloaded'});await p.locator('.address-summary').waitFor();};
  try{
   await openAddress();
   if(!baseline&&!prefix){
    await p.waitForFunction(expected=>document.querySelector('.market-eth strong')?.textContent===expected,expected.ethPrice);
    const header=await p.locator('.market-eth').evaluate(el=>{const rect=el.getBoundingClientRect();return {inside:rect.left>=0&&rect.right<=innerWidth+1,unclipped:el.scrollWidth<=el.clientWidth+1};});
    assert(header.inside&&header.unclipped,JSON.stringify(header));
   }
   const note=p.locator('.address-summary .metric').first().locator('small').first();
   if(baseline)assert.match(await note.textContent(),/^\$0/);else assert((await note.textContent()).startsWith(tiny),JSON.stringify({actual:await note.textContent(),expected:tiny}));
   const select=p.locator('.section-picker select');
   if(await select.isVisible())await select.selectOption('tokens');
   else{const label=await select.locator('option[value="tokens"]').textContent();await p.locator('.address-page > .section-navigation .tabs').getByRole('button',{name:label,exact:true}).click();}
   await p.locator('.asset-row').last().waitFor();
   const value=name=>p.locator('.asset-row').filter({hasText:name}).locator(':scope > span').last().locator('small');
   r.holdings={};for(const item of holdings)r.holdings[item.name]=await value(item.name).textContent();
   if(baseline){
    assert.match(r.holdings['Tiny priced'],/^\$0/);
    assert.match(r.holdings['Blank price'],/^\$0/);
    assert.equal(r.holdings['Numeric zero price'],'No price data');
    assert.match(r.holdings['Underflow product'],/^\$0/);
   }else{
    assert.equal(r.holdings['Tiny priced'],tiny);
    for(const name of ['Numeric zero price','String zero price','Zero balance'])assert.equal(r.holdings[name],usd(0));
    const noPrice=r.holdings['Missing price'];
    for(const name of ['Blank price','Unknown precision','Underflow product','Unsafe numeric amount'])assert.equal(r.holdings[name],noPrice);
    assert.equal(r.holdings['Priced asset'],usd(2.469));
    assert.equal(await p.locator('.asset-row').first().locator('strong[title]').getAttribute('title'),expected.oneWei);
    for(const name of ['Tiny priced','Numeric zero price','Priced asset']){
     const direction=await value(name).locator('bdi').evaluate(el=>({dir:el.dir,computed:getComputedStyle(el).direction,isolation:getComputedStyle(el).unicodeBidi}));
     assert.deepEqual(direction,{dir:'ltr',computed:'ltr',isolation:'isolate'});
    }
    for(const locator of [p.locator('.address-summary .metric > strong').first().locator('bdi'),p.locator('.asset-row').first().locator('strong bdi')]){
     const comparison=await locator.evaluate(el=>{
      const text=el.firstChild,sign=document.createRange(),amount=document.createRange();
      sign.setStart(text,0);sign.setEnd(text,1);amount.setStart(text,2);amount.setEnd(text,text.length);
      return {text:el.textContent,dir:getComputedStyle(el).direction,signBeforeAmount:sign.getBoundingClientRect().right<=amount.getBoundingClientRect().left+1};
     });
     assert(comparison.text.startsWith('< '));assert.equal(comparison.dir,'ltr');assert(comparison.signBeforeAmount,JSON.stringify(comparison));
    }
   }
   await p.screenshot({path:`${out}/${engine}-${prefix?'sepolia':'mainnet'}-${width}-${locale}-holdings.png`});
   if(!baseline){
    for(const [amount,price,expected]of [['1000000000000000000',' ','N/A'],['0','2500',usd(0)],['1000000000000000000',0,usd(0)],['1234500000000000000','2',usd(2.469)]]){
     raw=amount;quote=price;await openAddress();assert((await note.textContent()).startsWith(expected));
    }
   }
   await p.goto(`${base}${prefix}/pools?lang=${locale}`);await p.locator('.pool-row').waitFor();
   if(baseline)assert.match(await p.locator('.pool-row > strong').first().textContent(),/^\$0/);
   else assert.equal(await p.locator('.pool-row > strong').first().textContent(),tiny);
   await p.locator('.pool-row').click();await p.locator('.pool-hero').waitFor();
   if(!baseline){
    assert.equal(await p.locator('.address-summary .metric > strong').first().textContent(),tiny);
    assert.equal(await p.locator('.address-summary .metric > strong').nth(1).textContent(),usd(0));
    assert.equal(await p.locator('.pool-detail-grid article').first().locator('dd').first().textContent(),tiny);
   }
   await p.screenshot({path:`${out}/${engine}-${prefix?'sepolia':'mainnet'}-${width}-${locale}-pool.png`});
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   assert.deepEqual(errors,[]);r.passed=true;
  }catch(e){r.error=e.stack;await p.screenshot({path:`${out}/failure-${engine}-${prefix?'sepolia':'mainnet'}-${width}-${locale}.png`}).catch(()=>{});}finally{await c.close();}
  results.push(r);console.log(JSON.stringify(r));await writeFile(`${out}/results.json`,JSON.stringify({base,complete:false,results},null,2));
 }}finally{await b.close();}
}
await writeFile(`${out}/results.json`,JSON.stringify({base,complete:true,passed:results.every(r=>r.passed),baseline,mockedApi:true,results},null,2));
if(results.some(r=>!r.passed))process.exitCode=1;
