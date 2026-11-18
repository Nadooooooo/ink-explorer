// The service and developer guide consume the same public capabilities.
export const publicRpcMethods = [
  "eth_chainId", "net_version", "web3_clientVersion", "eth_blockNumber", "eth_syncing", "eth_gasPrice", "eth_maxPriorityFeePerGas",
  "eth_getBalance", "eth_getCode", "eth_getTransactionCount", "eth_getStorageAt",
  "eth_getBlockByNumber", "eth_getBlockByHash", "eth_getBlockTransactionCountByNumber", "eth_getBlockTransactionCountByHash",
  "eth_getTransactionByHash", "eth_getTransactionReceipt", "eth_getTransactionByBlockHashAndIndex", "eth_getTransactionByBlockNumberAndIndex",
  "eth_call", "eth_estimateGas", "eth_feeHistory", "eth_getLogs",
] as const;
export const publicRpcLimits = { batch: 20, bodyBytes: 65536, responseBytes: 4194304, methodsPerMinute: 120, globalMethodsPerMinute: 600, concurrentRequests: 4, logBlocks: 2000, gas: 15000000, timeoutMs: 15000 } as const;

export function developerEndpoints(origin: string, basePath = "") {
  const api = new URL(`${basePath}/api`, origin).href;
  const socket = new URL(api + "/live");
  socket.protocol = socket.protocol === "https:" ? "wss:" : "ws:";
  return { api, rpc: api + "/rpc", websocket: socket.href, documentation: new URL(`${basePath}/developers`, origin).href };
}
