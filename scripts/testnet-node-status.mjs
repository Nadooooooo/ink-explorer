import { mkdir, writeFile, appendFile } from "node:fs/promises";
const rpc = async (url, method, params = []) => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json();
  if (result.error) throw new Error(result.error.message);
  return result.result;
};
const local = process.env.INK_RPC || "http://127.0.0.1:8645";
const rollupUrl = process.env.INK_OP_NODE_RPC || "http://127.0.0.1:9645";
const reference = process.env.INK_PUBLIC_RPC || "https://rpc-gel-sepolia.inkonchain.com";
const metricsUrl = process.env.INK_METRICS_URL || "http://127.0.0.1:9101/metrics";
const [chain, syncing, block, rollup, metrics] = await Promise.all([
  rpc(local, "eth_chainId"),
  rpc(local, "eth_syncing"),
  rpc(local, "eth_getBlockByNumber", ["latest", false]),
  rpc(rollupUrl, "optimism_syncStatus"),
  fetch(metricsUrl).then((response) => response.text()),
]);
const ageSeconds = Math.floor(Date.now() / 1000) - Number(block.timestamp);
// The unsafe head can reorg or lead a public RPC. Compare the finalized block
// instead, while checking the current head's age separately.
const referenceHeight = Number(rollup.finalized_l2?.number || 0);
let matching = false;
if (referenceHeight > 0 && ageSeconds < 120) {
  const params = [`0x${referenceHeight.toString(16)}`, false];
  const [localFinalized, publicFinalized] = await Promise.all([
    rpc(local, "eth_getBlockByNumber", params),
    rpc(reference, "eth_getBlockByNumber", params),
  ]);
  matching = Boolean(
    localFinalized?.hash &&
    publicFinalized?.hash &&
    localFinalized.hash === publicFinalized.hash,
  );
}
const record = {
  recordedAt: new Date().toISOString(),
  chainId: Number(chain),
  executionSyncing: syncing !== false,
  head: Number(block.number),
  blockAgeSeconds: ageSeconds,
  referenceHeight,
  matchingReferenceHash: matching,
  safe: rollup.safe_l2?.number,
  finalized: rollup.finalized_l2?.number,
  target: rollup.unsafe_l2?.number,
  headersDownloaded: Number(
    metrics.match(/^reth_downloaders_headers_total_downloaded (\d+)$/m)?.[1] ||
      0,
  ),
  bodiesDownloaded: Number(
    metrics.match(/^reth_downloaders_bodies_total_downloaded (\d+)$/m)?.[1] ||
      0,
  ),
};
record.ready =
  record.chainId === 763373 &&
  !record.executionSyncing &&
  matching &&
  record.safe > 0 &&
  record.finalized > 0;
await mkdir("screenshots/testnet-node", { recursive: true });
await writeFile(
  "screenshots/testnet-node/status.json",
  JSON.stringify(record, null, 2),
);
await appendFile(
  "screenshots/testnet-node/history.jsonl",
  JSON.stringify(record) + "\n",
);
console.log(JSON.stringify(record, null, 2));
process.exitCode = record.ready ? 0 : 2;
