# Running and adapting Ink Explorer

This repository is an Ink explorer, with Ink names, chain IDs, URLs and some OP Stack checks in the code. It can be forked, but changing a few environment variables does **not** turn it into a generic explorer for every EVM chain. This guide separates the settings you can change at deployment from the source changes needed for another chain.

The code is MIT licensed. `private: true` in `package.json` only prevents accidentally publishing this application as an npm library; it does not make a Git repository private.

## Run the Ink explorer locally

Use Node.js 22.12 or newer and npm. The build needs the development dependencies even when your shell has `NODE_ENV=production`.

```bash
npm ci --include=dev
cp .env.example .env
npm run build
npm start
```

Open `http://127.0.0.1:4188`. `npm start` reads `.env` if it exists; a variable exported by the shell takes precedence. The sample `PUBLIC_URL` is empty so local canonical URLs use the request host. Set it to your HTTPS origin before publishing.

The public Blockscout endpoints provide indexed blocks, transactions and address pages. The network health panel needs your own OP-Reth and OP Node. If these are absent, their status is unavailable. The browser contract panel may use the configured public RPC for reads and simulation when the local node is not ready.

### Mainnet and Sepolia

The production setup runs two Node processes. The main process listens on `4188`; the Sepolia process listens on loopback `4190`. Requests under `/testnet/` are forwarded to the Sepolia process by the main server. Keep that second port private.

```bash
cp .env.sepolia.example .env.sepolia
pm2 start ecosystem.config.cjs
```

The main process reads `.env`, and the Sepolia process reads `.env.sepolia`. Each file must contain URLs and local RPC ports for its own chain. The PM2 config uses its own directory as `cwd`, so a fork can live anywhere. `pm2 startOrReload ecosystem.config.cjs --update-env` applies later changes. You can also run only `npm start` for Mainnet, but `/testnet/` then needs a Sepolia worker on port 4190.

The PM2 process names still use `ink-observer` and `ink-observer-sepolia` so existing installations can reload in place. They are service identifiers, not the public project name. A fork can rename them after removing or migrating its old PM2 entries.

## Deployment settings

| Setting | Used by | What to set |
| --- | --- | --- |
| `HOST`, `PORT` | HTTP server | Bind address and port. Put the main process behind HTTPS in production. |
| `INK_TESTNET_PORT` | Mainnet proxy | Loopback port of the Sepolia worker; match its `PORT`. |
| `PUBLIC_URL` | SEO output | The public HTTPS origin, without a path or trailing slash. Use the same origin for both workers. |
| `INK_NETWORK` | Server | `sepolia` for the second worker; any other value selects Mainnet. |
| `BLOCKSCOUT_API` | Server | Blockscout v2 API root for that chain. |
| `BLOCKSCOUT_STATS_API` | Server | Stats Service API root for that chain. |
| `CONTRACT_INFO_API` | Server | Contract Info API root for pool data. |
| `INK_RPC` | Server | Private local execution JSON-RPC. |
| `INK_OP_NODE_RPC` | Server | Private OP Node JSON-RPC. |
| `INK_PUBLIC_RPC` | Server | Public fallback for contract reads and simulation. |
| `INK_METRICS_URL` | Server | Local execution metrics endpoint. The default uses port 9001 or 9101. |
| `INK_NODE_DATA_DIR` | Server | Optional local node data directory used for disk usage. Leave it empty to omit the disk figure. |
| `INK_L1_FAILOVER_STATUS` | Server | Optional Mainnet L1 relay readiness URL. |

The API credentials and local RPC addresses belong in `.env` files or process environment variables. These files, `data/upstream-cache` and `data/media-cache` are ignored by Git. Do not make local RPC ports public just to populate the health panel.

## Where to make a change

