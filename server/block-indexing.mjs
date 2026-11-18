import { nodeReadiness } from "./node-readiness.mjs";

// Keep HTTP status distinct from an arbitrary upstream/RPC error message.
export class UpstreamHttpError extends Error {
  constructor(status) {
    super(`Upstream returned ${status}`);
    this.name = "UpstreamHttpError";
    this.status = status;
  }
}

const indexingMediaType = "application/vnd.ink.indexing+json";
const httpToken = /^[!#$%&'*+.^_`|~\da-z-]+$/i;
const quotedValue = /^"(?:[\t\x20-\x21\x23-\x5b\x5d-\x7e]|\\[\t\x20-\x7e])*"$/;
const splitHeader = (value, separator) => {
  const parts = []; let start = 0, quoted = false, escaped = false;
  for (let index = 0; index < value.length; index++) {
    const character = value[index];
    if (escaped) { escaped = false; continue; }
    if (quoted && character === "\\") { escaped = true; continue; }
    if (character === '"') quoted = !quoted;
    else if (!quoted && character === separator) { parts.push(value.slice(start, index)); start = index + 1; }
  }
  if (quoted || escaped) return null;
  return [...parts, value.slice(start)];
};

// Existing browser bundles interpret any 2xx body as indexed block data. Only
// a client explicitly opting into this response contract may receive 202.
export function acceptsBlockIndexing(accept, mediaType = indexingMediaType) {
  if (typeof accept !== "string" || /[\r\n]/.test(accept)) return false;
  const entries = splitHeader(accept, ",");
  if (!entries) return false;
  return entries.some(entry => {
    const parts = splitHeader(entry, ";");
    if (!parts || parts.shift().trim().toLowerCase() !== mediaType) return false;
    let quality = 1, hasQuality = false;
    for (const part of parts) {
      const equal = part.indexOf("=");
      if (equal < 0) return false;
      const name = part.slice(0, equal).trim(), value = part.slice(equal + 1).trim();
      if (!httpToken.test(name) || (!httpToken.test(value) && !quotedValue.test(value))) return false;
      if (name.toLowerCase() === "q") {
        if (hasQuality || !/^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/.test(value)) return false;
        hasQuality = true; quality = Number(value);
      }
    }
    return quality > 0;
  });
}

export const acceptsTransactionIndexing = accept => acceptsBlockIndexing(accept, "application/vnd.ink.transaction-indexing+json");

// An opted-in client may wait for the index only when the local node proves
// inclusion in a recent canonical block. This is not proof of execution success.
export async function proveTransactionIndexing({ suffix, chainId, localUrl, fetcher = fetch, now = Date.now() }) {
  const match = /^transactions\/(0x[\da-f]{64})$/i.exec(suffix);
  if (!match) return null;
  const id = match[1].toLowerCase(), key = `tx:${chainId}:${localUrl}:${id}`;
  if (proofsInFlight.has(key)) return proofsInFlight.get(key);
  if (proofsInFlight.size >= 100) return null;
  const proof = (async () => {
    const signal = AbortSignal.timeout(4000);
    const call = async (method, params = []) => {
      const response = await fetcher(localUrl, { method: "POST", headers: { "content-type": "application/json" }, signal, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
      if (!response.ok) throw new Error("Local node unavailable");
      const body = await response.json();
      if (body?.jsonrpc !== "2.0" || body.id !== 1 || body.error || !Object.hasOwn(body, "result")) throw new Error("Invalid local node response");
      return body.result;
    };
    try {
      const [chain, sync, latest, tx] = await Promise.all([call("eth_chainId"), call("eth_syncing"), call("eth_getBlockByNumber", ["latest", false]), call("eth_getTransactionByHash", [id])]);
      const head = blockIdentity(latest);
      if (!head || !nodeReadiness({ chain, expectedChainId: chainId, sync, block: latest, now }).synced || tx?.hash?.toLowerCase() !== id || !hash(tx.blockHash) || quantity(tx.blockNumber) === null) return null;
      const canonical = await call("eth_getBlockByNumber", [tx.blockNumber, false]), block = blockIdentity(canonical);
      if (!block || block.hash !== tx.blockHash.toLowerCase() || block.number !== quantity(tx.blockNumber) || block.number > head.number || head.number - block.number > 120n || block.timestamp > head.timestamp || (block.number === head.number && block.hash !== head.hash)) return null;
      const age = BigInt(Math.floor(now / 1000)) - block.timestamp;
      if (age < -30n || age > 120n || !Array.isArray(canonical.transactions) || !canonical.transactions.some(value => typeof value === "string" && value.toLowerCase() === id)) return null;
      return { code: "TRANSACTION_INDEXING", chainId, transaction: { hash: id, blockNumber: block.number.toString(10), blockHash: block.hash }, retryAfterMs: 1000 };
    } catch { return null; }
  })();
  proofsInFlight.set(key, proof);
  try { return await proof; } finally { if (proofsInFlight.get(key) === proof) proofsInFlight.delete(key); }
}

const hash = value => typeof value === "string" && /^0x[\da-f]{64}$/i.test(value);
const quantity = value => {
  if (typeof value !== "string" || !/^0x(?:0|[1-9a-f][\da-f]*)$/i.test(value) || value.length > 66) return null;
  try { return BigInt(value); } catch { return null; }
};
const blockIdentity = value => {
  if (!value || !hash(value.hash)) return null;
  const number = quantity(value.number), timestamp = quantity(value.timestamp);
  if (number === null || timestamp === null || number > BigInt(Number.MAX_SAFE_INTEGER) || timestamp > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return { number, timestamp, hash: value.hash.toLowerCase() };
};
const proofsInFlight = new Map();

// An index 404 is expected briefly after the sequencer produces a block. Only
// the local execution node may prove this state; never synthesize block data,
// transactions or fees, and never infer it just from the requested height.
export async function proveBlockIndexing({ suffix, chainId, localUrl, fetcher = fetch, now = Date.now() }) {
  const match = /^blocks\/(0x[\da-f]{64}|\d{1,20})(?:\/transactions)?$/i.exec(suffix);
  if (!match) return null;
  const id = match[1], byHash = hash(id);
  let requestedNumber;
  if (!byHash) {
    requestedNumber = BigInt(id);
    if (requestedNumber > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  }
  const key = `${chainId}:${localUrl}:${byHash ? id.toLowerCase() : requestedNumber.toString(10)}`;
  if (proofsInFlight.has(key)) return proofsInFlight.get(key);
  if (proofsInFlight.size >= 100) return null;
  const proof = readProof({ id, byHash, requestedNumber, chainId, localUrl, fetcher, now });
  proofsInFlight.set(key, proof);
  try { return await proof; }
  finally { if (proofsInFlight.get(key) === proof) proofsInFlight.delete(key); }
}

async function readProof({ id, byHash, requestedNumber, chainId, localUrl, fetcher, now }) {
  const signal = AbortSignal.timeout(4000);
  const call = async (method, params = []) => {
    const response = await fetcher(localUrl, {
      method: "POST", headers: { "content-type": "application/json" }, signal,
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    if (!response.ok) throw new Error("Local node unavailable");
    const body = await response.json();
    if (body?.jsonrpc !== "2.0" || body.id !== 1 || body.error || !Object.hasOwn(body, "result")) throw new Error("Invalid local node response");
    return body.result;
  };
  try {
    const [chain, sync, latest, requested] = await Promise.all([
      call("eth_chainId"), call("eth_syncing"),
      call("eth_getBlockByNumber", ["latest", false]),
      byHash ? call("eth_getBlockByHash", [id, false]) : call("eth_getBlockByNumber", [`0x${requestedNumber.toString(16)}`, false]),
    ]);
    const head = blockIdentity(latest), block = blockIdentity(requested);
    if (quantity(chain) !== BigInt(chainId) || !head || !block ||
        !nodeReadiness({ chain, expectedChainId: chainId, sync, block: latest, now }).synced) return null;
    if (byHash ? block.hash !== id.toLowerCase() : block.number !== requestedNumber) return null;
    const age = BigInt(Math.floor(now / 1000)) - block.timestamp;
    if (block.number > head.number || head.number - block.number > 120n || age < -30n || age > 300n || block.timestamp > head.timestamp) return null;
    if (block.number === head.number && block.hash !== head.hash) return null;
    // Hash lookup may return an orphan. A second canonical height lookup must
    // agree exactly; the height lookup above already supplies this proof for
    // number requests.
    if (byHash) {
      const canonical = blockIdentity(await call("eth_getBlockByNumber", [`0x${block.number.toString(16)}`, false]));
      if (!canonical || canonical.number !== block.number || canonical.hash !== block.hash || canonical.timestamp !== block.timestamp) return null;
    }
    return { code: "BLOCK_INDEXING", chainId, block: { number: block.number.toString(10), hash: block.hash }, retryAfterMs: 3000 };
  } catch {
    // An unavailable, syncing, stale or inconsistent node cannot turn an
    // ordinary index failure into evidence that a block exists.
    return null;
  }
}
