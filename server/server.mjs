import http from "node:http";
import { mkdir, readFile, readdir, stat, statfs, unlink, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";
import { Agent, fetch as safeFetch } from "undici";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  brotliCompressSync,
  constants as zlibConstants,
  gzipSync,
} from "node:zlib";
import { WebSocket, WebSocketServer } from "ws";
import { proxyTestnet, proxyTestnetSocket } from "./testnet-proxy.mjs";
import { createContractRpc } from "./contract-rpc.mjs";
import { nodeReadiness } from "./node-readiness.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const dist = path.join(root, "dist");
const testnet = process.env.INK_NETWORK === "sepolia";
const port = Number(process.env.PORT || (testnet ? 4190 : 4188));
const chainId = testnet ? 763373 : 57073;
const networkName = testnet ? "Ink Sepolia" : "Ink Mainnet";
const basePath = testnet ? "/testnet" : "";
const explorerOrigin = testnet ? "https://explorer-sepolia.inkonchain.com" : "https://explorer.inkonchain.com";
const explorerApi = (
  process.env.BLOCKSCOUT_API || `${explorerOrigin}/api/v2`
).replace(/\/$/, "");
const statsApi = (
  process.env.BLOCKSCOUT_STATS_API ||
  `${explorerOrigin}/stats-service/api/v1`
).replace(/\/$/, "");
const contractInfoApi = (
  process.env.CONTRACT_INFO_API ||
  `https://contracts-info.services.blockscout.com/api/v1/chains/${chainId}`
).replace(/\/$/, "");
const configuredPublicUrl = process.env.PUBLIC_URL?.replace(/\/$/, "");
const rpcUrl = process.env.INK_RPC || `http://127.0.0.1:${testnet ? 8645 : 8545}`;
const opNodeRpc = process.env.INK_OP_NODE_RPC || `http://127.0.0.1:${testnet ? 9645 : 9545}`;
const metricsUrl = process.env.INK_METRICS_URL || `http://127.0.0.1:${testnet ? 9101 : 9001}/metrics`;
const nodeDataDir = process.env.INK_NODE_DATA_DIR?.trim();
const contractRpc = createContractRpc({ localUrl: rpcUrl, chainId,
  publicUrl: process.env.INK_PUBLIC_RPC || (testnet ? "https://rpc-gel-sepolia.inkonchain.com" : "https://rpc-gel.inkonchain.com") });
const l1FailoverStatusUrl =
  process.env.INK_L1_FAILOVER_STATUS || "http://127.0.0.1:18545/readyz";
const startedAt = Date.now();
const cache = new Map();
const upstreamCache = new Map();
const upstreamInflight = new Map();
const cacheDir = path.join(root, "data", "upstream-cache");
const mediaCacheDir = path.join(root, "data", "media-cache");
await mkdir(cacheDir, { recursive: true });
await mkdir(mediaCacheDir, { recursive: true });
const MiB = 1024 * 1024;
const cacheLimits = [
  { dir: cacheDir, bytes: 256 * MiB, age: 24 * 60 * 60 * 1000 },
  { dir: mediaCacheDir, bytes: 512 * MiB, age: 30 * 24 * 60 * 60 * 1000 },
];
let pruneRunning = false;
let lastPrune = 0;

async function pruneCacheDir({ dir, bytes, age }) {
  const files = [];
  for (const name of await readdir(dir)) {
    const file = path.join(dir, name);
    try {
      const info = await stat(file);
      if (info.isFile()) files.push({ file, size: info.size, at: info.mtimeMs });
    } catch { /* another request may have removed it */ }
  }
  files.sort((a, b) => a.at - b.at);
  let total = files.reduce((sum, file) => sum + file.size, 0);
  const now = Date.now();
  for (const file of files) {
    if (now - file.at <= age && total <= bytes) break;
    await unlink(file.file).catch(() => {});
    total -= file.size;
  }
}

function scheduleCachePrune() {
  if (pruneRunning || Date.now() - lastPrune < 60_000) return;
  pruneRunning = true;
  lastPrune = Date.now();
  Promise.all(cacheLimits.map((limit) => pruneCacheDir(limit)))
    .catch((error) => console.error("Cache prune failed:", error))
    .finally(() => { pruneRunning = false; });
}
scheduleCachePrune();
const pruneTimer = setInterval(scheduleCachePrune, 60 * 60 * 1000);
pruneTimer.unref();

function setBounded(map, key, value, limit) {
  map.delete(key);
  map.set(key, value);
  if (map.size > limit) map.delete(map.keys().next().value);
}
const diskCachePath = (url) =>
  path.join(cacheDir, `${createHash("sha256").update(url).digest("hex")}.json`);

const MAX_MEDIA_BYTES = 8 * 1024 * 1024;
const allowedMediaTypes = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/svg+xml",
]);
const mediaKey = (url) => createHash("sha256").update(url).digest("hex");

