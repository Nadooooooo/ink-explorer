import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {registerHooks} from 'node:module';
import summariesFr from '../src/ink-ecosystem-fr.json' with {type:'json'};
import catalogue from '../src/ink-ecosystem.json' with {type:'json'};
import {ecosystemAppId} from '../src/ink-ecosystem-route.ts';
import {readEcosystemDocument} from '../server/ecosystem-document.mjs';
import localeMeta from '../src/locales/meta.json' with {type:'json'};
import vercelPage from '../api/page.mjs';
import {initialPageRoutes,initialPageSnapshot} from '../server/page-snapshots.mjs';
registerHooks({resolve(s,c,n){try{return n(s,c)}catch(e){if(s.startsWith('./')&&c.parentURL?.includes('/src/')&&!/\.[a-z]+$/.test(s))return n(s+'.ts',c);throw e;}}});
const {handleRequest}=await import('../cloudflare/worker.mjs');
const manifest=JSON.parse(await readFile('dist/snapshots/pages-manifest.json','utf8'));
const env={PUBLIC_URL:'https://inkexplorer.xyz',ASSETS:{async fetch(r){try{return new Response(await readFile('dist'+new URL(r.url).pathname));}catch{return new Response('Missing',{status:404});}}}};
test('all 24 directories/tools, 10 languages and both networks have matching first documents',async()=>{
 assert.equal(manifest.length,initialPageRoutes.length*20);
 assert.equal(new Set(manifest.map(r=>`${r.route}/${r.network}/${r.language}`)).size,manifest.length);
 for(const row of manifest){
  assert.equal(row.chainObservations,0);const snapshot=JSON.parse(await readFile('dist/'+row.path,'utf8'));
  if(row.route==='/txs')assert.match(snapshot.html,/<dialog[^>]*class="transaction-filter-dialog"/,'The snapshot must contain the loaded filter controls');
  const prefix=row.network==='sepolia'?'/testnet':'',url='https://inkexplorer.xyz'+prefix+row.route+'?lang='+row.language;
  const response=await handleRequest(new Request(url),env),html=await response.text();
  assert.equal(response.status,200);assert(html.includes(snapshot.html));assert.match(html,/class="startup-embedded"/);
  assert(html.includes(`data-initial-page="${row.route}"`));assert(html.includes(`action="${prefix}/search"`));assert(html.includes('name="q"'));
  assert(html.includes(`lang="${row.language}"`));assert(html.includes(`value="${row.network}" selected`));
  assert(!html.includes('localhost'));assert(!html.includes('127.0.0.1'));assert(!html.includes('class="tx-row'));assert(!html.includes('class="ledger-record'));
  for(const css of snapshot.styles)assert(html.includes(`href="${css}"`));
  const bot=await handleRequest(new Request(url,{headers:{'user-agent':'Googlebot'}}),env);assert.equal(await bot.text(),html);
 }
});
test('the ecosystem directory is crawlable without scripts and unknown app details return 404', async () => {
 for(const prefix of ['', '/testnet']){
  const origin='https://inkexplorer.xyz', pathname=prefix+'/apps';
  const response=await handleRequest(new Request(origin+pathname+'?lang=fr'),env), html=await response.text();
  const expected=catalogue.filter(app=>!prefix||app.network==='Both');
  assert.equal(response.status,200);
  assert.match(html,/<h1>Écosystème Ink<\/h1>/);
  assert.match(html,/<link rel="canonical" href="https:\/\/inkexplorer\.xyz(?:\/testnet)?\/apps\?lang=fr"/);
  assert.equal((html.match(/class="explorer-app ecosystem-card"/g)||[]).length,expected.length);
  assert(html.includes(summariesFr[expected[0].id]));
  assert(html.includes(prefix?'Ink Sepolia':'Ink Mainnet'));
  for(const app of expected){
   const href=pathname+'/'+ecosystemAppId(app.id)+'?lang=fr';
   assert(html.includes(`href="${href}"`), href);
   assert(html.includes(`src="${app.imageUrl}"`), app.imageUrl);
  }
  const valid=await handleRequest(new Request(origin+pathname+'/ecosystem-blockscout'),env);
  assert.equal(valid.status,200);
  assert.match(await valid.text(),/<title>Blockscout · Ink ecosystem/);
  for(const id of prefix?['ecosystem-velodrome','ecosystem-unknown']:['ecosystem-unknown']){
   const missing=await handleRequest(new Request(origin+pathname+'/'+id),env);
   assert.equal(missing.status,404);
   assert.equal(missing.headers.get('x-robots-tag'),'noindex,follow');
  }
 }
});

const htmlText = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
test('every official app detail exposes its localized navigation, summary, website and metadata in the first document', async () => {
 for (const prefix of ['', '/testnet']) {
  const apps = catalogue.filter(app => !prefix || app.network === 'Both');
  for (const language of localeMeta.locales) {
   const query = language === 'en' ? '' : '?lang=' + language;
   for (const app of apps) {
    const route = '/apps/' + ecosystemAppId(app.id);
    const url = 'https://inkexplorer.xyz' + prefix + route + query;
    const response = await handleRequest(new Request(url), env);
    assert.equal(response.status, 200, url);
    const html = await response.text();
    const summary = language === 'fr' ? summariesFr[app.id] : app.description;
    const website = new URL(prefix ? app.links.testnetWebsite : app.links.mainnetWebsite).href;
    assert(html.includes(`data-initial-page="${route}"`), url);
    assert(html.includes(`<h1>${htmlText(app.name)}</h1>`), url);
    assert(html.includes(`<p lang="${language === 'fr' ? 'fr' : 'en'}" dir="auto">${htmlText(summary)}</p>`), url);
    assert(html.includes(`href="${htmlText(website)}"`), url);
    assert(html.includes(`class="explorer-link text-link ecosystem-back" href="${prefix}/apps${query}"`), url);
    assert(html.includes(`<link rel="canonical" href="${url}"`), url);
    if (app.tags.length) assert(html.includes(`<bdi lang="en">${htmlText(app.tags.join(' · '))}</bdi>`), url);
    assert(!html.includes('aria-busy="true"'), url);
   }
  }
 }
});

