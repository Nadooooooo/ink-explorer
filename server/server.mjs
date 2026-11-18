import http from "node:http";
import {createRollingReader} from "./rolling-reader.mjs";
import { createLiveIdentities } from "./live-identities.mjs";
import { queryTransactions } from "./transaction-query.mjs";
import {createParentRequestGate,ParentSourceBusyError} from './parent-request-gate.mjs';
import { createCanonicalFeed, subscribeHeads } from "./canonical-feed.mjs";
import { mkdir, readFile, readdir, stat, statfs, unlink, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import {createMediaCache} from "./media-cache.mjs";
import {createNftMetadataReader} from "./nft-metadata.mjs";
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
import { createApprovals } from "./approvals.mjs";
import { nodeReadiness, rollupReadiness } from "./node-readiness.mjs";
import { documentHeaders, renderPage, robotsText, sitemapXml } from "./page-document.mjs";
import { readEcosystemDocument } from "./ecosystem-document.mjs";
import { verifyAddressBalance } from "./address-balance.mjs";
import {createCurrentAddressBalance} from './current-address-balance.mjs';
import { createSourceVerification } from "./source-verification.mjs";
import { communityTagStore, createTagSubmission, tagTypes } from "./community-tags.mjs";
import { searchQuery } from "./search-query.mjs";
import { validPoolPath } from "./pool-path.mjs";
import { acceptsBlockIndexing, proveBlockIndexing, acceptsTransactionIndexing, proveTransactionIndexing, UpstreamHttpError } from "./block-indexing.mjs";
import {createTransactionCore,firstTransactionResponse} from './transaction-core.mjs';
import {dappsResponse} from './dapps-response.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const dist = path.join(root, "dist");
const testnet = process.env.INK_NETWORK === "sepolia";
const port = Number(process.env.PORT || (testnet ? 4190 : 4188));
const chainId = testnet ? 763373 : 57073;
const networkName = testnet ? "Ink Sepolia" : "Ink Mainnet";
const rollingReader=createRollingReader({chainId,file:process.env.INK_ROLLING_DATA_DIR ? path.join(process.env.INK_ROLLING_DATA_DIR,`${chainId}.json`) : undefined});
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
const browserOrigin = process.env.EXPLORER_BROWSER_ORIGIN?.trim().replace(/\/$/, "");
const rpcUrl = process.env.INK_RPC || `http://127.0.0.1:${testnet ? 8645 : 8545}`;
const currentTransaction=createTransactionCore({chainId,localUrl:rpcUrl});
const currentAddressBalance=createCurrentAddressBalance({chainId,rpc:(method,params,signal)=>rpc(rpcUrl,method,params,signal)});
const opNodeRpc = process.env.INK_OP_NODE_RPC || `http://127.0.0.1:${testnet ? 9645 : 9545}`;
const metricsUrl = process.env.INK_METRICS_URL || `http://127.0.0.1:${testnet ? 9101 : 9001}/metrics`;
const nodeDataDir = process.env.INK_NODE_DATA_DIR?.trim();
const contractRpc = createContractRpc({ localUrl: rpcUrl, chainId,
  publicUrl: process.env.INK_PUBLIC_RPC || (testnet ? "https://rpc-gel-sepolia.inkonchain.com" : "https://rpc-gel.inkonchain.com"),
  browserOrigin });
const approvals = createApprovals({ localUrl: rpcUrl, chainId,
  publicUrl: process.env.INK_PUBLIC_RPC || (testnet ? "https://rpc-gel-sepolia.inkonchain.com" : "https://rpc-gel.inkonchain.com"),
  logsUrl: process.env.BLOCKSCOUT_LOGS_API || new URL("/api", explorerApi).href,
  browserOrigin, send: json });
const sourceVerification = createSourceVerification({api:explorerApi,socketOrigin:explorerOrigin,browserOrigin,send:json});
const communityTags = communityTagStore(path.join(root,"data","community-tags",String(chainId)));
const submitCommunityTag = createTagSubmission({store:communityTags,browserOrigin,send:json});
const l1FailoverStatusUrl =
  process.env.INK_L1_FAILOVER_STATUS || "http://127.0.0.1:18545/readyz";
const startedAt = Date.now();
const cache = new Map();
const upstreamCache = new Map();
const upstreamInflight = new Map();
const parentRequestGate = createParentRequestGate();
const responseFreshness = new AsyncLocalStorage();
const cacheDir = path.join(root, "data", "upstream-cache");
const mediaCacheDir = path.join(root, "data", "media-cache");
const logoStoreDir = path.join(root,"data","logos");
await mkdir(logoStoreDir,{recursive:true});
let logoStoreBytes=0;
for(const name of await readdir(logoStoreDir))if(name.endsWith(".bin"))logoStoreBytes+=(await stat(path.join(logoStoreDir,name))).size;
const logoWrites=new Map();
async function retainLogo(key,body,meta) {
  if(logoWrites.has(key))return logoWrites.get(key);
  if(body.length>2*1024*1024 || logoStoreBytes+body.length>2*1024*1024*1024)return;
  logoStoreBytes+=body.length;
  const job=Promise.all([writeFile(path.join(logoStoreDir,`${key}.bin`),body),writeFile(path.join(logoStoreDir,`${key}.json`),JSON.stringify(meta))]);
  logoWrites.set(key,job);
  try {await job;} catch {logoStoreBytes-=body.length;} finally {logoWrites.delete(key);}
}
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

const mediaCache=createMediaCache({cacheDir:mediaCacheDir,logoStoreDir,retainLogo,scheduleCachePrune});
const readNftMetadata=createNftMetadataReader({rpc:(method,params,signal)=>rpc(rpcUrl,method,params,signal)});

function json(res, status, body, extra = {}) {
  const freshness = responseFreshness.getStore();
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "x-robots-tag": "noindex, nofollow",
    ...(Number.isFinite(freshness?.at) ? {
      "x-ink-data-status": freshness.stale ? "stale" : "fresh",
      "x-ink-data-fetched-at": new Date(freshness.at).toISOString(),
    } : {}),
    ...extra,
  });
  res.end(JSON.stringify(body));
}

