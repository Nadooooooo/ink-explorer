import { Interface, id, zeroPadValue, ZeroAddress } from "ethers";
import { nodeReadiness } from "./node-readiness.mjs";

export const approvalTopics = [id("Approval(address,address,uint256)"), id("ApprovalForAll(address,address,bool)")];
const address = /^0x[\da-f]{40}$/i;
const hash = /^0x[\da-f]{64}$/i;
const word = /^0x[\da-f]{64}$/i;
const abi = new Interface([
  "function allowance(address,address) view returns (uint256)",
  "function getApproved(uint256) view returns (address)",
  "function ownerOf(uint256) view returns (address)",
  "function isApprovedForAll(address,address) view returns (bool)",
  "function supportsInterface(bytes4) view returns (bool)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
]);
const topicAddress = value => word.test(value) && /^0x0{24}/i.test(value) ? `0x${value.slice(-40)}`.toLowerCase() : undefined;
export function decodeApproval(log, owner, from, to) {
  const topics = log?.topics?.filter(value => value != null);
  if (!address.test(log?.address) || !Array.isArray(topics) || !hash.test(log.transactionHash) || !word.test(log.data) && log.data !== "0x") throw new Error("Invalid approval event");
  const block = Number(BigInt(log.blockNumber)), index = Number(BigInt(log.logIndex));
  if (!Number.isSafeInteger(block) || block < from || block > to || !Number.isSafeInteger(index) || index < 0 || topicAddress(topics[1]) !== owner.toLowerCase()) throw new Error("Approval event outside requested scope");
  const spender = topicAddress(topics[2]);
  if (!spender) throw new Error("Invalid approval spender");
  let kind, tokenId;
  if (topics[0]?.toLowerCase() === approvalTopics[0]) {
    if (topics.length === 3 && word.test(log.data)) kind = "erc20";
    else if (topics.length === 4 && word.test(topics[3]) && log.data === "0x") { kind = "erc721"; tokenId = BigInt(topics[3]).toString(); }
    else throw new Error("Invalid Approval event shape");
  } else if (topics[0]?.toLowerCase() === approvalTopics[1] && topics.length === 3 && word.test(log.data) && BigInt(log.data) <= 1n) kind = "operator";
  else throw new Error("Invalid approval event signature");
  const token = log.address.toLowerCase();
  return { key: `${kind}:${token}:${tokenId ?? spender}`, kind, token, spender, ...(tokenId !== undefined ? { tokenId } : {}), block, logIndex: index, transactionHash: log.transactionHash };
}

export function validateApproval(item) {
  if (!item || !["erc20", "erc721", "operator"].includes(item.kind) || !address.test(item.token) || !address.test(item.spender) ||
    (item.kind === "erc721" && (!/^(?:0|[1-9]\d{0,77})$/.test(item.tokenId) || BigInt(item.tokenId) >= 2n ** 256n))) throw new Error("Invalid approval query");
}

