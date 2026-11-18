import { preview } from 'vite';
const server = await preview({preview:{host:'127.0.0.1',port:4310,strictPort:true,proxy:{
  '/testnet/api':{target:'http://127.0.0.1:4196',ws:true,rewrite:path=>path.replace(/^\/testnet/,'')},
  '/api':{target:'http://127.0.0.1:4194',ws:true},
}}});
server.printUrls();
