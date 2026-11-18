const cwd = __dirname;
const fs = require("node:fs");
const environment = file => Object.fromEntries(fs.readFileSync(`${cwd}/${file}`, "utf8").split("\n").filter(line => line.trim() && !line.trim().startsWith("#") && line.includes("=")).map(line => { const at = line.indexOf("="); return [line.slice(0, at), line.slice(at + 1).replace(/^["']|["']$/g, "")]; }));
module.exports = { apps: [
  { name: "inkexplorer-api", cwd, script: "server/server.mjs", env: { ...environment(".env"), INK_NETWORK: "mainnet" }, autorestart: true, max_memory_restart: "1G", kill_timeout: 10000 },
  { name: "inkexplorer-sepolia", cwd, script: "server/server.mjs", env: environment(".env.sepolia"), autorestart: true, max_memory_restart: "1G", kill_timeout: 10000 },
  { name: "inkexplorer-origin", cwd, script: "server/public-gateway.mjs", env: environment(".env.gateway"), autorestart: true, max_memory_restart: "256M", kill_timeout: 10000 }
] };
