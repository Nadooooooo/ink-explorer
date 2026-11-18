import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';

const base=process.env.BASE_URL||'http://127.0.0.1:4298';
const account='0x68Abb7cb9a9F9dCa56E15828B06E65dC7e15Da47',out='reports/nft-loading';
await mkdir(out,{recursive:true});
const response=await fetch(`${base}/api/explorer/addresses/${account}/nft`),inventory=await response.json();
assert(response.ok);assert(inventory.items.length>=20);assert.equal(inventory.next_page_params,null);
const count=inventory.items.length;
const expected=inventory.items.map(item=>`/token/${item.token.address_hash}/instance/${item.id}`.toLowerCase());
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']}),results=[];
try {
  for(const width of [1440,390,320]) {
    const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],media=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('response',response=>{if(response.url().includes('/api/media'))media.push({url:response.url(),status:response.status()});});
    const start=Date.now();await page.goto(`${base}/address/${account}?tab=nft&lang=fr`,{waitUntil:'domcontentloaded'});
    const cards=page.locator('.nft-item');await cards.nth(count-1).waitFor();const cardsMs=Date.now()-start;
    for(let index=0;index<count;index++)await cards.nth(index).scrollIntoViewIfNeeded();
    await page.waitForFunction(count=>{const cards=[...document.querySelectorAll('.nft-item')];return cards.length===count&&cards.every(card=>{const image=card.querySelector('img');return image?.complete&&image.naturalWidth>0;});},count,{timeout:45000});
    const imagesMs=Date.now()-start;
    assert.deepEqual((await cards.evaluateAll(cards=>cards.map(card=>new URL(card.href).pathname.toLowerCase()))),expected);
    assert.deepEqual(await page.locator('.nft-holding-balance bdi').allTextContents(),inventory.items.map(item=>item.value));
    assert.equal(await page.locator('.nft-placeholder').count(),0);
    assert.equal(await page.locator('.account-inventory .cursor-pagination button').nth(1).isDisabled(),true);
    const geometry=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth-innerWidth,clipped:[...document.querySelectorAll('.nft-item>span')].filter(e=>e.scrollWidth>e.clientWidth+1||e.scrollHeight>e.clientHeight+1).map(e=>e.textContent)}));
    assert(geometry.overflow<=1);assert.deepEqual(geometry.clipped,[]);assert.deepEqual(errors,[]);assert(media.every(item=>item.status===200));
    const bytes=await page.evaluate(()=>performance.getEntriesByType('resource').filter(entry=>entry.name.includes('/api/media')).reduce((sum,entry)=>sum+entry.encodedBodySize,0));
    await page.screenshot({path:`${out}/inventory-${width}.png`,fullPage:true});
    results.push({width,cards:count,images:count,cardsMs,imagesMs,bytes,errors,geometry});console.log(JSON.stringify(results.at(-1)));
    await page.close();
  }
  const page=await browser.newPage();await page.goto(`${base}/token/0x92808d029fDEaAeb589305E280Dd0E6A10BfD016/instance/3918129?lang=fr`,{waitUntil:'domcontentloaded'});
  const video=page.locator('.nft-media video');await video.waitFor({timeout:30000});assert.equal(await video.getAttribute('preload'),'none');
  assert(await video.getAttribute('poster'));await video.evaluate(video=>video.play());await page.waitForFunction(()=>document.querySelector('.nft-media video')?.currentTime>0,{},{timeout:30000});
  await page.screenshot({path:`${out}/video-detail.png`});results.push({detail:'Fresh INK',videoPlayback:true});
} finally {await browser.close();await writeFile(`${out}/live-results.json`,JSON.stringify({base,results},null,2));}