function recordFreshness(entry) {
  const current = responseFreshness.getStore();
  if (!current || !Number.isFinite(entry?.at)) return;
  // A composed response inherits its oldest observation and any stale source.
  current.at = Math.min(current.at, entry.at);
  current.stale ||= Boolean(entry.stale);
}

async function cached(key, ttl, loader) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) {
    recordFreshness(hit.freshness);
    return hit.value;
  }
  const freshness = { at: Infinity, stale: false };
  const value = await responseFreshness.run(freshness, loader);
  recordFreshness(freshness);
  setBounded(cache, key, { at: Date.now(), value, freshness }, 1000);
  return value;
}

async function fetchJson(url, timeout = 12000, allowStale = true, updatedGasOracle = false, bulkParent = false) {
  const key = updatedGasOracle ? `${url}#updated-gas-oracle` : url;
  let previous = upstreamCache.get(key);
  if (!previous) {
    try {
      const stored = JSON.parse(await readFile(diskCachePath(key), "utf8"));
      if (stored.url === key && Number.isFinite(stored.at) && stored.at <= Date.now() && Date.now() - stored.at < 24 * 60 * 60 * 1000) {
        previous = { at: stored.at, value: stored.value };
        setBounded(upstreamCache, key, previous, 2000);
      }
    } catch {
      /* cold cache */
    }
  }
  if (previous && Date.now() - previous.at < 15000) {
    recordFreshness(previous);
    return previous.value;
  }
  if (upstreamInflight.has(key)) {
    const entry = await upstreamInflight.get(key);
    recordFreshness(entry);
    return entry.value;
  }
  if (upstreamInflight.size >= 200) throw new Error("Too many upstream requests");
  const request = fetchJsonUncached(url, timeout, allowStale ? previous : undefined, updatedGasOracle, bulkParent);
  upstreamInflight.set(key, request);
  try {
    const entry = await request;
    recordFreshness(entry);
    setBounded(upstreamCache, key, entry, 2000);
    // A fallback is the same snapshot, not a new upstream observation. Preserve
    // its original timestamp so repeated outages cannot renew its 24h lifetime.
    if (!entry.stale)
      writeFile(diskCachePath(key), JSON.stringify({ url: key, ...entry })).catch(
        () => {},
      );
    scheduleCachePrune();
    return entry.value;
  } finally {
    upstreamInflight.delete(key);
  }
}

