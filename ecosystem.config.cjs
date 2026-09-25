module.exports = {
  apps: [{
    name: "ink-observer",
    script: "server/server.mjs",
    cwd: __dirname,
    node_args: "--env-file-if-exists=.env",
    env: { NODE_ENV: "production" },
    max_memory_restart: "500M",
    time: true,
  }, {
    name: "ink-observer-sepolia",
    script: "server/server.mjs",
    cwd: __dirname,
    node_args: "--env-file-if-exists=.env.sepolia",
    env: { NODE_ENV: "production", INK_NETWORK: "sepolia" },
    max_memory_restart: "500M",
    time: true,
  }],
};
