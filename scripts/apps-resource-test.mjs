import assert from 'node:assert/strict';
import {test,beforeEach,after} from 'node:test';
import {preloadApps,readApps,cancelAppsPreload,appsEndpoint,APPS_LIST_ENDPOINT} from '../src/apps-resource.ts';
import {requestJson,getDataFreshness,resetDataFreshness} from '../src/api-request.ts';

const originalFetch=globalThis.fetch,requests=[];
let replies=[];
const response=(value,headers={},status=200)=>new Response(JSON.stringify(value),{status,headers});
const scope=name=>`https://${name}.invalid/api`;
const reader=api=>(path,signal)=>requestJson(api+path,{signal});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
beforeEach(()=>{
  cancelAppsPreload();resetDataFreshness();requests.length=0;replies=[];
  globalThis.fetch=async(url,init)=>{
    requests.push({url,signal:init.signal});
    assert(replies.length,'Unexpected duplicate API request');
    return await replies.shift();
  };
});
after(()=>{cancelAppsPreload();globalThis.fetch=originalFetch;});

test('initial Apps read starts before mount and is consumed once, including an already settled response',async()=>{
  const api=scope('handoff'),items=[{id:'cookbook',title:'Cookbook'}];
  replies.push(response(items));
  preloadApps(api,reader(api),APPS_LIST_ENDPOINT);preloadApps(api,reader(api),APPS_LIST_ENDPOINT);
  assert.equal(requests.length,1,'Module loading must not delay or duplicate the initial read');
  await new Promise(setImmediate);
  assert.deepEqual(await readApps(api,reader(api),new AbortController().signal,APPS_LIST_ENDPOINT),items);
  assert.equal(requests.length,1,'Mount consumes the initial promise');
  replies.push(response([{id:'new'}]));
  assert.deepEqual(await readApps(api,reader(api),undefined,APPS_LIST_ENDPOINT),[{id:'new'}],'A revisit must read again');
  assert.equal(requests.length,2);
  assert(requests.every(r=>r.url===api+APPS_LIST_ENDPOINT));
});

test('list and detail reads on the same network cannot consume each other’s preload',async()=>{
  assert.equal(appsEndpoint(),APPS_LIST_ENDPOINT);assert.equal(appsEndpoint('cookbook'),'/dapps');
  for(const [initial,current,value] of [[APPS_LIST_ENDPOINT,'/dapps',[{id:'cookbook',description:'Complete detail'}]],['/dapps',APPS_LIST_ENDPOINT,[{id:'cookbook',shortDescription:'List summary'}]]]){
    const api=scope('projection'),held=deferred();replies.push(held.promise,response(value));
    preloadApps(api,reader(api),initial);const previous=requests.at(-1);
    assert.deepEqual(await readApps(api,reader(api),undefined,current),value);
    assert.equal(previous.signal.aborted,true);
    assert.equal(previous.url,api+initial);assert.equal(requests.at(-1).url,api+current);
    held.resolve(response([{id:'obsolete'}]));await new Promise(setImmediate);
  }
});

test('mainnet preload cannot provide Sepolia data and its late response cannot publish stale provenance',async()=>{
  const main=scope('network'),sepolia=main.replace('/api','/testnet/api'),held=deferred();
  replies.push(held.promise,response([{id:'sepolia'}]));
  preloadApps(main,reader(main));const oldSignal=requests[0].signal;
  assert.deepEqual(await readApps(sepolia,reader(sepolia)),[{id:'sepolia'}]);
  assert.equal(oldSignal.aborted,true,'Changing scope cancels the unused network read');
  assert.deepEqual(requests.map(r=>r.url),[main+'/dapps',sepolia+'/dapps']);
  held.resolve(response([{id:'mainnet'}],{'x-ink-data-status':'stale','x-ink-data-fetched-at':'2026-11-01T00:00:00Z'}));
  await new Promise(setImmediate);
  assert.equal(getDataFreshness(),null);
});

test('API errors and invalid responses survive preload and deliberate retry performs a fresh read',async()=>{
  for(const [name,bad,message] of [
    ['error',response({error:'Directory offline'},{},500),/Directory offline/],
    ['primitive',response('unexpected'),/invalidApiResponse/],
    ['html',new Response('<html>SPA fallback</html>'),/invalidApiResponse/],
  ]){
    const api=scope(name);replies.push(bad);
    preloadApps(api,reader(api),APPS_LIST_ENDPOINT);
    await new Promise(setImmediate); // A rejected preload has no mounted consumer yet.
    await assert.rejects(readApps(api,reader(api),undefined,APPS_LIST_ENDPOINT),message);
    replies.push(response([]));
    assert.deepEqual(await readApps(api,reader(api),undefined,APPS_LIST_ENDPOINT),[]);
  }
  assert.equal(requests.length,6);
});

test('rate limiting from preload remains enforced by the existing API reader',async()=>{
  const api=scope('cooldown');replies.push(response({error:'Slow down'},{'retry-after':'1'},429));
  preloadApps(api,reader(api));
  await assert.rejects(readApps(api,reader(api)),/Slow down/);
  await assert.rejects(readApps(api,reader(api)),/Data source unavailable/);
  assert.equal(requests.length,1,'Retry cannot bypass the shared server cooldown');
});

test('mounted cancellation aborts the original read and excludes a late result',async()=>{
  const api=scope('cancel'),held=deferred(),controller=new AbortController();replies.push(held.promise);
  preloadApps(api,reader(api));
  const pending=readApps(api,reader(api),controller.signal),reason=new DOMException('Navigation','AbortError');
  controller.abort(reason);
  assert.equal(requests[0].signal.aborted,true);
  held.resolve(response([{id:'obsolete'}]));
  await assert.rejects(pending,error=>error===reason);
  const cancelled=new AbortController();cancelled.abort(reason);
  await assert.rejects(readApps(api,reader(api),cancelled.signal),error=>error===reason);
  assert.equal(requests.length,1);
});

test('preload preserves stale provenance before mount, and a fresh revisit clears it',async()=>{
  const api=scope('freshness'),at='2026-11-01T00:00:00.000Z';
  replies.push(response([] ,{'x-ink-data-status':'stale','x-ink-data-fetched-at':at}));
  preloadApps(api,reader(api));await new Promise(setImmediate);
  assert.deepEqual(getDataFreshness(),{fetchedAt:at,resources:1});
  assert.deepEqual(await readApps(api,reader(api)),[]);
  assert.deepEqual(getDataFreshness(),{fetchedAt:at,resources:1});
  replies.push(response([] ,{'x-ink-data-status':'fresh','x-ink-data-fetched-at':at}));
  await readApps(api,reader(api));assert.equal(getDataFreshness(),null);
});

test('navigation disposes an unconsumed preload before the freshness generation changes',async()=>{
  const api=scope('navigation'),held=deferred();replies.push(held.promise);
  preloadApps(api,reader(api));cancelAppsPreload();resetDataFreshness();
  assert.equal(requests[0].signal.aborted,true);
  held.resolve(response([] ,{'x-ink-data-status':'stale','x-ink-data-fetched-at':'2026-11-01T00:00:00Z'}));
  await new Promise(setImmediate);assert.equal(getDataFreshness(),null);
  replies.push(response([{id:'current'}]));
  assert.deepEqual(await readApps(api,reader(api)),[{id:'current'}]);
});