async function fetchJsonUncached(url, timeout, previous, updatedGasOracle = false, bulkParent = false) {
  const controller = new AbortController();
  const deadline=Date.now()+timeout;
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      if(bulkParent)await parentRequestGate.acquire(controller.signal,deadline);
      let response;
      try {
        response = await fetch(url, {
          signal: controller.signal,
          headers: {
            accept: "application/json",
            "user-agent": "InkExplorer/0.1",
            ...(updatedGasOracle ? { "updated-gas-oracle": "true" } : {}),
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
          return { ...previous, stale: true };
        throw error;
      }
      if(bulkParent)parentRequestGate.observe(response.headers,response.status);
      if (response.ok) {
        const value = await response.json();
        return { at: Date.now(), value };
      }
      // The public index can briefly rate-limit or return gateway errors while
      // catching up. Retry only transient statuses; permanent 4xx responses
      // still fail immediately, and a previously verified snapshot wins when
      // one exists.
      const transient = response.status === 429 || response.status >= 500;
      if (transient && attempt < 2) {
        await response.body?.cancel();
        const retryAfter = Number(response.headers.get("retry-after"));
        const delay =
          Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.min(retryAfter * 1000, 3000)
            : (response.status === 429 ? 900 : 350) * (attempt + 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      if (transient && previous && Date.now() - previous.at < 24 * 60 * 60 * 1000)
        return { ...previous, stale: true };
      throw new UpstreamHttpError(response.status);
    }
    throw new Error("Upstream retry limit reached");
  } finally {
    clearTimeout(timer);
  }
}

async function rpc(url, method, params = [], signal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(url, {
      method: "POST",
      signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal,
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
  const p2p = value(5) ?? {};
  const rollup = value(6, {});
  const readiness = nodeReadiness({ chain: value(4), expectedChainId: chainId, sync, block: value(0) });
  const head = readiness.head;
  const finalized = rollup?.finalized_l2?.number ?? null;
  return {
    ...readiness,
    derivation: rollupReadiness(rollup),
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
    fetchJson(`${explorerApi}/stats`, 12000, true, true),
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
  blocks: [],
  utilization: null,
};
const liveWss = new WebSocketServer({ noServer: true, handleProtocols: protocols => protocols.has("ink-explorer.delta.v1") ? "ink-explorer.delta.v1" : false });
const transactionQueryBudget = { active:0, requests:0, reset:Date.now()+60000 };

function rpcBlock(block) {
  if (!block) return null;
  const gasUsed = hexNumber(block.gasUsed) || 0;
  const gasLimit = hexNumber(block.gasLimit) || 0;
  return {
    hash: block.hash,
    height: hexNumber(block.number),
    timestamp: new Date(hexNumber(block.timestamp) * 1000).toISOString(),
    transactions_count: block.transactions?.length || 0,
    gas_used: String(gasUsed),
    gas_limit: String(gasLimit),
    gas_used_percentage: gasLimit ? (gasUsed / gasLimit) * 100 : 0,
    size: hexNumber(block.size),
    transaction_fees: null,
    _live: true,
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
      let value = null;
      try {
        if (transaction.value != null) value = BigInt(transaction.value).toString();
      } catch {
        /* malformed values remain unavailable */
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
  if (socket.bufferedAmount > 1024 * 1024) { socket.close(1013,"Slow connection; reconnect for a snapshot"); return; }
  const frame={ type,protocol:"ink-observer.live.v1",sequence:liveState.sequence,sentAt:new Date().toISOString(),network:liveState.network,
    block:liveState.block,transactions:liveState.transactions.slice(0,50),blocks:liveState.blocks,utilization:liveState.utilization,rolling24h:rollingReader.current(liveState) };
  if (socket.protocol === "ink-explorer.delta.v1") {
    const previous=socket.feedState || {blocks:new Map(),transactions:new Map()};
    const blocks=new Map(frame.blocks.map(item=>[item.height,JSON.stringify(item)]));
    const transactions=new Map(frame.transactions.map(item=>[item.hash,JSON.stringify(item)]));
    frame.delta=true;frame.reset=!socket.feedState;
    frame.window={fromBlock:liveState.blocks.at(-1)?.height,toBlock:liveState.block?.height};
    frame.blocks=frame.blocks.filter(item=>previous.blocks.get(item.height)!==blocks.get(item.height));
    frame.transactions=frame.transactions.filter(item=>previous.transactions.get(item.hash)!==transactions.get(item.hash));
    socket.feedState={blocks,transactions};
  }
  socket.send(JSON.stringify(frame));
}

function broadcastLive(type) {
  for (const socket of liveWss.clients) sendLive(socket, type);
}

let liveTransport = "polling";
let snapshotRequestedAt=0;
const liveIdentities=createLiveIdentities({enabled:()=>liveWss.clients.size>0 || Date.now()-snapshotRequestedAt<30000,get:hash=>fetchJson(`${explorerApi}/addresses/${hash}`,8000),onChange:()=>{
  if(!liveState.network?.synced)return;
  const snapshot=liveIdentities.apply(canonicalFeed.snapshot());
  liveState.transactions=snapshot.transactions;liveState.sequence++;broadcastLive("network");
}});
const canonicalFeed = createCanonicalFeed({
  rpc:(method, params) => rpc(rpcUrl, method, params),
  onUpdate: (snapshot, event) => {
    if (!liveState.network?.online || !liveState.network?.synced) return;
    Object.assign(liveState, liveIdentities.apply(snapshot));
    liveState.sequence++;
    liveState.head = snapshot.block?.height ?? null;
    liveState.sampledAt = new Date().toISOString();
    liveState.network = { ...liveState.network, head:liveState.head, liveTransport,
      sampledAt:liveState.sampledAt, blockAgeSeconds:snapshot.block ? Math.max(0,(Date.now()-Date.parse(snapshot.block.timestamp))/1000) : null };
    broadcastLive(event === "block" ? "block" : "network");
  },
});
let liveSampling = false;
let pendingHeader=null, loadingHead=false;
async function receiveHead(header) {
  if (!pendingHeader || BigInt(header.number) >= BigInt(pendingHeader.number)) pendingHeader=header;
  if (loadingHead) return;
  loadingHead=true;
  try {
    while(pendingHeader) {
      const current=pendingHeader;pendingHeader=null;
      try { await canonicalFeed.accept(await rpc(rpcUrl,"eth_getBlockByHash",[current.hash,true])); } catch { /* A later tip or readiness poll repairs the gap. */ }
    }
  } finally { loadingHead=false; }
}
const nodeSubscription = subscribeHeads({ url:process.env.INK_RPC_WS || `ws://127.0.0.1:${testnet ? 8646 : 8546}`,
  rpc:(method,params)=>rpc(rpcUrl,method,params), chainId,
  onTransport: value => { liveTransport=value; },
  onHead: header => { void receiveHead(header).catch(()=>{}); },
});
async function sampleLive() {
  if (liveSampling) return;
  liveSampling = true;
  try {
    const network = await cached("live-network-readiness", 10000, networkSnapshot);
    const transport = nodeSubscription.healthy() ? "subscription" : "polling";
    liveTransport=transport;
    liveState.network = { ...network, liveTransport:transport };
    if (!network.online || !network.synced) {
      liveState.block=null; liveState.blocks=[]; liveState.transactions=[]; liveState.utilization=null;
    } else if (!nodeSubscription.healthy() || !liveState.block) {
      const block = await rpc(rpcUrl,"eth_getBlockByNumber",["latest",true]);
      await canonicalFeed.accept(block);
      Object.assign(liveState,liveIdentities.apply(canonicalFeed.snapshot()));
    }
    liveState.head = liveState.block?.height ?? null;
    liveState.sequence++;
    liveState.sampledAt = new Date().toISOString();
    if (liveState.block) liveState.network = { ...liveState.network, head:liveState.head, blockAgeSeconds:Math.max(0,(Date.now()-Date.parse(liveState.block.timestamp))/1000) };
    broadcastLive("network");
  } catch { /* Readiness failures never become successful transaction statuses. */ }
  finally { liveSampling = false; }
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
    /^(?:stats|addresses|blocks|transactions|tokens|smart-contracts|token-transfers|internal-transactions|advanced-filters)$/,
    new RegExp(`^blocks/${block}(?:/transactions)?$`),
    new RegExp(
      `^transactions/${transaction}(?:/(?:token-transfers|internal-transactions|logs|state-changes|raw-trace))?$`,
    ),
    new RegExp(
      `^addresses/${address}(?:/(?:token-balances|counters|transactions|tokens|nft|token-transfers|internal-transactions|logs|coin-balance-history|coin-balance-history-by-day))?$`,
    ),
    new RegExp(`^smart-contracts/${address}$`),
    /^smart-contracts\/verification\/config$/,
    new RegExp(
      `^tokens/${address}(?:/(?:transfers|holders|instances(?:/[a-zA-Z0-9_.-]{1,160}(?:/(?:transfers|transfers-count))?)?))?$`,
    ),
    /^optimism\/(?:deposits|withdrawals|games|batches)(?:\/(?:count|\d+))?$/,
    /^(?:blocks|transactions)\/optimism-batch\/\d+$/,
    new RegExp(`^proxy/account-abstraction/operations(?:/${transaction})?$`),
  ].some((pattern) => pattern.test(suffix));
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
    let pageRobots;
    if (file.endsWith("index.html")) {
      const ecosystem = await readEcosystemDocument(requestUrl, basePath, async asset =>
        JSON.parse(await readFile(path.join(dist, asset), "utf8")));
      const page = renderPage(body, requestUrl, { origin: publicOrigin(req), basePath, ...ecosystem });
      body = page.body;
      responseStatus = page.status;
      pageRobots = page.robots;
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
      ...(pageRobots
        ? {
            "content-security-policy":
              documentHeaders["content-security-policy"],
            "x-robots-tag": pageRobots,
          }
        : {}),
    });
    res.end(body);
    return true;
  } catch {
    return false;
  }
}

const server = http.createServer((req, res) => responseFreshness.run({ at: Infinity, stale: false }, async () => {
  let url;
  try {
    url = new URL(req.url || "/", "http://localhost");
  } catch {
    return json(res, 400, { error: "Invalid request URL" });
  }
  const allowedBrowserRequest =
    url.pathname.startsWith("/api/") &&
    browserOrigin &&
    req.headers.origin === browserOrigin;
  if (allowedBrowserRequest) {
    res.setHeader("access-control-allow-origin", browserOrigin);
    res.setHeader("access-control-expose-headers", "x-ink-data-status, x-ink-data-fetched-at");
    res.setHeader("vary", "Origin");
  }
  if (req.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
    if (!allowedBrowserRequest || !["GET", "HEAD", "POST"].includes(
      String(req.headers["access-control-request-method"] || "").toUpperCase(),
    )) return json(res, 403, { error: "Cross-origin request not allowed" });
    res.writeHead(204, {
      "access-control-allow-methods": "GET, HEAD, POST",
      "access-control-allow-headers": "content-type",
      "access-control-max-age": "600",
      ...(req.headers["access-control-request-private-network"] === "true"
        ? { "access-control-allow-private-network": "true" }
        : {}),
    });
    return res.end();
  }
  if (url.pathname.startsWith("/api/") && url.search.length > 4096)
    return json(res, 414, { error: "Query string too long" });
  if (!testnet && /^\/testnet(?:\/|$)/.test(url.pathname)) return proxyTestnet(req, res);
  if (/^\/api\/approvals\/0x[\da-f]{40}\/(?:events|state)$/i.test(url.pathname)) return approvals.handler(req, res, url);
  if (url.pathname === "/api/contract-rpc" && req.method === "POST") return contractRpc(req, res);
  if (url.pathname === "/api/verification/submit" || /^\/api\/verification\/status\/[\da-f-]{36}$/.test(url.pathname)) return sourceVerification(req, res, url.pathname);
  if (url.pathname === "/api/public-tags/submit") return submitCommunityTag(req, res);
  // HEAD follows the same read-only routing as GET; Node suppresses the body
  // while preserving status and headers for crawlers and uptime monitors.
  if (req.method !== "GET" && req.method !== "HEAD")
    return json(res, 405, { error: "Method not allowed" });

  try {
    if (url.pathname.startsWith('/api/address-balance/')) {
      const address=url.pathname.slice('/api/address-balance/'.length);
      if(!/^0x[\da-f]{40}$/i.test(address)||url.search)return json(res,400,{error:'Invalid address'});
      try {
        const observation=await currentAddressBalance(address);
        if(!res.destroyed)return json(res,200,observation,{'x-ink-data-status':'fresh','x-ink-data-fetched-at':observation.observedAt});
      } catch {
        if(!res.destroyed)return json(res,503,{error:'Data source unavailable'},{'retry-after':'1'});
      }
      return;
    }
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
    if (url.pathname === "/api/wallet/config") {
      const projectId = process.env.WALLETCONNECT_PROJECT_ID?.trim() || "";
      return json(res,200,{chainId,projectId:/^[\da-f]{32}$/i.test(projectId) ? projectId : ""});
    }
    if (url.pathname === "/api/public-tags/types") return json(res,200,{items:tagTypes});
    if (url.pathname === "/api/live/config") {
      const socketUrl = new URL(`${basePath}/api/live`, publicOrigin(req));
      socketUrl.protocol = socketUrl.protocol === "https:" ? "wss:" : "ws:";
      return json(res,200,{url:socketUrl.href});
    }
    if (url.pathname === "/api/live/snapshot") {
      snapshotRequestedAt=Date.now();
      if (!liveState.network) return json(res,503,{error:"Live data not yet available"});
      return json(res,200,{type:"snapshot",protocol:"ink-observer.live.v1",sequence:liveState.sequence,
        sentAt:new Date().toISOString(),network:liveState.network,block:liveState.block,transactions:liveState.transactions,blocks:liveState.blocks,utilization:liveState.utilization,rolling24h:rollingReader.current(liveState)});
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
      const kind=url.searchParams.get("kind")||"original";
      const media = await mediaCache(url.searchParams.get("url") || "",kind);
      if(kind==="info")return json(res,200,{type:media.type});
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
    if (url.pathname === "/api/v1/transactions") {
      if (req.method !== "GET") return json(res,405,{error:"Read-only endpoint"},{allow:"GET"});
      if(Date.now()>=transactionQueryBudget.reset){transactionQueryBudget.reset=Date.now()+60000;transactionQueryBudget.requests=0;}
      if(transactionQueryBudget.active>=4 || transactionQueryBudget.requests>=60)return json(res,429,{error:"Transaction search is busy; retry shortly"},{"retry-after":String(transactionQueryBudget.requests>=60 ? Math.max(1,Math.ceil((transactionQueryBudget.reset-Date.now())/1000)) : 5)});
      transactionQueryBudget.active++;transactionQueryBudget.requests++;
      const deadline=Date.now()+45000;
      try {
        const result=await queryTransactions(url.searchParams,{get:path=>{
          if(res.destroyed || Date.now()>=deadline)throw new Error("Transaction search timed out");
          return fetchJson(`${explorerApi}${path}`,Math.min(45000,deadline-Date.now()),false,false,path.startsWith('/transactions/'));
        }});
        return json(res,200,{...result,meta:{chainId,source:"indexed",scope:"parent-transactions",sampledAt:new Date().toISOString()}},{"cache-control":"no-store"});
      } catch(error) {
        if(error instanceof ParentSourceBusyError)return json(res,429,{error:error.message},{'retry-after':String(error.retryAfter)});
        if(/Invalid cursor|Invalid status|Unsupported transaction|Use token|Invalid activity|selector|address|date|amount|relation/.test(error.message))return json(res,400,{error:error.message});
        throw error;
      } finally {transactionQueryBudget.active--;}
    }
    if (url.pathname.startsWith("/api/explorer/")) {
      const suffix = url.pathname.slice("/api/explorer/".length);
      if (!allowedExplorerPath(suffix)) {
        return json(res, 400, { error: "Invalid explorer path" });
      }
      const params = new URLSearchParams(url.search);
      const detailedStats = suffix === "stats" && params.get("gas_oracle") === "updated";
      if (suffix === "stats") params.delete("gas_oracle");
      const search = suffix === "stats" ? (params.size ? `?${params}` : "") : url.search;
      const upstream = `${explorerApi}/${suffix}${search}`;
      const profilePath = /^addresses\/0x[\da-f]{40}$/i.test(suffix);
      let result;
      try {
        // Advanced queries may legitimately run for up to 60 seconds upstream.
        // Never disguise an old filtered page as a successful current query.
        const loadIndexed = () => cached(detailedStats ? `${upstream}#updated-gas-oracle` : upstream, 5000, async () => {
          const value = await fetchJson(upstream, suffix === "advanced-filters" ? 65000 : 12000, suffix !== "advanced-filters", detailedStats);
          if (!profilePath || !value || typeof value !== 'object') return value;
          const verified = await verifyAddressBalance(value, {chainId,currentBalance:currentAddressBalance,
            rpc:(method, params, signal) => rpc(rpcUrl, method, params, signal),
            signal:AbortSignal.timeout(5000),
          });
          return communityTags.enrich(verified);
        });
        const transaction=/^transactions\/(0x[\da-f]{64})$/i.exec(suffix);
        if(transaction && !url.search && acceptsTransactionIndexing(req.headers.accept)) {
          const freshness={at:Infinity,stale:false};
          const response=await firstTransactionResponse({
            indexed:()=>responseFreshness.run(freshness,loadIndexed),
            core:()=>currentTransaction(transaction[1]),
            preferIndex:value=>!freshness.stale && Number.isFinite(freshness.at) && Date.now()-freshness.at<15000 &&
              typeof value?.hash==='string' && value.hash.toLowerCase()===transaction[1].toLowerCase() && !('code' in value),
          });
          if(response.kind==='core')return json(res,200,response.value,{
            'x-ink-data-status':'fresh','x-ink-data-fetched-at':response.value._ink_node_observation.observedAt,
            'cache-control':'no-store',
          });
          recordFreshness(freshness);result=response.value;
        } else result=await loadIndexed();
      } catch (error) {
        if (error instanceof UpstreamHttpError && error.status === 404 && acceptsTransactionIndexing(req.headers.accept)) {
          const pending = await proveTransactionIndexing({ suffix, chainId, localUrl: rpcUrl });
          if (pending) return json(res, 202, pending, { "retry-after": "1", "cache-control": "no-store" });
        }
        if (error instanceof UpstreamHttpError && error.status === 404 && acceptsBlockIndexing(req.headers.accept)) {
          const pending = await proveBlockIndexing({ suffix, chainId, localUrl: rpcUrl });
          // Outside both caches: every retry must consult the index again.
          if (pending) return json(res, 202, pending, { "retry-after": "3" });
        }
        throw error;
      }
      const instance=suffix.match(/^tokens\/(0x[\da-f]{40})\/instances\/(\d+)$/i);
      if(instance&&result&&!result.image_url&&!result.media_url&&!result.metadata?.image&&!result.metadata?.image_url) {
        // Artwork may be absent from the index. Recover it independently; ownership
        // and quantities remain exactly as returned by the indexed instance.
        try {result={...result,...await readNftMetadata(instance[1],instance[2],result.token?.type)};}catch{/* Keep the instance available when its metadata host fails. */}
      }
      if (suffix === "transactions") liveIdentities.seed(result.items);
      return json(res, 200, result);
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
    if (url.pathname.startsWith("/api/names/")) {
      const suffix = url.pathname.slice("/api/names/".length);
      if (!/^(?:protocols|addresses:lookup|domains:lookup|domains\/[a-zA-Z0-9_.%~-]{1,750}(?:\/events)?)$/.test(suffix))
        return json(res, 400, { error: "Invalid name-service path" });
      if (suffix.startsWith("domains/")) {
        let domain;try { domain=decodeURIComponent(suffix.slice(8).replace(/\/events$/, "")); } catch { return json(res,400,{error:"Invalid domain name"}); }
        if (!domain || domain.length > 250 || /[\s/\\\u0000-\u001f?#]/u.test(domain) || domain === "." || domain === "..") return json(res,400,{error:"Invalid domain name"});
      }
      const params=new URLSearchParams(url.search);if(suffix.startsWith("domains/") && params.has("protocols")){if(!params.has("protocol_id"))params.set("protocol_id",params.get("protocols"));params.delete("protocols");}
      const upstream = `https://bens.services.blockscout.com/api/v1/${suffix}${params.size ? `?${params}` : ""}`;
      const result = await cached(upstream, 15000, () => fetchJson(upstream));
      if(suffix === "protocols" && Array.isArray(result.items)) return json(res,200,{...result,items:result.items.filter(item=>item.id === "ens" || item.deployment_blockscout_base_url?.replace(/\/$/,"") === explorerOrigin)});
      return json(res, 200, result);
    }
    if (url.pathname === "/api/dapps") {
      const upstream = `https://admin-rs.services.blockscout.com/api/v1/chains/${chainId}/marketplace/dapps`;
      return json(res, 200, dappsResponse(await cached(upstream, 60000, () => fetchJson(upstream)), url.searchParams.get("view")));
    }
    if (url.pathname.startsWith("/api/contract-info/")) {
      const suffix = url.pathname.slice("/api/contract-info/".length);
      if (!validPoolPath(suffix)) {
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
      const query = searchQuery(url.searchParams);
      if (!query) return json(res, 400, { error: "Invalid search parameters" });
      if (!query.get("q")) return json(res, 200, { items: [] });
      return json(
        res,
        200,
        await fetchJson(`${explorerApi}/search?${query}`),
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
        robotsText(origin, basePath),
      );
    }
    if (url.pathname === "/sitemap.xml") {
      const origin = publicOrigin(req);
      res.writeHead(200, {
        "content-type": "application/xml; charset=utf-8",
        "cache-control": "public, max-age=3600",
      });
      return res.end(
        sitemapXml(origin, basePath),
      );
    }
    if (!(await staticFile(url.pathname, req, res, url)))
      json(res, 404, { error: "Not found" });
  } catch (error) {
    json(res, 502, {
      error: error instanceof Error ? error.message : "Upstream unavailable",
    });
  }
}));

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
