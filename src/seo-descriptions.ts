// Shared copy for the HTTP shell and browser metadata. Each canonical
// directory describes its own contents instead of reusing the home snippet.
export const seoDescriptions: Record<string, string> = {
  "/analytics": "Compare transactions, active accounts, fees and success rate. Select a range or inspect any chart point.",
  "/advanced": "Ink deposits, withdrawals and ERC‑4337 user operations.",
  "/network": "OP-Reth and OP Node status reported by this machine.",
  "/accounts": "Explore Ink accounts ranked by ETH balance, with transaction counts and identified contract names.",
  "/internal-txs": "Trace internal contract calls on Ink by parent transaction, block, sender, recipient and ETH value.",
  "/token-transfers": "Browse ERC-20, ERC-721 and ERC-1155 transfers on Ink with token, sender, recipient and amount.",
  "/deposits": "Track Ethereum-to-Ink deposits by L1 block, origin wallet, transaction hashes and L2 inclusion.",
  "/withdrawals": "Follow Ink-to-Ethereum withdrawals by message nonce, L2 transaction and relay status.",
  "/batches": "Inspect transaction batches published to Ethereum, including L2 block ranges and L1 transactions.",
  "/dispute-games": "Inspect Ink dispute games that challenge L2 output claims on Ethereum and see their resolution status.",
  "/ops": "Explore ERC-4337 user operations on Ink, including sender, EntryPoint, bundler, paymaster and fees.",
  "/name-services": "Look up Ink name-service domains, ownership, resolved addresses and registration history.",
  "/gas-tracker": "Check Ink gas prices, network utilization and recent gas history from live chain data.",
  "/apps": "Browse DeFi, bridges, wallets and tools in the official Ink app directory. Find applications and links for Ink Mainnet.",
  "/contract-verification": "Verify Ink contract source code and inspect compiler settings, ABI and proxy implementations.",
  "/public-tags/submit": "Suggest a public label for an Ink address or contract, with evidence for community review.",
  "/approvals": "Review Ink token allowances and prepare wallet transactions to revoke unwanted approvals.",
  "/stats": "Explore Ink charts for transactions, accounts, blocks, gas, tokens, contracts and user operations.",
};