test('missing or cross-network app snapshots do not expose another document', async () => {
 const url = new URL('https://inkexplorer.xyz/apps/ecosystem-concero?lang=fr');
 const read = async asset => JSON.parse(await readFile('dist/' + asset));
 assert((await readEcosystemDocument(url, '', read)).initialContent.includes('<h1>Concero</h1>'));
 assert.equal(await readEcosystemDocument(url, '', async asset => ({...await read(asset), network: 'sepolia'})), undefined);
 assert.equal(await readEcosystemDocument(url, '', async () => { throw new Error('Missing build asset'); }), undefined);
 const unknown = new URL('https://inkexplorer.xyz/apps/ecosystem-unknown');
 let reads = 0;
 assert.equal(await readEcosystemDocument(unknown, '', async () => { reads++; }), undefined);
 assert.equal(reads, 0);
});

test('the Vercel page adapter serves the same script-independent app and rejects unavailable records', async () => {
 const request = async url => {
  const result = {};
  await vercelPage({ method: 'GET', url, headers: { host: 'inkexplorer.xyz' } }, {
   writeHead(status, headers) { result.status = status; result.headers = headers; },
   end(body) { result.html = String(body); },
  });
  return result;
 };
 for (const [url, expected] of [
  ['/apps/ecosystem-nado?lang=fr', 200],
  ['/testnet/apps/ecosystem-concero?lang=ar', 200],
  ['/testnet/apps/ecosystem-nado?lang=fr', 404],
  ['/apps/ecosystem-unknown', 404],
 ]) {
  const result = await request(url);
  assert.equal(result.status, expected, url);
  if (expected === 200) {
   assert(result.html.includes('class="explorer-app ecosystem-detail"'), url);
   const back = result.html.match(/class="explorer-link text-link ecosystem-back" href="([^"]+)"/)?.[1];
   assert.equal(back, url.replace(/\/ecosystem-[^?]+/, ''));
   const list = await request(back);
   assert.equal(list.status, 200);
   const count = url.startsWith('/testnet/') ? 12 : 67;
   assert.equal((list.html.match(/class="explorer-app ecosystem-card"/g) || []).length, count);
   const filtered = await request(back + '&q=private-filter');
   assert(!filtered.html.includes('private-filter'));
   assert(!filtered.html.includes('class="explorer-app ecosystem-card"'));
  } else {
   assert.equal(result.headers['x-robots-tag'], 'noindex,follow');
   assert(!result.html.includes('class="explorer-app ecosystem-detail"'), url);
  }
 }
});

test('filtered URLs use a neutral heading and loading state rather than incorrect default controls',async()=>{
 for(const path of ['/blocks?type=reorg','/tokens?type=ERC-721&q=%3Cscript%3Eevil%3C/script%3E','/txs?status=failed','/accounts?sort=balance']){
  const url=new URL(path+'&lang=fr','https://inkexplorer.xyz'),selection=initialPageSnapshot(url,'mainnet','fr');assert(selection.neutral);
  const snapshot=JSON.parse(await readFile('dist'+selection.path,'utf8')),html=await(await handleRequest(new Request(url),env)).text();
  assert(html.includes(snapshot.neutralHtml));assert(!html.includes('<script>evil</script>'));assert(!snapshot.neutralHtml.includes('class="ledger-filters"'));
 }
});
test('API instructions and native details are present without build-host URLs',async()=>{
 const html=await(await handleRequest(new Request('https://inkexplorer.xyz/testnet/developers?lang=fr'),env)).text();
 assert(html.includes('https://inkexplorer.xyz/testnet/api'));assert(html.includes('wss://inkexplorer.xyz/testnet/api/live'));assert(html.includes('id="quickstart"'));assert(html.includes('<details>'));
});
test('missing, malformed and mismatched snapshots retain the independent fallback',async()=>{
 for(const broken of [null,'not-json',JSON.stringify({route:'/tokens',network:'mainnet',language:'en',html:'wrong route',styles:[]}),JSON.stringify({route:'/blocks',network:'mainnet',language:'en',html:3,neutralHtml:{},styles:{}})]){
  const fallback={...env,ASSETS:{async fetch(r){if(new URL(r.url).pathname.includes('/snapshots/pages/'))return new Response(broken,{status:broken===null?404:200});return env.ASSETS.fetch(r);}}};
  const response=await handleRequest(new Request('https://inkexplorer.xyz/blocks'),fallback),html=await response.text();assert.equal(response.status,200);assert.match(html,/<main id="ink-startup"/);assert(!html.includes('wrong route'));
 }
 assert.equal(initialPageSnapshot(new URL('https://inkexplorer.xyz/no-such-route'),'mainnet','en'),null);
 const missing=await handleRequest(new Request('https://inkexplorer.xyz/no-such-route'),env);assert.equal(missing.status,404);
});