function safeSvg(body) {
  const source = body.toString("utf8");
  // SVG is active XML, so accept only self-contained artwork. Event handlers,
  // scripts, embedded HTML, entities and external resource references are not
  // needed for token marks and are rejected before the file reaches a browser.
  const activeMarkup =
    /<(?:script|style|foreignObject|iframe|object|embed)\b|<!DOCTYPE|<!ENTITY|\bon[a-z]+\s*=|\bstyle\s*=|javascript\s*:/i;
  const externalReference =
    /\b(?:href|src)\s*=\s*["'](?!#|data:image\/)[^"']+/i;
  const externalCssUrl = /url\(\s*["']?(?!#|data:image\/)[^)]+\)/i;
  if (
    !/^\s*(?:<\?xml[^>]*>\s*)?<svg\b/i.test(source) ||
    activeMarkup.test(source) ||
    externalReference.test(source) ||
    externalCssUrl.test(source)
  ) {
    throw new Error("Unsafe SVG image");
  }
}

async function readMediaBody(response) {
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_MEDIA_BYTES) throw new Error("Image is larger than 8 MB");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  if (!size) throw new Error("Invalid image size");
  return Buffer.concat(chunks, size);
}

function privateAddress(address) {
  try {
    let parsed = ipaddr.parse(address);
    if (parsed.kind() === "ipv6" && parsed.isIPv4MappedAddress())
      parsed = parsed.toIPv4Address();
    return parsed.range() !== "unicast";
  } catch {
    return true;
  }
}

async function safeMediaUrl(value) {
  if (!value || value.length > 3000) throw new Error("Invalid media URL");
  const target = new URL(value);
  if (
    target.protocol !== "https:" ||
    target.username ||
    target.password ||
    target.port
  )
    throw new Error("Only public HTTPS media is supported");
  const addresses = await lookup(target.hostname, {
    all: true,
    verbatim: true,
  });
  if (
    !addresses.length ||
    addresses.some((item) => privateAddress(item.address))
  )
    throw new Error("Private media hosts are blocked");
  // Keep the checked DNS answer for the connection itself. Resolving again
  // inside fetch would leave a gap for DNS rebinding.
  const chosen = addresses.find((item) => item.family === 4) || addresses[0];
  return { url: target, address: chosen.address, family: chosen.family };
}

async function fetchMedia(value) {
  const initial = await safeMediaUrl(value);
  const key = mediaKey(initial.url.href);
  const bodyPath = path.join(mediaCacheDir, `${key}.bin`);
  const metaPath = path.join(mediaCacheDir, `${key}.json`);
  try {
    const [body, meta] = await Promise.all([
      readFile(bodyPath),
      readFile(metaPath, "utf8").then(JSON.parse),
    ]);
    if (meta.url === initial.url.href && allowedMediaTypes.has(meta.type))
      return { body, type: meta.type, key, cached: true };
  } catch {
    /* cache miss */
  }

  const ipfsPath = initial.url.pathname.match(/^\/ipfs\/(.+)$/)?.[1];
  const candidates = ipfsPath
    ? [
        await safeMediaUrl(`https://gateway.pinata.cloud/ipfs/${ipfsPath}`),
        initial,
      ]
    : [initial];
  let lastError = new Error("Media unavailable");
  for (const candidate of candidates) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    let target = candidate;
    try {
      for (let redirect = 0; redirect <= 3; redirect++) {
        const dispatcher = new Agent({
          connect: {
            lookup: (_host, options, callback) =>
              options.all
                ? callback(null, [{ address: target.address, family: target.family }])
                : callback(null, target.address, target.family),
          },
        });
        let response;
        try {
          response = await safeFetch(target.url, {
            dispatcher,
            signal: controller.signal,
            redirect: "manual",
            headers: {
              accept: "image/avif,image/webp,image/png,image/jpeg,image/gif",
              "user-agent": "InkExplorer/0.1",
            },
          });
          if (
            response.status >= 300 &&
            response.status < 400 &&
            response.headers.get("location")
          ) {
            target = await safeMediaUrl(
              new URL(response.headers.get("location"), target.url).href,
            );
            continue;
          }
          if (!response.ok)
            throw new Error(`Media origin returned ${response.status}`);
          const type = (response.headers.get("content-type") || "")
            .split(";")[0]
            .toLowerCase();
          const declaredSize = Number(
            response.headers.get("content-length") || 0,
          );
          if (!allowedMediaTypes.has(type))
            throw new Error("Unsupported image format");
          if (declaredSize > MAX_MEDIA_BYTES)
            throw new Error("Image is larger than 8 MB");
          const body = await readMediaBody(response);
          if (type === "image/svg+xml") safeSvg(body);
          await Promise.all([
            writeFile(bodyPath, body),
            writeFile(
              metaPath,
              JSON.stringify({
                url: initial.url.href,
                origin: target.url.href,
                type,
                bytes: body.length,
                cachedAt: new Date().toISOString(),
              }),
            ),
          ]);
          scheduleCachePrune();
          return { body, type, key, cached: false };
        } finally {
          if (response?.body && !response.bodyUsed)
            await response.body.cancel().catch(() => {});
          await dispatcher.close();
        }
      }
      throw new Error("Too many media redirects");
    } catch (error) {
      lastError = error instanceof Error ? error : lastError;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

function json(res, status, body, extra = {}) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "x-robots-tag": "noindex, nofollow",
    ...extra,
  });
  res.end(JSON.stringify(body));
}

async function cached(key, ttl, loader) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  const value = await loader();
  setBounded(cache, key, { at: Date.now(), value }, 1000);
  return value;
}

