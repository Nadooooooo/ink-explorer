import {RollingStore,localRpc,collectRollingWindow} from '../server/rolling-metrics.mjs';
import {mkdir,writeFile,rename} from 'node:fs/promises';
import {resolve} from 'node:path';
const network=process.argv[2];
if(!['mainnet','sepolia'].includes(network))throw new Error('Use mainnet or sepolia');
const chainId=network==='mainnet'?57073:763373,port=network==='mainnet'?8545:8645;
const directory=resolve(process.env.ROLLING_DATA_DIR||'data/rolling-metrics');
await mkdir(directory,{recursive:true});
const file=`${directory}/${chainId}.json`,store=new RollingStore(`${directory}/${chainId}.sqlite`,chainId),rpc=localRpc(`http://127.0.0.1:${port}`),controller=new AbortController();
process.on('SIGINT',()=>controller.abort(new Error('Stopped')));process.on('SIGTERM',()=>controller.abort(new Error('Stopped')));
const publish=async value=>{await writeFile(`${file}.tmp`,JSON.stringify(value)+'\n');await rename(`${file}.tmp`,file);};
let failures=0,lastLog=0,wake;
controller.signal.addEventListener('abort',()=>wake?.(),{once:true});
try{
 while(!controller.signal.aborted){
  const started=performance.now();
  try{
   const data=await collectRollingWindow({store,rpc,signal:controller.signal});
   await publish({status:'ready',...data});failures=0;
   if(Date.now()-lastLog>60000){console.log(JSON.stringify({network,head:data.window.toBlock,transactions:data.transactions,missingReceipts:data.missingReceipts,unknownFees:data.unknownFees,ms:Math.round(performance.now()-started)}));lastLog=Date.now();}
  }catch(error){
   if(controller.signal.aborted)break;
   failures++;await publish({status:'unavailable',chainId,sampledAt:new Date().toISOString(),error:error.message});
   console.error(JSON.stringify({network,error:error.message,failures}));
  }
  if(!controller.signal.aborted)await new Promise(resolve=>{const timer=setTimeout(resolve,failures?Math.min(60000,5000*failures):Math.max(100,1000-(performance.now()-started)));wake=()=>{clearTimeout(timer);resolve();};});
 }
}finally{await publish({status:'unavailable',chainId,sampledAt:new Date().toISOString(),error:'Collector stopped'});store.close();}
