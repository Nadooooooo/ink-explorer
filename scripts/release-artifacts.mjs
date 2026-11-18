import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,readdir,copyFile,mkdir,access} from 'node:fs/promises';
import path from 'node:path';
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export const immutable=/^assets\/(?:[^/]+-[a-zA-Z0-9_-]+\.[a-z0-9]+|marks\/[a-f0-9]+\.[a-z0-9]+)$/;
const manifestName='release-artifacts.json';
async function files(root,prefix=''){
 const result=[];
 for(const item of await readdir(path.join(root,prefix),{withFileTypes:true})){
  const name=path.posix.join(prefix,item.name);
  if(item.isDirectory())result.push(...await files(root,name));
  else if(item.isFile()&&name!==manifestName)result.push(name);
  else if(item.isSymbolicLink())throw Error('Build artifacts must not contain symbolic links');
 }
 return result.sort();
}
export async function verifyLocalManifest(dist,manifest){
 assert.equal(manifest.schema,1,'Unsupported release manifest');
 for(const row of Object.values(manifest.retained))assert(Number.isFinite(Date.parse(row.expiresAt)),'Invalid retained artifact expiry');
 const expected=Object.keys(manifest.active).concat(Object.keys(manifest.retained)).sort();
 assert.deepEqual(await files(dist),expected,'Build changed after release preparation');
 for(const name of expected){assert(!name.startsWith('/')&&!name.split('/').includes('..'),'Invalid artifact path');assert.equal(sha256(await readFile(path.join(dist,name))),manifest.active[name]?.sha256||manifest.retained[name].sha256,`Changed artifact: ${name}`);}
}
export async function prepareRelease(dist,previousDist,now=Date.now(),additionalPreviousDists=[]){
 await access(path.join(dist,'index.html'));
 await assert.rejects(access(path.join(dist,manifestName)),/ENOENT/,'Use a fresh build, or verify the existing prepared manifest');
 const active={};for(const name of await files(dist))active[name]={sha256:sha256(await readFile(path.join(dist,name)))};
 const retained={},copies=new Map();
 for(const source of [previousDist,...additionalPreviousDists]){
  assert.notEqual(path.resolve(dist),path.resolve(source));await access(path.join(source,'index.html'));
  let previous;
  try{previous=JSON.parse(await readFile(path.join(source,manifestName),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
  if(previous)await verifyLocalManifest(source,previous);
  for(const name of await files(source)){
   if(!immutable.test(name))continue;
   const bytes=await readFile(path.join(source,name)),hash=sha256(bytes);
   if(active[name]){assert.equal(active[name].sha256,hash,`Immutable URL reused with different content: ${name}`);continue;}
   const expiresAt=previous?.retained[name]?.expiresAt??new Date(now+86400000).toISOString();
   if(Date.parse(expiresAt)<=now)continue;
   if(retained[name])assert.equal(retained[name].sha256,hash,`Conflicting retained asset: ${name}`);
   if(!retained[name]||Date.parse(expiresAt)>Date.parse(retained[name].expiresAt))retained[name]={sha256:hash,expiresAt};
   copies.set(name,source);
  }
 }
 // Validate all immutable URLs before writing anything into the new build.
 for(const[name,source]of copies){await mkdir(path.dirname(path.join(dist,name)),{recursive:true});await copyFile(path.join(source,name),path.join(dist,name));}
 const manifest={schema:1,preparedAt:new Date(now).toISOString(),active,retained};
 await writeFile(path.join(dist,manifestName),JSON.stringify(manifest,null,2));return manifest;
}
if(process.argv[1]&&path.resolve(process.argv[1])===new URL(import.meta.url).pathname){
 const [command,dist,previous,...additional]=process.argv.slice(2);assert(dist,'A build directory is required');
 if(command==='prepare'){const m=await prepareRelease(dist,previous,Date.now(),additional);console.log(`Prepared ${Object.keys(m.active).length} current artifacts and ${Object.keys(m.retained).length} retained immutable artifacts`);}
 else if(command==='verify'){await verifyLocalManifest(dist,JSON.parse(await readFile(path.join(dist,manifestName),'utf8')));console.log('Prepared artifact hashes match');}
 else throw Error('Use prepare DIST PREVIOUS_DIST or verify DIST');
}
