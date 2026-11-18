import {execFile} from 'node:child_process';
import {access} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {promisify} from 'node:util';
import {bootstrapServices} from '../server/public-service-startup.mjs';

const run = promisify(execFile);
const root = resolve(import.meta.dirname, '..');
const checkOnly = process.argv.includes('--check');
const loadConfig = createRequire(import.meta.url);
const env = {...process.env};
delete env.PORT;

// Operators can keep each service on a separate release checkout.
const siteConfig = resolve(root, env.INK_SITE_CONFIG || 'ecosystem.site.config.cjs');
const groups = [
  [resolve(root, env.INK_API_CONFIG || 'ecosystem.production.config.cjs'), ['inkexplorer-api', 'inkexplorer-sepolia']],
  [resolve(root, env.INK_GATEWAY_CONFIG || 'ecosystem.production.config.cjs'), ['inkexplorer-origin']],
  [resolve(root, env.INK_ROLLING_CONFIG || 'ecosystem.rolling.config.cjs'), ['inkexplorer-rolling-mainnet', 'inkexplorer-rolling-sepolia']],
  [siteConfig, ['inkexplorer-monitor', 'inkexplorer-site', 'inkexplorer-tunnel']],
];
if (!checkOnly) {
  const tunnel = loadConfig(siteConfig).apps.find(app => app.name === 'inkexplorer-tunnel');
  if (!tunnel) throw new Error('Missing tunnel service in the site configuration');
  const tokenFile = tunnel.env?.INK_TUNNEL_TOKEN_FILE || env.INK_TUNNEL_TOKEN_FILE || 'runtime/tunnel-token';
  await access(resolve(tunnel.cwd || root, tokenFile));
}

const result = await bootstrapServices({
  groups, root, checkOnly, loadConfig,
  async list() {
    const {stdout} = await run('pm2', ['jlist'], {env, maxBuffer: 8 * 1024 * 1024});
    return JSON.parse(stdout);
  },
  start: (config, name) => run('pm2', ['start', config, '--only', name, '--silent'], {env}),
});
console.log(JSON.stringify(result));