| Task | Start here |
| --- | --- |
| Change browser routes, tables, transaction details or data formatting | `src/App.tsx` |
| Change network labels, browser wallet chain ID and external explorer/RPC links | `src/network.ts` |
| Change visible translated labels | `src/i18n.ts` |
| Change visual tokens and responsive rules | `src/styles.css`, `src/contracts.css`, `docs/DESIGN_SYSTEM.md` |
| Change wallet identicons or token image routing | `src/EntityMark.tsx`, `src/media.ts` |
| Change contract ABI forms or wallet behavior | `src/ContractInteraction.tsx`, `src/contract-abi.ts` |
| Change API sources, caching, health probes or server SEO | `server/server.mjs` |
| Change allowed contract RPC methods | `server/contract-rpc.mjs` and its security tests |
| Change Sepolia forwarding | `server/testnet-proxy.mjs`, `ecosystem.config.cjs` |
| Add an integration check | `scripts/`, then add an npm script in `package.json` |

`src/App.tsx` and `src/styles.css` are large files. Follow the existing section boundaries for a small edit. For a substantial new feature, extract a component and its styles into focused files, keeping `App.tsx` responsible for routing and shared state. The contract interaction panel is already lazy loaded as an example.

## Forking for another chain

1. Confirm that the chain has a compatible Blockscout v2 API and Stats Service, or replace the server adapters. Check `/api/overview`, `/api/explorer/blocks`, `/api/explorer/transactions`, `/api/stats/*` and `/api/contract-info/pools` against your indexer. Pool pages depend on Contract Info and should be removed or replaced if that service has no data for your chain.
2. Update the chain IDs, names, public RPC and external explorer URLs in `src/network.ts` **and** the corresponding server choices in `server/server.mjs`. The current code has two fixed networks and a `/testnet/` prefix; add an explicit routing design before introducing a third.
3. Replace Ink-specific page copy in `src/App.tsx`, `src/i18n.ts`, `index.html`, the manifest, SEO descriptions and JSON-LD in `server/server.mjs`. Search for `Ink`, `57073`, `763373`, `inkonchain`, `OP-Reth` and `OP Node`. Review every translation instead of mechanically replacing names inside sentences.
4. Replace the Ink symbols in `public/brand/` and update the icon and social image paths in `index.html`, `public/manifest.webmanifest` and `server/server.mjs`. Third-party marks are not covered by the code's MIT license.
5. Adapt the health probes. `optimism_syncStatus`, `opp2p_peerStats`, safe/finalized L2 heads and Optimism deposit/withdrawal pages are OP Stack features. For a different execution or rollup stack, implement truthful probes or remove those panels. Never label a public indexer as a local node.
6. Review contract writes for the new chain. The browser checks wallet chain ID; the server checks chain ID again before forwarding read/simulation RPC. Keep the server's signing and broadcast ban.
7. Update `.env` files, PM2 process names, README, security policy, sitemap, licensing and attribution. Replace the Ink addresses, chain IDs and expected labels in `scripts/` so the integration tests exercise your chain. Remove any feature claim that you did not verify.

Wallet marks use [`blo`](https://github.com/bpierre/blo), an MIT-licensed Ethereum blockie library. The image is generated in the browser from a lowercased wallet address, so a given address has the same pixel pattern in the transaction list and transaction detail. It is a visual cue, never proof that two parties are the same person. Token images still come from the indexed metadata and pass through the server media proxy.

## Check a change

For a source change, run `npm run check`, `npm run build`, `npm audit --audit-level=high` and `npm run test:node-readiness`. Start the built server before browser or HTTP integration tests. `npm run test:security` checks API boundaries without a local node. `npm run test:ui`, `npm run test:a11y`, `npm run test:i18n` and `npm run test:responsive` need Chrome and live upstream data. The WebSocket and network live suites need synced local nodes. `npm run test:contracts` creates its own Anvil chain; it never submits a transaction to Ink.

Run a browser check at narrow and wide widths after changing tables, tabs or navigation. For a public deployment, verify canonical URLs, sitemap, chain selector, a real transaction, a contract read, a simulated write and the visible fallback when local nodes are down. The live upstream can change during a test run, so keep deterministic checks separate from chain-state assertions.
