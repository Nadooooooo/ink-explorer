import puppeteer from 'puppeteer-core';
import {mkdirSync,realpathSync,writeFileSync,writeSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const projectRoot=fileURLToPath(new URL('../',import.meta.url));
export const UI_OBSERVER_LIMITS=Object.freeze({events:20000,eventBytes:8*1024*1024,errors:64,pendingBodies:16,bodyReads:2000,declaredBodyBytes:2*1024*1024});
const clipped=(value,limit=1000)=>String(value).slice(0,limit);
const failureText=error=>clipped(error instanceof Error?error.message:error,500);
function warn(error){try{writeSync(2,'UI observer: '+failureText(error)+'\n');}catch{/* Diagnostics must not change the smoke result. */}}
function canonicalDestination(directory){
  let ancestor=path.resolve(directory);const suffix=[];
  for(;;){
    try{return path.join(realpathSync(ancestor),...suffix.reverse());}
    catch(error){
      if(error.code!=='ENOENT')throw error;
      const parent=path.dirname(ancestor);if(parent===ancestor)throw error;
      suffix.push(path.basename(ancestor));ancestor=parent;
    }
  }
}
function reportDirectory(directory){
  const destination=canonicalDestination(directory),root=realpathSync(projectRoot),relative=path.relative(root,destination);
  const inside=relative===''||relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative);
  // A checkout may itself live under ~/src or ~/scripts. Its own reports
  // directory remains valid; source directories within that checkout do not.
  if(inside?relative.split(path.sep)[0]!=='reports':destination.split(path.sep).some(part=>['src','scripts','node_modules','.git'].includes(part)))throw new Error('Output must be outside source/dependency directories or inside project reports');
  return destination;
}
function describe(value){
  if(value===null||typeof value!=='object')return{kind:value===null?'null':typeof value};
  const scalar=value=>value==null?value:['string','number','boolean'].includes(typeof value)?clipped(value,350):typeof value;
  const entity=item=>item==null?item:typeof item==='object'?Object.fromEntries(['hash','address_hash','chain_id','type'].map(key=>[key,scalar(item[key])])):typeof item;
  const shape={keys:Object.keys(value).slice(0,60).map(key=>clipped(key,80))};
  for(const key of ['error','code','id','hash','address_hash','pool_id','chain_id'])shape[key]=scalar(value[key]);
  for(const key of ['owner','creator','token'])shape[key]=entity(value[key]);
  for(const key of ['stats','items','blocks','transactions','chart','counters'])shape[key]=Array.isArray(value[key])?value[key].length:value[key]===null?'null':typeof value[key];
  return shape;
}