async function fetchJson(url, timeout = 12000) {
  let previous = upstreamCache.get(url);
  if (!previous) {
    try {
      const stored = JSON.parse(await readFile(diskCachePath(url), "utf8"));
      if (stored.url === url) {
        previous = { at: stored.at, value: stored.value };
        setBounded(upstreamCache, url, previous, 2000);
      }
    } catch {
      /* cold cache */
    }
  }
  if (previous && Date.now() - previous.at < 15000) return previous.value;
  if (upstreamInflight.has(url)) return upstreamInflight.get(url);
  if (upstreamInflight.size >= 200) throw new Error("Too many upstream requests");
  const request = fetchJsonUncached(url, timeout, previous);
  upstreamInflight.set(url, request);
  try {
    const value = await request;
    const entry = { at: Date.now(), value };
    setBounded(upstreamCache, url, entry, 2000);
    writeFile(diskCachePath(url), JSON.stringify({ url, ...entry })).catch(
      () => {},
    );
    scheduleCachePrune();
    return value;
  } finally {
    upstreamInflight.delete(url);
  }
}

async function fetchJsonUncached(url, timeout, previous) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      let response;
      try {
        response = await fetch(url, {
          signal: controller.signal,
          headers: {
            accept: "application/json",
            "user-agent": "InkExplorer/0.1",
          },
        });
      } catch (error) {
        if (!controller.signal.aborted && attempt < 2) {
          await new Promise((resolve) =>
            setTimeout(resolve, 350 * (attempt + 1)),
          );
          continue;
        }
        if (previous && Date.now() - previous.at < 24 * 60 * 60 * 1000)
          return previous.value;
        throw error;
      }
      if (response.ok) return await response.json();
      // The public index can briefly rate-limit or return gateway errors while
      // catching up. Retry only transient statuses; permanent 4xx responses
      // still fail immediately, and a previously verified snapshot wins when
      // one exists.
      const transient = response.status === 429 || response.status >= 500;
      if (transient && attempt < 2) {
        const retryAfter = Number(response.headers.get("retry-after"));
        const delay =
          Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.min(retryAfter * 1000, 3000)
            : (response.status === 429 ? 900 : 350) * (attempt + 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      if (previous && Date.now() - previous.at < 24 * 60 * 60 * 1000)
        return previous.value;
      throw new Error(`Upstream returned ${response.status}`);
    }
    throw new Error("Upstream retry limit reached");
  } finally {
    clearTimeout(timer);
  }
}

async function rpc(url, method, params = []) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const payload = await response.json();
    if (payload.error) throw new Error(payload.error.message || "RPC error");
    return payload.result;
  } finally {
    clearTimeout(timer);
  }
}

const hexNumber = (value) =>
  value == null ? null : Number.parseInt(value, 16);

async function l1FailoverSnapshot() {
  if (testnet) return { online: false, status: "not configured", upstreams: [] };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch(l1FailoverStatusUrl, {
      signal: controller.signal,
    });
    const payload = await response.json();
    return {
      online: response.ok,
      status: payload.status || (response.ok ? "ready" : "degraded"),
      upstreams: Array.isArray(payload.upstreams) ? payload.upstreams : [],
    };
  } catch {
    return { online: false, status: "unavailable", upstreams: [] };
  } finally {
    clearTimeout(timer);
  }
}

