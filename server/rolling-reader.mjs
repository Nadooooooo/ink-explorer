import {readFile} from 'node:fs/promises';
import {currentRollingStatistics} from '../src/rolling-statistics.ts';

export function createRollingReader({file,chainId,read=readFile,interval=500}) {
  let data=null,reading=false,stopped=false;
  const refresh=async()=>{
    if(stopped||reading||!file)return;
    reading=true;
    try{const body=await read(file,'utf8');if(body.length>16384)throw new Error('Oversized aggregate');const value=JSON.parse(body);if(!stopped)data=value;}
    catch{data=null;}finally{reading=false;}
  };
  const timer=file?setInterval(()=>void refresh(),interval):undefined;timer?.unref();void refresh();
  return {refresh,current(frame,now=Date.now()){
    return currentRollingStatistics({...frame,connected:true,sentAt:new Date(now).toISOString(),rolling24h:data},chainId);
  },close(){stopped=true;clearInterval(timer);data=null;}};
}
