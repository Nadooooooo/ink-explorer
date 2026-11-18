import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {blo} from 'blo';
const base=process.env.BASE_URL||'http://127.0.0.1:4188';
const browser=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
const sender='0x'+'a'.repeat(40),recipient='0x'+'b'.repeat(40);
try {
 for(const prefix of ['','/testnet']) {
  const overview=await fetch(base+prefix+'/api/overview').then(r=>r.json()),tx={...overview.transactions[0],hash:'0x'+'c'.repeat(64)};
  const page=await browser.newPage();await page.setRequestInterception(true);
  let kind='wallet',mixedCase=false;
  page.on('request',request=>{
   if(new URL(request.url()).pathname===prefix+'/api/explorer/transactions/'+tx.hash) {
    const from={hash:mixedCase?'0x'+sender.slice(2).toUpperCase():sender,is_contract:false};
    const to={hash:recipient,is_contract:kind!=='wallet',is_verified:kind==='proxy',...(kind==='proxy'?{proxy_type:'eip1967',implementations:[{address_hash:sender}]}:{})};
    return request.respond({status:200,contentType:'application/json',body:JSON.stringify({...tx,from,to})});
   }
   request.continue();
  });
  for(const width of [390,1440]) for(kind of ['wallet','contract','proxy']) {
   mixedCase=false;await page.setViewport({width,height:900});
   await page.goto(base+prefix+'/tx/'+tx.hash,{waitUntil:'networkidle0'});
   await page.waitForSelector('.transaction-definitions .detail-party');
   const inspect=()=>page.$$eval('.transaction-definitions .detail-party',parties=>parties.map(el=>({image:el.querySelector('.entity-mark img')?.getAttribute('src'),width:el.querySelector('.entity-mark img')?.naturalWidth,kind:el.querySelector('.entity-mark')?.getAttribute('data-contract-kind'),verified:!!el.querySelector('.verification-mark')})));
   let marks=await inspect();assert.equal(marks.length,2);
   assert.equal(marks[0].image,blo(sender,24));assert.equal(marks[0].width,24);
   if(kind==='wallet') {assert.equal(marks[1].image,blo(recipient,24));assert.equal(marks[1].width,24);}
   else {assert.equal(marks[1].image,undefined);assert.equal(marks[1].kind,kind==='proxy'?'verified-proxy':'contract');assert.equal(marks[1].verified,kind==='proxy');}
   mixedCase=true;await page.reload({waitUntil:'networkidle0'});marks=await inspect();assert.equal(marks[0].image,blo(sender,24),'Address case cannot change identity');
  }
  await page.close();
 }
 console.log('Entity identities passed on both chains and widths: stable wallet identicons, case normalization, distinct contract/proxy marks and verified badges.');
} finally {await browser.close();}
