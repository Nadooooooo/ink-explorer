export const apiRoutes = [
  ["/overview","Network overview",""],
  ["/explorer/blocks","blocks","type=block | reorg"],
  ["/explorer/blocks/{height-or-hash}","block",""],
  ["/explorer/blocks/{height-or-hash}/transactions","transactions",""],
  ["/explorer/transactions","transactions",""],
  ["/v1/transactions","Filtered transactions","transaction_types, methods, age_from, age_to, from_address_hashes_to_include, to_address_hashes_to_include, address_relation, status, cursor"],
  ["/explorer/transactions/{hash}","transactionHash",""],
  ["/explorer/transactions/{hash}/token-transfers","Token transfers",""],
  ["/explorer/transactions/{hash}/internal-transactions","Internal transactions",""],
  ["/explorer/transactions/{hash}/logs","Event logs",""],
  ["/explorer/internal-transactions","Internal transactions",""],
  ["/explorer/addresses","Top accounts",""],
  ["/explorer/addresses/{address}","Address",""],
  ["/address-balance/{address}","ETH balance",""],
  ["/explorer/addresses/{address}/counters","Address counters",""],
  ["/explorer/addresses/{address}/transactions","Address transactions",""],
  ["/explorer/addresses/{address}/token-transfers","Token transfers",""],
  ["/explorer/addresses/{address}/internal-transactions","Internal transactions",""],
  ["/explorer/tokens","tokens","type=ERC-20 | ERC-721 | ERC-1155"],
  ["/explorer/tokens/{address}","Token",""],
  ["/explorer/tokens/{address}/transfers","Token transfers",""],
  ["/explorer/tokens/{address}/holders","Token holders",""],
  ["/explorer/tokens/{address}/instances","NFT instances",""],
  ["/explorer/tokens/{address}/instances/{token-id}","NFT instance",""],
  ["/explorer/tokens/{address}/instances/{token-id}/transfers","NFT transfers",""],
  ["/explorer/token-transfers","Token transfers","type=ERC-20 | ERC-721 | ERC-1155"],
  ["/explorer/optimism/deposits","L1 → L2 deposits",""],
  ["/explorer/optimism/withdrawals","L2 → L1 withdrawals",""],
  ["/explorer/optimism/batches","Transaction batches",""],
  ["/explorer/optimism/batches/count","Transaction batch count",""],
  ["/explorer/optimism/batches/{number}","Transaction batch",""],
  ["/explorer/optimism/games","Dispute games",""],
  ["/explorer/optimism/games/count","Dispute game count",""],
  ["/explorer/blocks/optimism-batch/{number}","Batch blocks",""],
  ["/explorer/transactions/optimism-batch/{number}","Batch transactions",""],
  ["/explorer/proxy/account-abstraction/operations","User operations",""],
  ["/explorer/proxy/account-abstraction/operations/{hash}","User operation",""],
  ["/explorer/smart-contracts","Verified contracts",""],
  ["/explorer/smart-contracts/{address}","Smart contract",""],
  ["/explorer/stats","Network statistics",""],
  ["/contract-info/pools","DEX pools",""],
  ["/contract-info/pools/{address-or-id}","DEX pool",""],
  ["/dapps","Dapps",""],
  ["/stats/counters","Network totals",""],
  ["/stats/lines","All statistics",""],
  ["/stats/lines/{metric}","Chart","from=YYYY-MM-DD, to=YYYY-MM-DD, resolution=DAY | WEEK | MONTH | YEAR"],
  ["/search","search","q"],
  ["/live/config","WebSocket configuration",""],
  ["/live/status","WebSocket status",""],
  ["/live/snapshot","Latest blocks and transactions",""],
  ["/network","Network health",""],
];

// One response classification drives both the human guide and OpenAPI schema.
export function apiResponseKind(path: string) {
  if (path === "/dapps") return "array";
  if (["/explorer/optimism/batches/count", "/explorer/optimism/games/count"].includes(path)) return "number";
  if (path === "/stats/counters") return "counters";
  if (path === "/stats/lines") return "sections";
  if (path.startsWith("/stats/lines/")) return "chart";
  if (["/overview", "/explorer/stats", "/network", "/live/config", "/live/status", "/live/snapshot"].includes(path)) return "object";
  if (path.includes("{") && !["/transactions", "/internal-transactions", "/token-transfers", "/transfers", "/logs", "/holders", "/instances", "/blocks/optimism-batch/{number}", "/transactions/optimism-batch/{number}"].some(suffix=>path.endsWith(suffix))) return "object";
  return "page";
}