export function createApprovals({ chainId, localUrl, publicUrl, logsUrl, send, browserOrigin, fetcher = fetch }) {
  const rates = new Map();
  const call = async (url, method, params) => {
    const response = await fetcher(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error("Approval RPC unavailable");
    const data = await response.json();
    if (data.error) throw new Error(data.error.message || "Approval call failed");
    return data.result;
  };
  const source = async () => {
    const local = await Promise.allSettled([call(localUrl, "eth_chainId", []), call(localUrl, "eth_syncing", []), call(localUrl, "eth_getBlockByNumber", ["latest", false])]);
    if (local.every(value => value.status === "fulfilled") && nodeReadiness({ expectedChainId: chainId, chain: local[0].value, sync: local[1].value, block: local[2].value }).synced)
      return { url: localUrl, source: "local", block: local[2].value };
    if (Number(await call(publicUrl, "eth_chainId", [])) !== chainId) throw new Error("Approval RPC network mismatch");
    const block = await call(publicUrl, "eth_getBlockByNumber", ["latest", false]);
    if (!nodeReadiness({ expectedChainId: chainId, chain: chainId, sync: false, block }).synced) throw new Error("Approval RPC is behind");
    return { url: publicUrl, source: "public", block };
  };
  const logs = async (owner, from, to, topic) => {
    const url = new URL(logsUrl);
    url.search = new URLSearchParams({ module: "logs", action: "getLogs", fromBlock: String(from), toBlock: String(to), topic0: topic, topic1: zeroPadValue(owner, 32), topic0_1_opr: "and" }).toString();
    const response = await fetcher(url, { signal: AbortSignal.timeout(15000), headers: { accept: "application/json" } });
    if (!response.ok) throw new Error("Data source unavailable");
    const data = await response.json();
    if (data.status === "0" && data.message === "No logs found" && Array.isArray(data.result) && !data.result.length) return [];
    if (data.status !== "1" || !Array.isArray(data.result) || data.result.length > 1000) throw new Error("invalidApiResponse");
    return data.result;
  };
  const events = async (owner, params) => {
    if (!address.test(owner)) throw new Error("Invalid approval owner");
    const selected = await source();
    const head = Number(BigInt(selected.block.number));
    const number = (name, fallback) => {
      const value = params.get(name);
      if (value == null) return fallback;
      if (!/^\d{1,12}$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error("Invalid approval range");
      return Number(value);
    };
    const from = number("from", 0), snapshot = number("snapshot", head);
    if (snapshot > head || from > snapshot) throw new Error("Invalid approval range");
    let to = Math.min(snapshot, number("to", snapshot));
    if (to < from) throw new Error("Invalid approval range");
    // Legacy Blockscout returns at most 1000 logs and ignores page/offset.
    // Split saturated ranges, including their boundary block, rather than
    // silently accepting a truncated history or skipping same-block events.
    for (let split = 0; split < 32; split++) {
      const groups = await Promise.all(approvalTopics.map(topic => logs(owner, from, to, topic)));
      if (groups.every(group => group.length < 1000)) {
        const unique = new Map();
        for (const log of groups.flat()) {
          const event = decodeApproval(log, owner, from, to);
          const previous = unique.get(event.key);
          if (!previous || event.block > previous.block || event.block === previous.block && event.logIndex > previous.logIndex) unique.set(event.key, event);
        }
        return { chainId, owner, items: [...unique.values()], from, through: to, snapshot,
          next: to < snapshot ? { from: to + 1, to: snapshot, snapshot } : null, complete: to === snapshot, source: "index-events" };
      }
      if (from === to) throw new Error("approvalHistoryIncomplete");
      to = from + Math.floor((to - from) / 2);
    }
    throw new Error("approvalHistoryIncomplete");
  };
  const state = async (owner, items) => {
    if (!address.test(owner) || !Array.isArray(items) || !items.length || items.length > 12) throw new Error("Invalid approval state request");
    items.forEach(validateApproval);
    const selected = await source();
    const read = async (token, method, args) => {
      const data = await call(selected.url, "eth_call", [{ to: token, data: abi.encodeFunctionData(method, args), gas: "0x7a120" }, selected.block.number]);
      return abi.decodeFunctionResult(method, data)[0];
    };
    const results = [];
    // Bound expensive/untrusted contract execution; at most three records run
    // concurrently, and all reads refer to the same canonical block.
    for (let offset = 0; offset < items.length; offset += 3) results.push(...await Promise.all(items.slice(offset, offset + 3).map(async item => {
      try {
        let amount, active, standard = item.kind, symbol, decimals;
        if (item.kind === "erc20") {
          amount = (await read(item.token, "allowance", [owner.toLowerCase(), item.spender.toLowerCase()])).toString(); active = BigInt(amount) > 0n;
          const metadata = await Promise.allSettled([read(item.token, "symbol", []), read(item.token, "decimals", [])]);
          if (metadata[0].status === "fulfilled" && typeof metadata[0].value === "string") symbol = metadata[0].value.slice(0, 40);
          if (metadata[1].status === "fulfilled") decimals = Number(metadata[1].value);
        } else if (item.kind === "erc721") {
          const [holder, approved] = await Promise.all([read(item.token, "ownerOf", [item.tokenId]), read(item.token, "getApproved", [item.tokenId])]);
          active = holder.toLowerCase() === owner.toLowerCase() && approved.toLowerCase() === item.spender.toLowerCase() && approved !== ZeroAddress;
        } else {
          const [erc721, erc1155, approved] = await Promise.all([read(item.token, "supportsInterface", ["0x80ac58cd"]), read(item.token, "supportsInterface", ["0xd9b67a26"]), read(item.token, "isApprovedForAll", [owner.toLowerCase(), item.spender.toLowerCase()])]);
          standard = erc721 ? "erc721" : erc1155 ? "erc1155" : "unknown"; active = approved;
        }
        return { ...item, active, standard, ...(amount !== undefined ? { amount, symbol, decimals } : {}) };
      } catch { return { ...item, active: null, standard: "unknown", error: "approvalStateUnavailable" }; }
    })));
    // Detect reorgs instead of presenting state as canonical evidence.
    const canonical = await call(selected.url, "eth_getBlockByNumber", [selected.block.number, false]);
    if (canonical?.hash !== selected.block.hash) throw new Error("Approval snapshot changed; retry");
    return { chainId, owner, block: Number(BigInt(selected.block.number)), blockHash: selected.block.hash, source: selected.source, items: results };
  };
  const handler = async (req, res, url) => {
    const owner = url.pathname.split("/")[3];
    try {
      if (url.pathname.endsWith("/state") && req.method === "POST") {
        if (req.headers.origin && req.headers.origin !== browserOrigin && new URL(req.headers.origin).host !== req.headers.host) return send(res, 403, { error: "Cross-origin approval request not allowed" });
      } else if (!url.pathname.endsWith("/events") || !["GET", "HEAD"].includes(req.method)) return send(res, 405, { error: "Method not allowed" });
      const now = Date.now();
      for (const [key, rate] of rates) if (rate.until < now) rates.delete(key);
      const ip = req.socket.remoteAddress, rate = rates.get(ip) || { until: now + 60000, count: 0 };
      if (rates.size > 1000 || ++rate.count > 100) return send(res, 429, { error: "requestFailed" });
      rates.set(ip, rate);
      let result;
      if (url.pathname.endsWith("/state")) {
        let body = "";
        for await (const chunk of req) { body += chunk.toString(); if (body.length > 16000) return send(res, 413, { error: "Approval request too large" }); }
        let parsed; try { parsed = JSON.parse(body); } catch { return send(res, 400, { error: "Invalid JSON approval request" }); }
        result = await state(owner, parsed.items);
      } else result = await events(owner, url.searchParams);
      return send(res, 200, result, { "cache-control": "no-store" });
    } catch (error) { return send(res, /^Invalid/.test(error.message) ? 400 : 502, { error: error.message }, { "cache-control": "no-store" }); }
  };
  return { events, state, handler };
}
