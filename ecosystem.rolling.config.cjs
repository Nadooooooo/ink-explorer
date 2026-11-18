const path=require('node:path');
module.exports={apps:['mainnet','sepolia'].map(network=>({
 name:`inkexplorer-rolling-${network}`,cwd:__dirname,script:'/usr/bin/flock',interpreter:'none',
 args:['-n','-F',path.join(__dirname,`data/rolling-metrics/${network}.lock`),process.execPath,path.join(__dirname,'scripts/rolling-metrics-service.mjs'),network],
 autorestart:true,restart_delay:5000,kill_timeout:20000,max_memory_restart:'512M',time:true,
}))};
