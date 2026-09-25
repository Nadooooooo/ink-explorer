import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

// Read-only completion witness. Exits only after the full readiness gate passes.
// The node containers keep synchronizing independently of this observer.
let sample = 0;
for (;;) {
  const child = spawn(process.execPath, ["scripts/testnet-node-status.mjs"], { stdio: ["ignore", "pipe", "pipe"] });
  let error = "";
  child.stdout.resume();
  child.stderr.on("data", chunk => { error += String(chunk); });
  const code = await new Promise(resolve => child.on("exit", resolve));
  if (code === 0) {
    console.log("READY: local chain identity, recent block/reference hash, safe and finalized heads verified.");
    console.log(await readFile("screenshots/testnet-node/status.json", "utf8"));
    break;
  }
  if (code === 2) {
    const status = JSON.parse(await readFile("screenshots/testnet-node/status.json", "utf8"));
    if (sample++ % 5 === 0) console.log(`${status.recordedAt} syncing: headers=${status.headersDownloaded}, bodies=${status.bodiesDownloaded}, executed=${status.head}, target=${status.target}`);
  } else console.log(`${new Date().toISOString()} readiness probe failed; retrying: ${error.trim().slice(0, 300)}`);
  await new Promise(resolve => setTimeout(resolve, 60000));
}
