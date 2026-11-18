import {lookup} from 'node:dns/promises';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import ipaddr from 'ipaddr.js';
import {Agent,fetch as safeFetch} from 'undici';

const imageTypes=new Set(['image/avif','image/gif','image/jpeg','image/png','image/webp','image/svg+xml']);
const videoTypes=new Set(['video/mp4','video/webm']);
const hash=value=>createHash('sha256').update(value).digest('hex');
const bounded=(map,key,value)=>{map.set(key,value);if(map.size>200)map.delete(map.keys().next().value);};

export function resourceUrl(value) {
  if(typeof value!=='string'||!value||value.length>3000)throw Error('Invalid media URL');
  if(value.startsWith('ipfs://'))value='https://dweb.link/ipfs/'+value.slice(7).replace(/^ipfs\//,'');
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password||url.port)throw Error('Only public HTTPS media is supported');
  return url;
}
function ipfsPath(url) {
  const subdomain=url.hostname.match(/^([a-z0-9]+)\.ipfs\./i);
  return subdomain?subdomain[1]+url.pathname:url.pathname.match(/^\/ipfs\/(.+)$/)?.[1];
}
export function resourceCandidates(value) {
  const url=resourceUrl(value),ipfs=ipfsPath(url);
  return [...new Set(ipfs?['https://gateway.pinata.cloud/ipfs/'+ipfs,'https://ipfs.filebase.io/ipfs/'+ipfs,url.href]:[url.href])];
}
function privateAddress(address) {
  try {let parsed=ipaddr.parse(address);if(parsed.kind()==='ipv6'&&parsed.isIPv4MappedAddress())parsed=parsed.toIPv4Address();return parsed.range()!=='unicast';}
  catch{return true;}
}
export function safeSvg(body) {
  const source=body.toString('utf8');
  if(!/^\s*(?:<\?xml[^>]*>\s*)?<svg\b/i.test(source)||
    /<(?:script|style|foreignObject|iframe|object|embed)\b|<!DOCTYPE|<!ENTITY|\bon[a-z]+\s*=|\bstyle\s*=|javascript\s*:/i.test(source)||
    /\b(?:href|src)\s*=\s*["'](?!#|data:image\/)[^"']+/i.test(source)||/url\(\s*["']?(?!#|data:image\/)[^)]+\)/i.test(source))throw Error('Unsafe SVG image');
}

/** Each redirect pins a public DNS answer to the connection; every body is bounded. */
export function createPublicResourceReader({fetcher=safeFetch,resolve=lookup,timeout=10000}={}) {
  async function candidate(value,signal,{types,maxBytes}) {
    let url=resourceUrl(value);
    for(let redirects=0;redirects<=3;redirects++) {
      signal.throwIfAborted();
      const answers=await resolve(url.hostname,{all:true,verbatim:true});
      signal.throwIfAborted();
      if(!answers.length||answers.some(answer=>privateAddress(answer.address)))throw Error('Private media hosts are blocked');
      const chosen=answers.find(answer=>answer.family===4)||answers[0];
      const dispatcher=new Agent({connect:{lookup:(_host,options,callback)=>options.all?callback(null,[chosen]):callback(null,chosen.address,chosen.family)}});
      let response;
      try {
        response=await fetcher(url,{dispatcher,signal,redirect:'manual',headers:{accept:[...types].join(','),'user-agent':'InkExplorer/0.1'}});
        if(response.status>=300&&response.status<400&&response.headers.get('location')){url=resourceUrl(new URL(response.headers.get('location'),url).href);continue;}
        if(!response.ok)throw Error(`Media origin returned ${response.status}`);
        const type=(response.headers.get('content-type')||'').split(';')[0].toLowerCase();
        if(!types.has(type))throw Error('Unsupported media format');
        const limit=typeof maxBytes==='function'?maxBytes(type):maxBytes;
        if(Number(response.headers.get('content-length'))>limit)throw Error('Media exceeds size limit');
        const reader=response.body.getReader(),chunks=[];let bytes=0;
        try {while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>limit)throw Error('Media exceeds size limit');chunks.push(value);}}
        finally {await reader.cancel().catch(()=>{});}
        if(!bytes)throw Error('Empty media');
        const body=Buffer.concat(chunks,bytes);if(type==='image/svg+xml')safeSvg(body);
        return {body,type,origin:url.href};
      } finally {
        if(response?.body&&!response.bodyUsed)await response.body.cancel().catch(()=>{});
        // Closing a dispatcher must not hold up a successful body or a cancelled race.
        void dispatcher.destroy().catch(()=>{});
      }
    }
    throw Error('Too many media redirects');
  }
  return async(value,options)=>{
    // Validate before allocating a deadline that must always have a race handler.
    const candidates=resourceCandidates(value);
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
    const deadline=new Promise((_,reject)=>controller.signal.addEventListener('abort',()=>reject(Error('Media timeout')),{once:true}));
    try {
      // Start alternatives together. A slow or rate-limited gateway cannot block the others.
      return await Promise.race([Promise.any(candidates.map(url=>candidate(url,controller.signal,options))),deadline]);
    } finally {clearTimeout(timer);controller.abort();}
  };
}

