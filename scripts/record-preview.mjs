import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){try{return n(s,c)}catch(e){if(s.startsWith('./')&&c.parentURL?.includes('/src/')&&!/\.[a-z]+$/.test(s))return n(s+'.ts',c);throw e;}}});
const {handleRequest}=await import('../cloudflare/worker.mjs');
const port=Number(process.env.INK_RECORD_PREVIEW_PORT||4310),mime={'.js':'text/javascript','.css':'text/css','.json':'application/json','.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.woff':'font/woff'};
const env={PUBLIC_URL:'http://127.0.0.1:'+port,API_ORIGIN:'http://127.0.0.1:'+port+'/__origin',ORIGIN_TOKEN:'local-preview-only',DEPLOYMENT:{id:'local-detail-arrival'},ASSETS:{async fetch(r){const path=new URL(r.url).pathname;if(path.includes('..'))return new Response('Invalid',{status:400});try{const body=await readFile('dist'+path);const ext=path.slice(path.lastIndexOf('.'));return new Response(body,{headers:{'content-type':mime[ext]||'application/octet-stream'}});}catch{return new Response('Missing',{status:404});}}}};
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1:'+port);
  let response;
  if(url.pathname.startsWith('/__origin/')){
   const path=url.pathname.slice('/__origin'.length),testnet=path.startsWith('/testnet/');
   response=await fetch('http://127.0.0.1:'+(testnet?Number(process.env.INK_PREVIEW_TESTNET_API_PORT||4196):Number(process.env.INK_PREVIEW_MAINNET_API_PORT||4194))+(testnet?path.slice(8):path)+url.search,{headers:{accept:req.headers.accept||'application/json'}});
  }else response=await handleRequest(new Request(url,{method:req.method,headers:req.headers}),env);
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(e){res.writeHead(500);res.end(String(e));}
});
server.listen(port,'127.0.0.1',()=>console.log('Record preview on http://127.0.0.1:'+port));
// Browser WebSockets are controlled in fixture tests. Real-flow acceptance uses
// the HTTPS candidate on Cloudflare, not this HTTP-only local test server.
