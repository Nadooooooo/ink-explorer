import {test}from'node:test';import assert from'node:assert/strict';import{bootstrapServices}from'../server/public-service-startup.mjs';
import {execFile} from 'node:child_process';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {delimiter, dirname, join} from 'node:path';
import {promisify} from 'node:util';
const expected={name:'inkexplorer-site',cwd:'/ink',script:'server/public-site.mjs',env:{INK_SITE_PORT:'4197'}},online=(overrides={})=>({name:expected.name,pm2_env:{status:'online',pm_cwd:'/ink',pm_exec_path:'/ink/server/public-site.mjs',INK_SITE_PORT:'4197',...overrides}});
function harness({running=[],after=online(),checkOnly=false,apps=[expected]}={}){const starts=[];let values=running;return {starts,run:()=>bootstrapServices({groups:[['/ink/site.config.cjs',[expected.name]]],root:'/ink',checkOnly,list:async()=>values,loadConfig:()=>({apps}),start:async(config,name)=>{starts.push({config,name});values=[after];}})};}
test('an online service is preserved without a restart or configuration-wide operation',async()=>{const h=harness({running:[online(),{name:'other-project',pm2_env:{status:'online'}}]});const r=await h.run();assert.deepEqual(h.starts,[]);assert.equal(r.services[0].action,'preserved');});
test('a missing service starts only its explicitly selected name',async()=>{const h=harness({apps:[expected,{name:'other-project',script:'other.mjs'}]});await h.run();assert.deepEqual(h.starts,[{config:'/ink/site.config.cjs',name:'inkexplorer-site'}]);});
test('a live service from a different source is rejected before any mutation',async()=>{const h=harness({running:[online({pm_cwd:'/different-release'})]});await assert.rejects(h.run(),/Unexpected running source/);assert.deepEqual(h.starts,[]);});
test('the port is checked after starting, rather than accepting online alone',async()=>{const h=harness({after:online({INK_SITE_PORT:'8787'})});await assert.rejects(h.run(),/Unexpected INK_SITE_PORT/);assert.equal(h.starts.length,1);});
test('a process that reports online from the wrong script fails after startup',async()=>{const h=harness({after:online({pm_exec_path:'/other/server.mjs'})});await assert.rejects(h.run(),/Unexpected running source/);});
test('check mode reports an absent connector without starting it',async()=>{const h=harness({checkOnly:true});const r=await h.run();assert.equal(r.services[0].status,'not prepared');assert.deepEqual(h.starts,[]);});

test('the PM2 client receives only daemon settings and the selected service environment', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'ink-pm2-test-'));
  t.after(() => rm(dir, {recursive: true, force: true}));
  const names = ['api', 'sepolia', 'origin', 'rolling-mainnet', 'rolling-sepolia', 'monitor', 'site', 'tunnel'];
  const config = join(dir, 'custom.config.cjs');
  const tunnelFile = join(dir, 'tunnel-fixture');
  const apps = names.map(name => ({name: 'inkexplorer-' + name, cwd: dir, script: 'service.mjs', env: {FORK_SETTING: 'configured'}}));
  await writeFile(config, 'module.exports = ' + JSON.stringify({apps}));
  await writeFile(tunnelFile, 'fixture');
  await writeFile(join(dir, 'state.json'), '[]');

  // A real CLI boundary lets the test observe discovery before any service starts.
  const client = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const [command, config, only, name] = process.argv.slice(2);
const file = path.join(process.env.PM2_HOME, 'state.json');
const state = JSON.parse(fs.readFileSync(file, 'utf8'));
fs.appendFileSync(path.join(process.env.PM2_HOME, 'calls'), JSON.stringify({command, name, env:process.env}) + '\\n');
if (command === 'jlist') {
  if (config !== '--silent') console.log('Starting PM2 daemon');
  console.log(JSON.stringify(state));
} else if (command === 'start' && only === '--only') {
  const app = require(config).apps.find(app => app.name === name);
  if (app.env.FORK_SETTING !== 'configured') process.exit(1);
  state.push({name, pm2_env: {status:'online', pm_cwd:app.cwd, pm_exec_path:path.resolve(app.cwd, app.script), ...app.env}});
  fs.writeFileSync(file, JSON.stringify(state));
} else process.exit(1);
`;
  await writeFile(join(dir, 'pm2'), client, {mode: 0o700});
  const manager = {HOME: dir, PM2_HOME: dir, PATH: [dir, dirname(process.execPath)].join(delimiter)};
  const env = {
    ...manager, INK_API_CONFIG: config, INK_GATEWAY_CONFIG: config, INK_ROLLING_CONFIG: config, INK_SITE_CONFIG: config,
    INK_SITE_VERSION: 'revision', INK_ORIGIN_TOKEN: 'gateway-fixture', ROLLING_DATA_DIR: dir,
    BLOCKSCOUT_LOGS_API: 'https://example.test/api', MONITOR_ORIGIN: 'https://example.test', INK_TUNNEL_TOKEN_FILE: tunnelFile,
    PORT: '1234', SSH_AUTH_SOCK: 'agent-fixture', UNRELATED_SESSION_VALUE: 'session-fixture',
  };
  const script = join(import.meta.dirname, 'public-services-bootstrap.mjs');
  const run = promisify(execFile);
  await run(process.execPath, [script, '--check'], {env});
  await run(process.execPath, [script], {env});
  const calls = (await readFile(join(dir, 'calls'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  const inspections = calls.filter(call => call.command === 'jlist');
  assert.equal(inspections.length, names.length + 2);
  for (const call of inspections) assert.deepEqual(call.env, manager);

  const serviceKey = ['BLOCKSCOUT_LOGS_API', 'BLOCKSCOUT_LOGS_API', 'INK_ORIGIN_TOKEN', 'ROLLING_DATA_DIR',
    'ROLLING_DATA_DIR', 'MONITOR_ORIGIN', 'INK_SITE_VERSION', 'INK_TUNNEL_TOKEN_FILE'];
  const starts = calls.filter(call => call.command === 'start');
  assert.deepEqual(starts.map(call => call.name), apps.map(app => app.name));
  for (const [index, call] of starts.entries()) {
    const setting = serviceKey[index];
    assert.deepEqual(call.env, {...manager, [setting]: env[setting]});
  }
});