async function networkSnapshot() {
  const probes = await Promise.allSettled([
    rpc(rpcUrl, "eth_getBlockByNumber", ["latest", false]),
    rpc(rpcUrl, "eth_syncing"),
    rpc(rpcUrl, "net_peerCount"),
    rpc(rpcUrl, "eth_gasPrice"),
    rpc(rpcUrl, "eth_chainId"),
    rpc(opNodeRpc, "opp2p_peerStats"),
    rpc(opNodeRpc, "optimism_syncStatus"),
    l1FailoverSnapshot(),
    cached("execution-progress", 10000, async () => {
      const response = await fetch(metricsUrl, { signal: AbortSignal.timeout(1500) });
      if (!response.ok) throw new Error("Metrics unavailable");
      const metrics = await response.text();
      const metric = name => {
        const match = metrics.match(new RegExp(`^${name} ([0-9.e+]+)$`, "m"));
        return match ? Number(match[1]) : null;
      };
      return { headersDownloaded: metric("reth_downloaders_headers_total_downloaded"), bodiesDownloaded: metric("reth_downloaders_bodies_total_downloaded") };
    }),
  ]);
  const value = (index, fallback = null) =>
    probes[index].status === "fulfilled" ? probes[index].value : fallback;
  let disk = null;
  if (nodeDataDir) {
    try {
      const fs = await statfs(nodeDataDir);
      disk = {
        total: fs.blocks * fs.bsize,
        free: fs.bavail * fs.bsize,
        used: (fs.blocks - fs.bfree) * fs.bsize,
      };
    } catch {
      /* The explorer may run away from the node host. */
    }
  }

  const sync = value(1);
  const p2p = value(5, {});
  const rollup = value(6, {});
  const readiness = nodeReadiness({ chain: value(4), expectedChainId: chainId, sync, block: value(0) });
  const head = readiness.head;
  const finalized = rollup?.finalized_l2?.number ?? null;
  return {
    ...readiness,
    networkName,
    expectedChainId: chainId,
    sync,
    syncProgress: { ...value(8, {}), target: rollup?.unsafe_l2?.number ?? null },
    chainId: hexNumber(value(4)),
    head,
    gasPriceWei: hexNumber(value(3)),
    executionPeers: hexNumber(value(2)) ?? 0,
    rollupPeers: p2p.connected ?? 0,
    routingTablePeers: p2p.table ?? 0,
    knownPeers: p2p.known ?? 0,
    topicPeers: p2p.blocksTopicV4 ?? p2p.blocksTopicV3 ?? p2p.blocksTopic ?? 0,
    safeBlock: rollup?.safe_l2?.number ?? null,
    finalizedBlock: finalized,
    finalityLag: head && finalized ? head - finalized : null,
    l1Head: rollup?.head_l1?.number ?? null,
    l1Rpc: value(7, { online: false, status: "unavailable", upstreams: [] }),
    disk,
    sampledAt: new Date().toISOString(),
    serviceUptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
  };
}

async function overview() {
  const [stats, blocks, transactions, chart, network] = await Promise.all([
    fetchJson(`${explorerApi}/stats`),
    fetchJson(`${explorerApi}/blocks`),
    fetchJson(`${explorerApi}/transactions`),
    fetchJson(`${explorerApi}/stats/charts/transactions`),
    networkSnapshot(),
  ]);
  return {
    stats,
    blocks: blocks.items?.slice(0, 8) || [],
    transactions: transactions.items?.slice(0, 10) || [],
    chart: chart.chart_data || [],
    network,
    source: { index: "Ink Blockscout", live: "Local OP-Reth + OP Node" },
  };
}

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
};

const liveState = {
  sequence: 0,
  head: null,
  sampledAt: null,
  network: null,
  block: null,
  transactions: [],
};
const liveWss = new WebSocketServer({ noServer: true });

function rpcBlock(block) {
  if (!block) return null;
  const gasUsed = hexNumber(block.gasUsed) || 0;
  const gasLimit = hexNumber(block.gasLimit) || 0;
  const baseFee = block.baseFeePerGas ? BigInt(block.baseFeePerGas) : 0n;
  return {
    hash: block.hash,
    height: hexNumber(block.number),
    timestamp: new Date(hexNumber(block.timestamp) * 1000).toISOString(),
    transactions_count: block.transactions?.length || 0,
    gas_used: String(gasUsed),
    gas_limit: String(gasLimit),
    gas_used_percentage: gasLimit ? (gasUsed / gasLimit) * 100 : 0,
    size: hexNumber(block.size),
    transaction_fees: String(baseFee * BigInt(gasUsed)),
    miner: block.miner,
  };
}

function rpcTransactions(block) {
  if (!Array.isArray(block?.transactions)) return [];
  const blockNumber = hexNumber(block.number);
  const timestamp = new Date(hexNumber(block.timestamp) * 1000).toISOString();
  return block.transactions
    .slice(0, 50)
    .filter((transaction) => transaction && typeof transaction === "object")
    .map((transaction) => {
      let value = "0";
      try {
        value = BigInt(transaction.value || 0).toString();
      } catch {
        /* malformed values remain zero */
      }
      return {
        hash: transaction.hash,
        status: null,
        result: "confirmed",
        block_number: blockNumber,
        timestamp,
        from: { hash: transaction.from },
        to: transaction.to ? { hash: transaction.to } : null,
        value,
        method:
          transaction.input && transaction.input !== "0x"
            ? "contract call"
            : "transfer",
        transaction_types: [],
        _live: true,
      };
    });
}