/** Generate one small frame with bounded CPU/time/output and no network or playlist inputs. */
export async function makeThumbnail(body) {
  const directory=await mkdtemp(path.join(tmpdir(),'ink-thumbnail-'));
  try {
    // Ordinary MP4 files keep their index after the video data and require seeks.
    // The private regular file supports them; a stdin pipe cannot seek backwards.
    const input=path.join(directory,'input');await writeFile(input,body,{mode:0o600});
    return await new Promise((resolve,reject)=>{
      const child=spawn('ffmpeg',['-v','error','-nostdin','-threads','1','-protocol_whitelist','file,pipe','-format_whitelist','mov,matroska,webm,gif,gif_pipe,apng,png_pipe,jpeg_pipe,webp_pipe','-i',input,'-frames:v','1','-vf','scale=480:480:force_original_aspect_ratio=decrease','-threads','1','-c:v','libwebp','-quality','78','-f','image2pipe','pipe:1'],{stdio:['ignore','pipe','ignore']});
      const chunks=[];let size=0,failure;
      const stop=error=>{if(!failure){failure=error;child.kill('SIGKILL');}};
      const timer=setTimeout(()=>stop(Error('Thumbnail timeout')),10000);
      child.stdout.on('data',chunk=>{if(failure)return;size+=chunk.length;if(size>2*1024*1024)stop(Error('Thumbnail exceeds size limit'));else chunks.push(chunk);});
      child.on('error',error=>{clearTimeout(timer);reject(error);});
      // Wait for termination before removing the seekable input, including on timeout.
      child.on('close',code=>{clearTimeout(timer);failure?reject(failure):code===0&&size?resolve(Buffer.concat(chunks)):reject(Error('Thumbnail unavailable'));});
    });
  } finally {await rm(directory,{recursive:true,force:true});}
}

export function createMediaCache({cacheDir,logoStoreDir,retainLogo=async()=>{},scheduleCachePrune=()=>{},readResource=createPublicResourceReader(),thumbnail=makeThumbnail}) {
  const pending=new Map(),failures=new Map();let transforms=0;const transformQueue=[];
  const transform=async body=>{if(transforms>=2)await new Promise(resolve=>transformQueue.push(resolve));transforms++;try{return await thumbnail(body);}finally{transforms--;transformQueue.shift()?.();}};
  let transfers=0;const transferQueue=[];
  const transfer=async url=>{
    if(transfers>=4){if(transferQueue.length>=40)throw Error('Media cache is busy');await new Promise(resolve=>transferQueue.push(resolve));}
    transfers++;
    try{return await readResource(url,{types:new Set([...imageTypes,...videoTypes]),maxBytes:type=>videoTypes.has(type)?64*1024*1024:16*1024*1024});}
    finally{transfers--;transferQueue.shift()?.();}
  };
  async function load(url,key,permanent) {
    const bodyPath=path.join(cacheDir,key+'.bin'),metaPath=path.join(cacheDir,key+'.json');
    for(const directory of [...(permanent&&logoStoreDir?[logoStoreDir]:[]),cacheDir])try {
      const [body,meta]=await Promise.all([readFile(path.join(directory,key+'.bin')),readFile(path.join(directory,key+'.json'),'utf8').then(JSON.parse)]);
      if(meta.url===url.href&&(imageTypes.has(meta.type)||videoTypes.has(meta.type))){if(permanent)await retainLogo(key,body,meta);return{body,type:meta.type,key,cached:true};}
    }catch{/* A miss or incomplete write is fetched again. */}
    const failed=failures.get(key);if(failed&&failed.until>Date.now())throw failed.error;
    try {
      const media=await transfer(url.href);
      const meta={url:url.href,origin:media.origin,type:media.type,bytes:media.body.length,cachedAt:new Date().toISOString()};
      await writeFile(bodyPath,media.body);await writeFile(metaPath,JSON.stringify(meta));
      if(permanent)await retainLogo(key,media.body,meta);scheduleCachePrune();
      return {...media,key,cached:false};
    } catch(error){bounded(failures,key,{error,until:Date.now()+15000});throw error;}
  }
  return async(value,kind='original')=>{
    const url=resourceUrl(value),key=hash(url.href),requestKey=key+':'+kind;
    if(pending.has(requestKey))return pending.get(requestKey);
    const promise=(async()=>{
      if(kind==='thumbnail')try {const body=await readFile(path.join(cacheDir,key+'.thumb.webp'));return{body,type:'image/webp',key:key+'-thumb',cached:true};}catch{}
      const originalKey=key+':original';
      let original=pending.get(originalKey);
      if(!original){original=load(url,key,kind==='logo');pending.set(originalKey,original);original.finally(()=>{if(pending.get(originalKey)===original)pending.delete(originalKey);}).catch(()=>{});}
      const media=await original;
      if(kind==='logo')await retainLogo(key,media.body,{url:url.href,type:media.type,bytes:media.body.length,cachedAt:new Date().toISOString()});
      if(kind!=='thumbnail'||media.type==='image/svg+xml')return media;
      const body=await transform(media.body);await writeFile(path.join(cacheDir,key+'.thumb.webp'),body);scheduleCachePrune();
      return {body,type:'image/webp',key:key+'-thumb',cached:false};
    })();
    pending.set(requestKey,promise);
    try{return await promise;}finally{if(pending.get(requestKey)===promise)pending.delete(requestKey);}
  };
}
