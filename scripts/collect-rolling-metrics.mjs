import {RollingStore,localRpc,collectRollingWindow} from '../server/rolling-metrics.mjs';
import {mkdir,writeFile,rename} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {spawn} from 'node:child_process';
const network=process.argv[2]||'mainnet';
if(!['mainnet','sepolia'].includes(network))throw new Error('Use mainnet or sepolia');
const chainId=network==='mainnet'?57073:763373,port=network==='mainnet'?8545:8645;
const directory=resolve(process.env.ROLLING_DATA_DIR||'data/rolling-metrics'),output=resolve(process.env.ROLLING_OUTPUT||`reports/rolling-metrics/${network}.json`);
await mkdir(dirname(output),{recursive:true});
await mkdir(directory,{recursive:true});
// Share the service's OS lock so an ad hoc collection never races its writer.
if(process.env.INK_ROLLING_LOCKED!=='1'){
 const child=spawn('/usr/bin/flock',['-n','-F',`${directory}/${network}.lock`,process.execPath,process.argv[1],network],{stdio:'inherit',env:{...process.env,INK_ROLLING_LOCKED:'1'}});
 const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>resolve(code??1));});
 if(code!==0)console.error('Collection did not complete; check whether the managed collector already holds the writer lock.');
 process.exit(code);
}
const store=new RollingStore(`${directory}/${chainId}.sqlite`,chainId),rpc=localRpc(`http://127.0.0.1:${port}`),controller=new AbortController();
process.on('SIGINT',()=>controller.abort(new Error('Stopped')));process.on('SIGTERM',()=>controller.abort(new Error('Stopped')));
let lastLog=0,result;
try{
 for(let attempt=0;attempt<4;attempt++){
  try{
   result=await collectRollingWindow({store,rpc,signal:controller.signal,windowSeconds:Number(process.env.ROLLING_WINDOW||86400),onProgress:p=>{if(Date.now()-lastLog>10000){console.log(JSON.stringify({network,...p}));lastLog=Date.now();}}});break;
  }catch(error){
   console.error(network,error.message);
   if(controller.signal.aborted||attempt===3)throw error;
  }
 }
 await writeFile(output+'.tmp',JSON.stringify(result,null,2)+'\n');await rename(output+'.tmp',output);
 console.log(JSON.stringify({network,output,...result}));
}finally{store.close();}