// Importing this module does not observe another CLI. The exported installer
// also permits a browser-free stub check of return values and shutdown behavior.
export function installUiObserver(client,outputDirectory){
  let out;
  try{
    out=reportDirectory(outputDirectory||process.env.UI_OBSERVE_OUTPUT||path.join('reports','ui-observer','run-'+new Date().toISOString().replace(/[:.]/g,'-')));
    mkdirSync(out,{recursive:true,mode:0o700});out=reportDirectory(out);
  }catch(error){warn(error);return{enabled:false,error:failureText(error)};}
  const lines=[],pendingBodies=new Map(),browsers=new WeakSet(),pages=new WeakSet();
  const metadata={pid:process.pid,startedAt:new Date().toISOString(),argv:process.argv.slice(0,16).map(value=>clipped(value,512)),node:process.version,execPath:process.execPath,
    scope:'Passive Puppeteer events, bounded API body classification and original body $eval return values; no API interception, extra evaluation, retry or wait.',
    limits:UI_OBSERVER_LIMITS,asyncExitDrain:false,unhandledRejectionHandlersInstalled:false,errors:[],droppedErrors:0,droppedEvents:0,skippedBodyReads:0};
  let pageSequence=0,bodySequence=0,bodyReads=0,eventBytes=0;
  const error=(label,cause)=>{if(metadata.errors.length<UI_OBSERVER_LIMITS.errors)metadata.errors.push(label+': '+failureText(cause));else metadata.droppedErrors++;};
  const record=entry=>{
    try{
      if(lines.length>=UI_OBSERVER_LIMITS.events){metadata.droppedEvents++;return;}
      const line=JSON.stringify({at:new Date().toISOString(),...entry})+'\n',bytes=Buffer.byteLength(line);
      if(eventBytes+bytes>UI_OBSERVER_LIMITS.eventBytes){metadata.droppedEvents++;return;}
      lines.push(line);eventBytes+=bytes;
    }catch(cause){error('event',cause);}
  };
  const safely=(label,fn)=>(...args)=>{try{return fn(...args);}catch(cause){error(label,cause);}};
  const documentUrl=page=>clipped(page.url());
  const viewport=page=>{const value=page.viewport();return value?{width:value.width,height:value.height,deviceScaleFactor:value.deviceScaleFactor}:null;};
  const observePage=page=>{
    if(pages.has(page))return;pages.add(page);
    const pageId=++pageSequence,starts=new WeakMap();
    record({event:'page-created',page:pageId});
    page.on('framenavigated',safely('navigation',frame=>{if(frame===page.mainFrame())record({event:'navigation',page:pageId,url:clipped(frame.url()),viewport:viewport(page)});}));
    page.on('request',safely('request',request=>{
      starts.set(request,Date.now());const url=new URL(request.url());if(!url.pathname.includes('/api/'))return;
      record({event:'request',page:pageId,document:documentUrl(page),path:clipped(url.pathname),query:url.pathname.endsWith('/media')?'kind='+clipped(url.searchParams.get('kind')||'original',100):url.search.slice(0,500),resource:request.resourceType()});
    }));
    page.on('requestfailed',safely('requestfailed',request=>{
      const url=new URL(request.url());record({event:'requestfailed',page:pageId,document:documentUrl(page),path:clipped(url.pathname),resource:request.resourceType(),error:clipped(request.failure()?.errorText||''),elapsedMs:Date.now()-(starts.get(request)??Date.now())});
    }));
    page.on('pageerror',safely('pageerror',cause=>record({event:'pageerror',page:pageId,document:documentUrl(page),error:failureText(cause)})));
    page.on('console',safely('console',message=>{if(message.type()==='error')record({event:'consoleerror',page:pageId,document:documentUrl(page),error:clipped(message.text(),900)});}));
    page.on('response',safely('response',response=>{
      const url=new URL(response.url());if(!url.pathname.includes('/api/'))return;
      const headers=response.headers(),entry={event:'response',page:pageId,document:documentUrl(page),path:clipped(url.pathname),
        query:url.pathname.endsWith('/media')?'kind='+clipped(url.searchParams.get('kind')||'original',100):url.search.slice(0,500),status:response.status(),headersMs:Date.now()-(starts.get(response.request())??Date.now()),
        headers:{date:clipped(headers.date||'',100),contentType:clipped(headers['content-type']||'',150),freshness:clipped(headers['x-ink-data-status']||'',100),fetchedAt:clipped(headers['x-ink-data-fetched-at']||'',100),retryAfter:clipped(headers['retry-after']||'',100)}};
      record(entry); // Headers survive even if CDP cannot finish a later body read.
      const watched=/\/api\/(?:overview|stats\/counters)$/.test(url.pathname)||/\/api\/(?:contract-info\/pools\/|explorer\/(?:addresses|tokens)\/)/.test(url.pathname);
      const errorJson=response.status()>=400&&headers['content-type']?.includes('json');
      if(url.pathname.endsWith('/media')||!watched&&!errorJson)return;
      if(pendingBodies.size>=UI_OBSERVER_LIMITS.pendingBodies||bodyReads>=UI_OBSERVER_LIMITS.bodyReads||Number(headers['content-length'])>UI_OBSERVER_LIMITS.declaredBodyBytes){metadata.skippedBodyReads++;record({event:'body-skipped',page:pageId,document:entry.document,path:entry.path,status:entry.status,reason:'observer-limit'});return;}
      const bodyId=++bodySequence;bodyReads++;
      pendingBodies.set(bodyId,{page:pageId,document:entry.document,path:entry.path,status:entry.status,startedAt:new Date().toISOString()});
      try{
        void Promise.resolve(response.json()).then(value=>record({event:'body',page:pageId,document:entry.document,path:entry.path,status:entry.status,totalMs:Date.now()-(starts.get(response.request())??Date.now()),body:describe(value)}),
          cause=>record({event:'body-read-error',page:pageId,document:entry.document,path:entry.path,status:entry.status,error:failureText(cause)}))
          .finally(()=>pendingBodies.delete(bodyId)).catch(cause=>error('body observer',cause));
      }catch(cause){pendingBodies.delete(bodyId);error('body observer',cause);}
    }));
    const originalEval=page.$eval;
    page.$eval=async function(...args){
      const result=await Reflect.apply(originalEval,this,args);
      safely('body $eval',()=>{
        if(args[0]!=='body'||typeof result!=='string')return;
        const index=result.indexOf('Data temporarily unavailable');
        record({event:'body-eval',page:pageId,document:documentUrl(page),viewport:viewport(page),hasUnavailable:index>=0,errorExcerpt:index>=0?result.slice(Math.max(0,index-120),index+1000):null,hasTokenId:result.includes('Token ID'),hasPoolLabel:result.includes('LIQUIDITY POOL')});
      })();
      return result; // Preserve the actual assertion input; never evaluate the page again.
    };
  };
  const observeBrowser=browser=>{
    if(browsers.has(browser))return;browsers.add(browser);record({event:'browser-launched'});
    browser.on('disconnected',safely('disconnected',()=>record({event:'browser-disconnected'})));
    const originalNewPage=browser.newPage;
    browser.newPage=async function(...args){const page=await Reflect.apply(originalNewPage,this,args);safely('page setup',observePage)(page);return page;};
  };
  const originalLaunch=client.launch;
  try{client.launch=async function(...args){const browser=await Reflect.apply(originalLaunch,this,args);safely('browser setup',observeBrowser)(browser);return browser;};}
  catch(cause){error('launch setup',cause);warn(cause);}
  // No CDP promise or asynchronous flush is awaited, including process.exit(1).
  // Event bytes, errors and unresolved reads are bounded and reported explicitly.
  process.once('exit',code=>{
    const started=Date.now();
    try{
      writeFileSync(path.join(out,`observer-events-${process.pid}.jsonl`),lines.join(''),{flag:'wx',mode:0o600});
      writeFileSync(path.join(out,`observer-meta-${process.pid}.json`),JSON.stringify({...metadata,finishedAt:new Date().toISOString(),exitCode:code,eventCount:lines.length,eventBytes,pageCount:pageSequence,bodyReads,pendingBodies:[...pendingBodies.values()],finalFlushMs:Date.now()-started},null,2),{flag:'wx',mode:0o600});
    }catch(cause){warn(cause);}
  });
  return{enabled:true,outputDirectory:out,limits:UI_OBSERVER_LIMITS};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(new URL('./smoke-test.mjs',import.meta.url)))installUiObserver(puppeteer);
