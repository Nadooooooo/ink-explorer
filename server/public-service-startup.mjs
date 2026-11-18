import {resolve} from 'node:path';

function verifyService(actual, expected, cwd, script) {
  if(actual?.pm2_env.status!=='online')throw Error('Service did not start: '+expected.name);
  if(actual.pm2_env.pm_cwd!==cwd||actual.pm2_env.pm_exec_path!==script)throw Error('Unexpected running source for '+expected.name);
  for(const key of ['PORT','INK_GATEWAY_PORT','INK_ROLLING_DATA_DIR','INK_SITE_PORT']) {
    if(expected.env?.[key]!==undefined&&String(actual.pm2_env[key])!==String(expected.env[key]))throw Error('Unexpected '+key+' for '+expected.name);
  }
}

// The caller supplies an explicit list; this operation never resurrects a dump,
// restarts an online process or starts every application in an ecosystem file.
export async function bootstrapServices({groups, root, checkOnly, list, loadConfig, start}) {
  let running=await list();const result=[];
  for(const[config,names]of groups) {
    const apps=loadConfig(config).apps;
    for(const name of names) {
      const expected=apps.find(app=>app.name===name);if(!expected)throw Error('Missing declared service '+name);
      const cwd=expected.cwd||root,script=resolve(cwd,expected.script);
      let actual=running.find(app=>app.name===name);
      if(actual?.pm2_env.status==='online') {
        verifyService(actual,expected,cwd,script);result.push({name,status:'online',action:'preserved'});continue;
      }
      if(checkOnly) {result.push({name,status:actual?.pm2_env.status||'not prepared',action:'would start'});continue;}
      await start(config,name);running=await list();actual=running.find(app=>app.name===name);
      verifyService(actual,expected,cwd,script);result.push({name,status:'online',action:'started'});
    }
  }
  return {checkOnly,services:result};
}