function sendLive(socket, type = "snapshot") {
  if (socket.readyState !== WebSocket.OPEN || !liveState.network) return;
  socket.send(
    JSON.stringify({
      type,
      protocol: "ink-observer.live.v1",
      sequence: liveState.sequence,
      sentAt: new Date().toISOString(),
      network: liveState.network,
      block: liveState.block,
      transactions: liveState.transactions,
    }),
  );
}

function broadcastLive(type) {
  for (const socket of liveWss.clients) sendLive(socket, type);
}

let liveSampling = false;
async function sampleLive() {
  if (liveSampling) return;
  liveSampling = true;
  try {
    const [network, rawBlock] = await Promise.all([
      networkSnapshot(),
      rpc(rpcUrl, "eth_getBlockByNumber", ["latest", true]).catch(() => null),
    ]);
    const block = network.online && network.synced ? rpcBlock(rawBlock) : null;
    const changed = Boolean(block && block.height !== liveState.head);
    liveState.sequence += 1;
    liveState.head = block?.height ?? null;
    liveState.sampledAt = network.sampledAt;
    liveState.network = network;
    liveState.block = block;
    if (changed) liveState.transactions = rpcTransactions(rawBlock);
    if (!block) liveState.transactions = [];
    broadcastLive(changed ? "block" : "network");
  } catch {
    /* HTTP health endpoints remain available if one live sample fails. */
  } finally {
    liveSampling = false;
  }
}

liveWss.on("connection", (socket) => {
  socket.isAlive = true;
  socket.on("pong", () => {
    socket.isAlive = true;
  });
  socket.on("message", (payload) => {
    if (String(payload) === "ping" && socket.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({ type: "pong", sentAt: new Date().toISOString() }),
      );
    }
  });
  sendLive(socket, "welcome");
});

const supportedLanguages = [
  "en",
  "zh",
  "hi",
  "es",
  "fr",
  "ar",
  "bn",
  "pt",
  "ru",
  "ja",
];
const sitemapPaths = [
  "/",
  "/blocks",
  "/txs",
  "/tokens",
  "/pools",
  "/contracts",
  "/analytics",
  "/advanced",
  "/developers",
  "/network",
];

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
}

function publicOrigin(req) {
  if (configuredPublicUrl) return configuredPublicUrl;
  const forwardedProtocol = String(req.headers["x-forwarded-proto"] || "http")
    .split(",")[0]
    .trim();
  const protocol = forwardedProtocol === "https" ? "https" : "http";
  const forwardedHost = String(
    req.headers["x-forwarded-host"] || req.headers.host || `localhost:${port}`,
  )
    .split(",")[0]
    .trim();
  const host = /^[a-z0-9.-]+(?::\d{1,5})?$/i.test(forwardedHost)
    ? forwardedHost
    : `localhost:${port}`;
  return `${protocol}://${host}`;
}

function allowedExplorerPath(suffix) {
  const address = "0x[a-fA-F0-9]{40}";
  const transaction = "0x[a-fA-F0-9]{64}";
  const block = `(?:\\d+|${transaction})`;
  return [
    /^(?:stats|blocks|transactions|tokens|smart-contracts|token-transfers|internal-transactions)$/,
    new RegExp(`^blocks/${block}(?:/transactions)?$`),
    new RegExp(
      `^transactions/${transaction}(?:/(?:token-transfers|internal-transactions|logs|state-changes|raw-trace))?$`,
    ),
    new RegExp(
      `^addresses/${address}(?:/(?:token-balances|counters|transactions|tokens|nft|token-transfers|internal-transactions|logs))?$`,
    ),
    new RegExp(`^smart-contracts/${address}$`),
    new RegExp(
      `^tokens/${address}(?:/(?:transfers|holders|instances(?:/[a-zA-Z0-9_.-]{1,160}(?:/transfers)?)))?$`,
    ),
    /^optimism\/(?:deposits|withdrawals)$/,
    /^proxy\/account-abstraction\/operations$/,
  ].some((pattern) => pattern.test(suffix));
}

