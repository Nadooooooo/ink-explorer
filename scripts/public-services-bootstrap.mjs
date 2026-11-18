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

function selectedEnvironment(keys) {
  return Object.fromEntries(keys.filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
}

// Even jlist may start the PM2 daemon. Keep operator credentials out of its environment.
const managerEnv = selectedEnvironment(['HOME', 'PATH', 'PM2_HOME']);
const apiSettings = [
  'HOST', 'PUBLIC_URL', 'EXPLORER_BROWSER_ORIGIN', 'WALLETCONNECT_PROJECT_ID',
  'BLOCKSCOUT_API', 'BLOCKSCOUT_STATS_API', 'BLOCKSCOUT_LOGS_API', 'CONTRACT_INFO_API',
  'INK_NETWORK', 'INK_TESTNET_PORT', 'INK_RPC', 'INK_RPC_WS', 'INK_PUBLIC_RPC', 'INK_OP_NODE_RPC',
  'INK_METRICS_URL', 'INK_NODE_DATA_DIR', 'INK_L1_FAILOVER_STATUS', 'INK_ROLLING_DATA_DIR',
];
const serviceSettings = {
  'inkexplorer-api': apiSettings,
  'inkexplorer-sepolia': apiSettings,
  'inkexplorer-origin': ['INK_GATEWAY_PORT', 'INK_GATEWAY_UPSTREAM', 'INK_ORIGIN_TOKEN'],
  'inkexplorer-rolling-mainnet': ['ROLLING_DATA_DIR'],
  'inkexplorer-rolling-sepolia': ['ROLLING_DATA_DIR'],
  'inkexplorer-monitor': ['MONITOR_ORIGIN', 'MONITOR_API_ORIGIN'],
  'inkexplorer-site': [
    'INK_SITE_PORT', 'INK_SITE_PUBLIC_URL', 'INK_SITE_GATEWAY', 'INK_SITE_ORIGIN_TOKEN_FILE',
    'INK_SITE_VERSION', 'INK_SITE_PREVIEW_HOSTS', 'INK_MIGRATION_PREVIEW_HOST',
  ],
  'inkexplorer-tunnel': ['INK_TUNNEL_TOKEN_FILE'],
};

// Operators can keep each service on a separate release checkout.
const siteConfig = resolve(root, process.env.INK_SITE_CONFIG || 'ecosystem.site.config.cjs');
const groups = [
  [resolve(root, process.env.INK_API_CONFIG || 'ecosystem.production.config.cjs'), ['inkexplorer-api', 'inkexplorer-sepolia']],
  [resolve(root, process.env.INK_GATEWAY_CONFIG || 'ecosystem.production.config.cjs'), ['inkexplorer-origin']],
  [resolve(root, process.env.INK_ROLLING_CONFIG || 'ecosystem.rolling.config.cjs'), ['inkexplorer-rolling-mainnet', 'inkexplorer-rolling-sepolia']],
  [siteConfig, ['inkexplorer-monitor', 'inkexplorer-site', 'inkexplorer-tunnel']],
];
if (!checkOnly) {
  const tunnel = loadConfig(siteConfig).apps.find(app => app.name === 'inkexplorer-tunnel');
  if (!tunnel) throw new Error('Missing tunnel service in the site configuration');
  const tokenFile = tunnel.env?.INK_TUNNEL_TOKEN_FILE || process.env.INK_TUNNEL_TOKEN_FILE || 'runtime/tunnel-token';
  await access(resolve(tunnel.cwd || root, tokenFile));
}

const result = await bootstrapServices({
  groups, root, checkOnly, loadConfig,
  async list() {
    const {stdout} = await run('pm2', ['jlist', '--silent'], {env: managerEnv, maxBuffer: 8 * 1024 * 1024});
    return JSON.parse(stdout);
  },
  start: (config, name) => run('pm2', ['start', config, '--only', name, '--silent'], {
    env: {...managerEnv, ...selectedEnvironment(serviceSettings[name])},
  }),
});
console.log(JSON.stringify(result));
