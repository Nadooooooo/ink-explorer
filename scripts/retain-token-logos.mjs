import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base=process.env.LOGO_SOURCE || 'http://127.0.0.1:4310/api';
const data=await(await fetch(`${base}/explorer/tokens`)).json();
const records=[],mapping={};
await mkdir('public/assets/marks',{recursive:true});
for(const token of data.items || []){
  if(!token.icon_url || mapping[token.icon_url])continue;
  try {
    const response=await fetch(`${base}/media?kind=logo&url=${encodeURIComponent(token.icon_url)}`,{signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const type=response.headers.get('content-type')?.split(';')[0];
    const extension=({'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/svg+xml':'svg','image/gif':'gif','image/avif':'avif'})[type];
    const bytes=Buffer.from(await response.arrayBuffer());if(!extension || bytes.length>2*1024*1024)throw new Error('Unsupported logo');
    const sha256=createHash('sha256').update(bytes).digest('hex');
    const path=`/assets/marks/${sha256.slice(0,24)}.${extension}`;
    await writeFile(`public${path}`,bytes);mapping[token.icon_url]=path;
    records.push({symbol:token.symbol,address:token.address_hash,source:token.icon_url,path,sha256,bytes:bytes.length});
  }catch(error){records.push({symbol:token.symbol,source:token.icon_url,error:error.message});}
}
await writeFile('src/local-logos.json',JSON.stringify(mapping,null,2));
await writeFile('public/assets/marks/provenance.json',JSON.stringify({retainedAt:new Date().toISOString(),purpose:'Token identification; marks remain the property of their respective owners.',records},null,2));
console.log({retained:Object.keys(mapping).length,failed:records.filter(r=>r.error).length,bytes:records.reduce((sum,r)=>sum+(r.bytes||0),0)});