function seoFor(pathname) {
  const routes = {
    "/": [
      "Ink Explorer — Ink Mainnet",
      "An open source explorer for the Ink community. Browse Ink Mainnet blocks, transactions, addresses, tokens and contracts.",
    ],
    "/search": [
      "Search Ink Mainnet — Ink Explorer",
      "Search addresses, verified contracts, tokens, blocks and transactions on Ink Mainnet.",
    ],
    "/blocks": [
      "Ink blocks — Ink Explorer",
      "Latest Ink Mainnet blocks with transaction counts, gas use, size and fees.",
    ],
    "/txs": [
      "Ink transactions — Ink Explorer",
      "Search confirmed Ink transactions, token transfers and internal contract calls.",
    ],
    "/tokens": [
      "Ink tokens and NFTs — Ink Explorer",
      "Fungible tokens, NFT collections, holders, supply and transfers on Ink Mainnet.",
    ],
    "/pools": [
      "Ink liquidity pools — Ink Explorer",
      "Live liquidity, trading volume, paired assets, DEXs and fee tiers across Ink Mainnet.",
    ],
    "/contracts": [
      "Verified Ink contracts — Ink Explorer",
      "Verified contract source code, compiler details, proxy implementations and deployment data on Ink.",
    ],
    "/analytics": [
      "Ink network analytics — Ink Explorer",
      "Ink throughput, active accounts, fees, reliability, block production and downloadable historical data.",
    ],
    "/advanced": [
      "Ink bridge and account abstraction activity",
      "Optimism deposits, withdrawals and ERC-4337 user operations on Ink Mainnet.",
    ],
    "/developers": [
      "Ink Explorer developer API",
      "Read-only Ink explorer endpoints, WebSocket events and local OP-Reth status.",
    ],
    "/network": [
      "Ink network health — Ink Explorer",
      "OP-Reth and OP Node head, finality, peer, sync and storage status from this machine.",
    ],
  };
  if (/^\/tx\/0x[\da-f]{64}$/i.test(pathname))
    return [
      `Ink transaction ${pathname.slice(4, 18)}…`,
      `Fees, transfers, logs, state changes and execution trace for transaction ${pathname.slice(4)} on Ink.`,
    ];
  if (/^\/block\/(\d+|0x[\da-f]{64})$/i.test(pathname))
    return [
      `Ink block ${pathname.slice(7)} — Ink Explorer`,
      `Transactions, gas, fees, size and hashes for Ink block ${pathname.slice(7)}.`,
    ];
  if (/^\/address\/0x[\da-f]{40}$/i.test(pathname))
    return [
      `Ink address ${pathname.slice(9, 23)}…`,
      `Balance, assets, NFTs, activity, contract source and deployment details for address ${pathname.slice(9)} on Ink.`,
    ];
  if (/^\/token\/0x[\da-f]{40}\/instance\//i.test(pathname))
    return [
      `Ink NFT instance — Ink Explorer`,
      "NFT owner, metadata, attributes, media and transfer history on Ink Mainnet.",
    ];
  if (/^\/token\/0x[\da-f]{40}$/i.test(pathname))
    return [
      `Ink token ${pathname.slice(7, 21)}…`,
      `Supply, holders, transfers and NFT instances for token ${pathname.slice(7)} on Ink.`,
    ];
  if (/^\/pools\/0x[\da-f]{40}$/i.test(pathname))
    return [
      `Ink pool ${pathname.slice(7, 21)}…`,
      `Liquidity, volume, fee tier, paired assets, DEX and contract activity for pool ${pathname.slice(7)} on Ink.`,
    ];
  return (
    routes[pathname] || [
      "Page not found — Ink Explorer",
      "The requested Ink explorer page could not be found.",
    ]
  );
}

function localizedCanonical(origin, url, language) {
  const canonical = new URL(`${basePath}${url.pathname}`, origin);
  if (language !== "en") canonical.searchParams.set("lang", language);
  return canonical.href;
}

async function staticFile(reqPath, req, res, requestUrl) {
  const candidate = path.normalize(
    path.join(dist, reqPath === "/" ? "index.html" : reqPath),
  );
  if (candidate !== dist && !candidate.startsWith(`${dist}${path.sep}`)) return false;
  let file = candidate;
  try {
    if ((await stat(file)).isDirectory()) file = path.join(file, "index.html");
  } catch {
    file = path.join(dist, "index.html");
  }
  try {
    let body = await readFile(file);
    let responseStatus = 200;
    if (file.endsWith("index.html")) {
      const language = supportedLanguages.includes(
        requestUrl.searchParams.get("lang"),
      )
        ? requestUrl.searchParams.get("lang")
        : "en";
      const origin = publicOrigin(req);
      const [title, description] = seoFor(requestUrl.pathname).map(value => value.replaceAll("Ink Mainnet", networkName));
      // Start the home data request alongside the JS/CSS instead of after React mounts.
      const preload = requestUrl.pathname === "/"
        ? `<link rel="preload" href="${basePath}/api/overview" as="fetch" crossorigin="anonymous" />`
        : "";
      const robots =
        title.startsWith("Page not found") || requestUrl.pathname === "/search"
          ? "noindex,follow"
          : "index,follow,max-image-preview:large";
      if (title.startsWith("Page not found")) responseStatus = 404;
      const canonical = localizedCanonical(origin, requestUrl, language);
      const alternates = supportedLanguages
        .map(
          (code) =>
            `<link rel="alternate" hreflang="${code}" href="${escapeHtml(localizedCanonical(origin, requestUrl, code))}" />`,
        )
        .join("");
      const structured = JSON.stringify({
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: "Ink Explorer",
        url: `${origin}${basePath}/`,
        description,
        potentialAction: {
          "@type": "SearchAction",
          target: `${origin}${basePath}/search?q={search_term_string}`,
          "query-input": "required name=search_term_string",
        },
      }).replaceAll("<", "\\u003c");
      let html = body
        .toString("utf8")
        .replace(
          /<html lang="[^"]+"(?: dir="[^"]+")?>/,
          `<html lang="${language}" dir="${language === "ar" ? "rtl" : "ltr"}">`,
        )
        .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`)
        .replace(
          /<meta name="description" content="[^"]*"\s*\/>/,
          `<meta name="description" content="${escapeHtml(description)}" />`,
        );
      html = html.replace(
        "</head>",
        `<link rel="canonical" href="${escapeHtml(canonical)}" />${alternates}<meta name="robots" content="${robots}" /><meta property="og:type" content="website" /><meta property="og:site_name" content="Ink Explorer" /><meta property="og:title" content="${escapeHtml(title)}" /><meta property="og:description" content="${escapeHtml(description)}" /><meta property="og:url" content="${escapeHtml(canonical)}" /><meta property="og:image" content="${escapeHtml(origin)}/brand/ink-symbol.png" /><meta name="twitter:card" content="summary" /><meta name="twitter:title" content="${escapeHtml(title)}" /><meta name="twitter:description" content="${escapeHtml(description)}" /><script type="application/ld+json">${structured}</script></head>`,
      );
      html = html.replace("</head>", `${preload}</head>`);
      body = Buffer.from(html);
    }
    const contentType = mime[path.extname(file)] || "application/octet-stream";
    const accepts = String(req.headers["accept-encoding"] || "");
    const compressible =
      /^(?:text\/|application\/(?:javascript|json)|image\/svg\+xml)/.test(
        contentType,
      );
    let contentEncoding;
    if (compressible && body.length > 1_024 && /\bbr\b/.test(accepts)) {
      body = brotliCompressSync(body, {
        params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 5 },
      });
      contentEncoding = "br";
    } else if (
      compressible &&
      body.length > 1_024 &&
      /\bgzip\b/.test(accepts)
    ) {
      body = gzipSync(body, { level: 6 });
      contentEncoding = "gzip";
    }
    const immutableAsset =
      /(?:^|\/)assets\/[^/]+-[a-zA-Z0-9_-]+\.[a-z0-9]+$/i.test(reqPath);
    res.writeHead(responseStatus, {
      "content-type": contentType,
      "cache-control": file.endsWith("index.html")
        ? "no-cache"
        : immutableAsset
          ? "public, max-age=31536000, immutable"
          : "public, max-age=3600",
      ...(compressible ? { vary: "Accept-Encoding" } : {}),
      ...(contentEncoding ? { "content-encoding": contentEncoding } : {}),
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      "referrer-policy": "strict-origin-when-cross-origin",
      "permissions-policy":
        "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
      ...(file.endsWith("index.html")
        ? {
            "content-security-policy":
              "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' ws: wss:; form-action 'self'",
          }
        : {}),
    });
    res.end(body);
    return true;
  } catch {
    return false;
  }
}

const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url || "/", "http://localhost");
  } catch {
    return json(res, 400, { error: "Invalid request URL" });
  }
  if (url.pathname.startsWith("/api/") && url.search.length > 4096)
    return json(res, 414, { error: "Query string too long" });
  if (!testnet && /^\/testnet(?:\/|$)/.test(url.pathname)) return proxyTestnet(req, res);
  if (url.pathname === "/api/contract-rpc" && req.method === "POST") return contractRpc(req, res);
  // HEAD follows the same read-only routing as GET; Node suppresses the body
  // while preserving status and headers for crawlers and uptime monitors.
  if (req.method !== "GET" && req.method !== "HEAD")
    return json(res, 405, { error: "Method not allowed" });

  try {
    if (url.pathname === "/api/health") {
      return json(res, 200, {
        ok: true,
        service: "ink-explorer",
        uptime: Math.floor((Date.now() - startedAt) / 1000),
        websocket: {
          endpoint: "/api/live",
          clients: liveWss.clients.size,
          sequence: liveState.sequence,
          sampledAt: liveState.sampledAt,
        },
      });
    }
    if (url.pathname === "/api/live/status") {
      return json(res, 200, {
        ok: Boolean(liveState.network?.online),
        protocol: "ink-observer.live.v1",
        endpoint: "/api/live",
        clients: liveWss.clients.size,
        sequence: liveState.sequence,
        head: liveState.head,
        sampledAt: liveState.sampledAt,
      });
    }
    if (url.pathname === "/api/overview") {
      return json(res, 200, await cached("overview", 8000, overview));
    }
    if (url.pathname === "/api/network") {
      return json(res, 200, await cached("network", 5000, networkSnapshot));
    }
    if (url.pathname === "/api/media") {
      const media = await fetchMedia(url.searchParams.get("url") || "");
      res.writeHead(200, {
        "content-type": media.type,
        "content-length": media.body.length,
        "cache-control":
          "public, max-age=604800, stale-while-revalidate=2592000",
        "content-security-policy": "default-src 'none'; sandbox",
        "x-content-type-options": "nosniff",
        "x-media-cache": media.cached ? "HIT" : "MISS",
        etag: `"${media.key}"`,
      });
      return res.end(media.body);
    }
    if (url.pathname.startsWith("/api/explorer/")) {
      const suffix = url.pathname.slice("/api/explorer/".length);
      if (!allowedExplorerPath(suffix)) {
        return json(res, 400, { error: "Invalid explorer path" });
      }
      const upstream = `${explorerApi}/${suffix}${url.search}`;
      return json(
        res,
        200,
        await cached(upstream, 5000, () => fetchJson(upstream)),
      );
    }
    if (url.pathname.startsWith("/api/stats/")) {
      const suffix = url.pathname.slice("/api/stats/".length);
      if (!/^[a-zA-Z0-9_./:-]+$/.test(suffix) || suffix.includes("..")) {
        return json(res, 400, { error: "Invalid statistics path" });
      }
      const upstream = `${statsApi}/${suffix}${url.search}`;
      return json(
        res,
        200,
        await cached(upstream, 15000, () => fetchJson(upstream)),
      );
    }
    if (url.pathname.startsWith("/api/contract-info/")) {
      const suffix = url.pathname.slice("/api/contract-info/".length);
      if (!/^pools(?:\/0x[a-fA-F0-9]{40}(?:\/check)?)?$/.test(suffix)) {
        return json(res, 400, { error: "Invalid contract-info path" });
      }
      const upstream = `${contractInfoApi}/${suffix}${url.search}`;
      try {
        return json(
          res,
          200,
          // Pool market values are refreshed by the UI every ten seconds.
          // Expire slightly earlier so each scheduled request can reach the
          // upstream service while still collapsing concurrent browser hits.
          await cached(upstream, 8000, () => fetchJson(upstream)),
        );
      } catch (error) {
        // A pool check is a type probe used by every contract page; "not a
        // pool" is a valid negative result, not an explorer failure.
        if (suffix.endsWith("/check") && String(error?.message).includes("404"))
          return json(res, 200, null);
        throw error;
      }
    }
    if (url.pathname === "/api/search") {
      const q = (url.searchParams.get("q") || "").trim().slice(0, 140);
      if (!q) return json(res, 200, { items: [] });
      return json(
        res,
        200,
        await fetchJson(`${explorerApi}/search?q=${encodeURIComponent(q)}`),
      );
    }
    if (url.pathname.startsWith("/api/"))
      return json(res, 404, { error: "Not found" });
    if (url.pathname === "/robots.txt") {
      const origin = publicOrigin(req);
      res.writeHead(200, {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "public, max-age=3600",
      });
      return res.end(
        `User-agent: *\nAllow: /\nDisallow: ${basePath}/api/\nSitemap: ${origin}${basePath}/sitemap.xml\n`,
      );
    }
    if (url.pathname === "/sitemap.xml") {
      const origin = publicOrigin(req);
      const entries = sitemapPaths
        .flatMap((route) =>
          supportedLanguages.map(
            (language) =>
              `<url><loc>${escapeHtml(localizedCanonical(origin, new URL(route, origin), language))}</loc><changefreq>${route === "/" ? "hourly" : "daily"}</changefreq><priority>${route === "/" ? "1.0" : "0.8"}</priority></url>`,
          ),
        )
        .join("");
      res.writeHead(200, {
        "content-type": "application/xml; charset=utf-8",
        "cache-control": "public, max-age=3600",
      });
      return res.end(
        `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</urlset>`,
      );
    }
    if (!(await staticFile(url.pathname, req, res, url)))
      json(res, 404, { error: "Not found" });
  } catch (error) {
    json(res, 502, {
      error: error instanceof Error ? error.message : "Upstream unavailable",
    });
  }
});

server.on("upgrade", (req, socket, head) => {
  if (!testnet && req.url === "/testnet/api/live") return proxyTestnetSocket(req, socket, head);
  let url;
  try {
    url = new URL(req.url || "/", "http://localhost");
  } catch {
    return socket.destroy();
  }
  if (url.pathname !== "/api/live") return socket.destroy();
  liveWss.handleUpgrade(req, socket, head, (client) =>
    liveWss.emit("connection", client, req),
  );
});

const liveTimer = setInterval(sampleLive, 2000);
const heartbeatTimer = setInterval(() => {
  for (const socket of liveWss.clients) {
    if (socket.isAlive === false) {
      socket.terminate();
      continue;
    }
    socket.isAlive = false;
    socket.ping();
  }
}, 30000);
liveTimer.unref();
heartbeatTimer.unref();
sampleLive();

const host = process.env.HOST || (testnet ? "127.0.0.1" : "0.0.0.0");
server.listen(port, host, () => {
  console.log(`Ink Explorer listening on http://${host}:${port}`);
});
