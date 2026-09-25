const address = /^0x[\da-f]{40}$/i;
const hash = /^0x[\da-f]{64}$/i;
const hex = /^0x(?:[\da-f]{2})*$/i;
const limits = new Map();

export function validateRpc(method, params) {
  if (!Array.isArray(params)) throw new Error("Invalid RPC parameters");
  if (["eth_chainId", "eth_blockNumber"].includes(method) && !params.length)
    return;
  if (
    method === "eth_getTransactionReceipt" &&
    params.length === 1 &&
    hash.test(params[0])
  )
    return;
  if (
    method === "eth_getCode" &&
    params.length === 2 &&
    address.test(params[0]) &&
    params[1] === "latest"
  )
    return;
  if (["eth_call", "eth_estimateGas"].includes(method)) {
    if (
      params.length !== (method === "eth_call" ? 2 : 1) ||
      (method === "eth_call" && params[1] !== "latest")
    )
      throw new Error("Only latest-state calls are supported");
    const tx = params[0];
    if (
      !tx ||
      !address.test(tx.to) ||
      !hex.test(tx.data || "0x") ||
      (tx.data || "").length > 65536
    )
      throw new Error("Invalid contract call");
    if (
      Object.keys(tx).some(
        (key) => !["to", "from", "data", "value", "gas"].includes(key),
      )
    )
      throw new Error("Unsupported transaction field");
    if (tx.from && !address.test(tx.from)) throw new Error("Invalid sender");
    for (const key of ["value", "gas"])
      if (tx[key] !== undefined && !/^0x[\da-f]{1,64}$/i.test(tx[key]))
        throw new Error(`Invalid ${key}`);
    if (tx.gas && BigInt(tx.gas) > 15000000n)
      throw new Error("Gas limit exceeds 15 million");
    tx.gas ??= "0xe4e1c0";
    return;
  }
  throw new Error("RPC method not allowed");
}

export function createContractRpc({ localUrl, publicUrl, chainId, browserOrigin }) {
  const call = async (url, method, params) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`RPC unavailable (${response.status})`);
    return response.json();
  };
  let localReady = false,
    checked = 0;
  return async (req, res) => {
    const send = (status, body) => {
      res.writeHead(status, {
        "content-type": "application/json",
        "cache-control": "no-store",
      });
      res.end(JSON.stringify(body));
    };
    try {
      if (
        req.headers.origin &&
        req.headers.origin !== browserOrigin &&
        new URL(req.headers.origin).host !== req.headers.host
      )
        return send(403, {
          error: "Cross-origin RPC requests are not allowed",
        });
      const ip = req.socket.remoteAddress;
      const now = Date.now();
      for (const [key, item] of limits)
        if (item.until < now) limits.delete(key);
      const rate = limits.get(ip) || { until: now + 60000, count: 0 };
      if (limits.size >= 1000 && !limits.has(ip))
        return send(429, { error: "RPC busy; try again shortly" });
      limits.set(ip, rate);
      if (++rate.count > 120)
        return send(429, {
          error: "Too many contract queries; try again shortly",
        });
      let body = "";
      for await (const chunk of req) {
        body += chunk.toString();
        if (body.length > 70000)
          return send(413, { error: "Contract request too large" });
      }
      let method, params;
      try { ({ method, params } = JSON.parse(body)); }
      catch { return send(400, { error: "Invalid JSON contract request" }); }
      try {
        validateRpc(method, params);
      } catch (error) {
        return send(400, { error: error.message });
      }
      if (now - checked > 5000) {
        const status = await Promise.allSettled([
          call(localUrl, "eth_syncing", []),
          call(localUrl, "eth_getBlockByNumber", ["latest", false]),
          call(localUrl, "eth_chainId", []),
        ]);
        localReady =
          status.every((item) => item.status === "fulfilled") &&
          nodeReadiness({ chain: status[2].value.result, expectedChainId: chainId,
            sync: status[0].value.result, block: status[1].value.result }).synced;
        checked = now;
      }
      const url = localReady ? localUrl : publicUrl;
      const identity = await call(url, "eth_chainId", []);
      if (Number(identity.result) !== chainId)
        return send(503, { error: "RPC network mismatch" });
      const result = await call(url, method, params);
      send(200, {
        ...result,
        source: localReady ? "local" : "public",
        chainId,
      });
    } catch (error) {
      send(502, { error: error.message || "Contract RPC unavailable" });
    }
  };
}
import { nodeReadiness } from "./node-readiness.mjs";
