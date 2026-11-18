import assert from'node:assert/strict';import{readFile,writeFile,mkdir,cp,copyFile,access}from'node:fs/promises';import path from'node:path';
import{immutable,sha256,verifyLocalManifest}from'./release-artifacts.mjs';
export async function prepareCompatibility(previousSource,candidateDist,output){
 const previousDist=path.join(previousSource,'dist');
 const previous=JSON.parse(await readFile(path.join(previousDist,'release-artifacts.json'),'utf8'));
 const candidate=JSON.parse(await readFile(path.join(candidateDist,'release-artifacts.json'),'utf8'));
 await verifyLocalManifest(previousDist,previous);await verifyLocalManifest(candidateDist,candidate);
 await assert.rejects(access(output),/ENOENT/,'Compatibility output must be new');
 const config=JSON.parse(await readFile(path.join(previousSource,'wrangler.jsonc'),'utf8'));
 assert.equal(config.name,'inkexplorer');assert.equal(config.version_metadata?.binding,'DEPLOYMENT','Previous version must support the release version header');
 const manifest={schema:1,preparedAt:new Date().toISOString(),active:{...previous.active},retained:{...previous.retained}};
 // Preserve the old HTML, snapshots, mutable files and Worker. Only append
 // content-addressed files, so the existing interface remains unchanged.
 const copies=new Map(Object.keys({...previous.active,...previous.retained}).map(name=>[name,previousDist]));
 for(const[name,row]of Object.entries({...candidate.active,...candidate.retained})){
  if(!immutable.test(name))continue;
  const existing=manifest.active[name]||manifest.retained[name];
  if(existing){assert.equal(existing.sha256,row.sha256,`Immutable collision: ${name}`);continue;}
  if(candidate.active[name])manifest.active[name]=row;else manifest.retained[name]=row;
  copies.set(name,candidateDist);
 }
 await mkdir(output,{recursive:true});
 for(const directory of['src','server','cloudflare'])await cp(path.join(previousSource,directory),path.join(output,directory),{recursive:true});
 config.assets.directory='./dist';await writeFile(path.join(output,'wrangler.jsonc'),JSON.stringify(config,null,2));
 for(const[name,source]of copies){const destination=path.join(output,'dist',name);await mkdir(path.dirname(destination),{recursive:true});await copyFile(path.join(source,name),destination);assert.equal(sha256(await readFile(destination)),manifest.active[name]?.sha256||manifest.retained[name].sha256);}
 await writeFile(path.join(output,'dist/release-artifacts.json'),JSON.stringify(manifest,null,2));await verifyLocalManifest(path.join(output,'dist'),manifest);
 return manifest;
}
if(process.argv[1]&&path.resolve(process.argv[1])===new URL(import.meta.url).pathname){const[previous,candidate,output]=process.argv.slice(2);assert(previous&&candidate&&output,'Usage: PREVIOUS_SOURCE CANDIDATE_DIST OUTPUT_SOURCE');const m=await prepareCompatibility(previous,candidate,output);console.log(`Prepared unchanged interface with ${Object.keys(m.active).length+Object.keys(m.retained).length} compatible artifacts`);}
