module.exports = {
  apps: [
    {
      name: 'inkexplorer-site',
      cwd: __dirname,
      script: 'server/public-site.mjs',
      interpreter: process.execPath,
      env: {
        INK_SITE_PORT: process.env.INK_SITE_PORT || '4197',
        INK_SITE_PUBLIC_URL: process.env.INK_SITE_PUBLIC_URL || 'https://inkexplorer.xyz',
      },
      time: true,
      max_memory_restart: '512M',
      kill_timeout: 10000,
      autorestart: true,
    },
    {
      name: 'inkexplorer-tunnel',
      cwd: __dirname,
      script: 'scripts/run-site-tunnel.sh',
      interpreter: '/bin/bash',
      time: true,
      max_memory_restart: '256M',
      autorestart: true,
    },
    {
      name: 'inkexplorer-monitor',
      cwd: __dirname,
      script: 'scripts/production-monitor.mjs',
      env: { MONITOR_API_ORIGIN: process.env.MONITOR_API_ORIGIN || 'http://127.0.0.1:4194' },
      time: true,
      max_memory_restart: '256M',
      autorestart: true,
    },
  ],
};
