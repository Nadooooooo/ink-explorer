# Architecture

Ink Explorer has two deployable layers:

1. `src/` is a React/Vite single-page interface. It renders explorer routes and maintains the WebSocket connection. Indexed and read RPC requests use the same origin by default; a static frontend can point to a private HTTPS API with `VITE_API_ORIGIN`. Transactions are explicitly requested from the user's browser wallet.
2. `server/server.mjs` serves the built files, injects route-specific SEO metadata, provides a read-only API facade, maintains bounded upstream and NFT media caches, and samples the local execution and rollup nodes.

Cache entries are capped in memory. The server prunes upstream disk snapshots older than 24 hours or above 256 MB and media older than 30 days or above 512 MB. Pruning runs in the background, so concurrent writes may briefly exceed a disk target. Cache files are disposable and are excluded from Git.

## Find your way through the UI

`src/App.tsx` contains several page families. Search by component name rather than line number:

| Area | Components |
| --- | --- |
| Navigation and shared states | `Header`, `SearchBox`, `Loading`, `ErrorState`, `Empty` |
| Overview and indexed lists | `Home`, `HomeData`, `LedgerList`, `Pagination` |
| Blocks, transactions and accounts | `BlockDetail`, `TxDetail`, `AddressDetail` |
| Tokens, NFTs and pools | `Tokens`, `TokenDetail`, `NftDetail`, `Pools`, `PoolDetail` |
| Analytics and node status | `Analytics`, `NetworkPage` |
| Route selection and locale | `route`, `pageMetadata`, `App` |

Contract write UI lives separately in `src/ContractInteraction.tsx`; network constants live in `src/network.ts`; translations live in `src/i18n.ts`, `src/page-copy.ts` and `src/dynamic-copy.ts`. `src/styles.css` starts with shared tokens and component rules, then contains later responsive and visual refinements. Put new rules near the relevant component and check whether a later media query overrides them. Extract a component when a page family grows substantially rather than extending the main file indefinitely.

## Data sources

| Source | Purpose | Failure behaviour |
| --- | --- | --- |
| Ink Blockscout API v2 | Blocks, transactions, addresses, contracts, tokens and NFTs | Retry, then use a disk snapshot up to 24 hours old |
| Blockscout Stats Service | Time-series analytics and counters | Cached for 15 seconds; errors remain visible |
| Blockscout Contract Info | DEX pool pairs, DEX, fees, liquidity and volume | Cached for 15 seconds; values carry a market-data caveat |
| Local OP-Reth | Head, sync, peers, gas and live blocks | Never replaced by public index data |
| Local OP Node | Safe/finalized heads and rollup peers | Rendered as degraded when unavailable |

## Routes

The browser router supports overview, blocks, transactions, addresses/contracts, tokens, NFT instances, liquidity pools, analytics, OP Stack activity, developer access and local network health. The server returns per-route title, description, canonical URL, Open Graph data, structured data, `robots.txt` and a multilingual sitemap before JavaScript runs.

## Security decisions

- Explorer and statistics proxy paths accept a conservative character set and reject traversal.
- Contract Info accepts only pool list, detail and check routes with a validated address.
- NFT media accepts public HTTPS origins only. DNS results are checked for private, loopback, link-local, multicast and reserved ranges on every redirect.
- HTML responses set a restrictive Content Security Policy plus MIME sniffing, framing, permissions and referrer protections. Operators should still terminate TLS at the deployment edge.
- Compressible static responses negotiate Brotli or Gzip; only content-hashed Vite assets receive immutable one-year caching.
- Indexed APIs are GET-only. `POST /api/contract-rpc` accepts a fixed list of read/simulation methods, validates bounded payloads, checks chain identity and applies per-client limits. It never accepts signing or broadcast methods. The browser asks its wallet to simulate/review/sign a transaction only after explicit interaction.

## Network isolation

The main worker serves Mainnet on 4188. A separate loopback worker on 4190 serves Sepolia via `/testnet/`; HTTP and WebSocket forwarding preserve the same browser origin. Each worker has independent in-memory caches and live state. Disk upstream cache keys hash the full upstream URL, which includes the chain-specific origin or chain ID. NFT media blobs can be shared because their keys represent exact media URLs rather than chain entities.

The browser derives its network from the path prefix. Every internal navigation, API query, media URL and WebSocket follows that prefix; a network change triggers a complete navigation. Wallet chain ID is checked on connection and again immediately before submission. Account/network changes invalidate prepared transactions. ABI encoding is loaded lazily with the interaction panel so browsing pages do not download the contract tooling.

Local node health is never substituted with public health. A missing or syncing local node can use the corresponding Ink public RPC for contract reads/simulation, with `source: public` shown to the user. A successful simulation does not guarantee eventual transaction success: onchain state may change before inclusion. Receipts distinguish success, revert and pending status.
