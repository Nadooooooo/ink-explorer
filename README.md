# Ink Explorer

Ink Explorer is an open source project for the Ink community. You can use it to look up blocks, transactions, wallets, tokens and contracts on Ink Mainnet or Sepolia. The site gets historical data from public indexes and checks live chain status against local OP-Reth and OP Node instances when those are available.

The code is MIT licensed. You can run your own instance, fix a bug or adapt the explorer for another chain. See [the fork guide](docs/FORKING.md) before changing networks: some Ink and OP Stack behaviour is built into the source. This project is independent and is not an official Ink explorer.

Contract pages support ABI-based reads and wallet-confirmed writes, including proxy implementations and custom ABIs. The server does not hold keys or submit transactions on a user's behalf.

The interface uses English as its source language and provides translated page content, navigation and entity terminology in Chinese, Hindi, Spanish, French, Arabic, Bengali, Portuguese, Russian and Japanese. Project documentation is in English. Arabic uses a right-to-left layout. Locale-aware numbers, dates, canonical links and language alternatives are generated without a translation service.

## Explorer coverage

- Browse recent blocks and transactions with cursor pagination. Wallet addresses use deterministic pixel identicons; transaction pages show fees, transfers, logs and traces.
- Inspect addresses, verified contracts, proxy implementations, tokens and NFT instances. Contract calls use an ABI and stay under the user's wallet control.
- Search DEX pools by token, exchange, fee tier, liquidity or volume. Market figures come from a third-party data source and are labelled as estimates.
- Follow Optimism bridge activity and ERC-4337 user operations, or export analytics as CSV.
- Compare indexed history with local execution and rollup node status. The live view uses WebSocket updates and shows when a node is unavailable or behind.
- Share route-specific pages with canonical URLs, social metadata and a multilingual sitemap.

## Requirements

- Node.js 22.12 or newer
- npm
- Google Chrome at `/usr/bin/google-chrome` for the browser suites
- optional local Ink OP-Reth and OP Node JSON-RPC for independent live verification

## Quick start

```bash
npm ci --include=dev
cp .env.example .env
npm run build
npm start
```

Open `http://127.0.0.1:4188`. The historical explorer works with the public defaults. If local nodes are absent, their health signals are shown as unavailable instead of being substituted with public data.

For PM2:

```bash
pm2 start ecosystem.config.cjs
pm2 save
```

Set `PUBLIC_URL` to the public HTTPS origin before production deployment. Keep local RPC ports bound to loopback or a private service network.

For the Sepolia worker, copy `.env.sepolia.example` to `.env.sepolia` before starting PM2. The two processes read separate environment files. See [the deployment and fork guide](docs/FORKING.md) for the exact settings and the changes needed for another chain.

## Configuration

| Variable                 | Default                                  | Purpose                                  |
| ------------------------ | ---------------------------------------- | ---------------------------------------- |
| `PORT`                   | `4188`                                   | HTTP/WebSocket listen port               |
| `INK_TESTNET_PORT`       | `4190`                                   | Loopback Sepolia worker port for the main proxy |
| `HOST`                   | `0.0.0.0`                                | HTTP bind address; testnet worker uses loopback |
| `INK_NETWORK`            | mainnet                                  | `sepolia` selects chain 763373 and its upstreams |
| `PUBLIC_URL`             | request origin                           | Canonical, sitemap and Open Graph origin |
| `EXPLORER_BROWSER_ORIGIN` | empty                                    | Exact HTTPS origin allowed to read the API from a separate browser site |
| `VITE_API_ORIGIN`        | empty                                    | HTTPS origin of the API for a static frontend build; empty keeps same-origin requests |
| `BLOCKSCOUT_API`         | Ink Blockscout v2                        | Indexed chain history                    |
| `BLOCKSCOUT_STATS_API`   | Ink Stats Service                        | Counters and time series                 |
| `CONTRACT_INFO_API`      | Blockscout Contract Info for chain 57073 | DEX pool market metadata                 |
| `INK_RPC`                | `http://127.0.0.1:8545`                  | Local OP-Reth JSON-RPC                   |
| `INK_OP_NODE_RPC`        | `http://127.0.0.1:9545`                  | Local OP Node JSON-RPC                   |
| `INK_PUBLIC_RPC`         | Ink public RPC                           | Contract read/simulation fallback       |
| `INK_METRICS_URL`        | `http://127.0.0.1:9001/metrics`          | Local execution metrics endpoint        |
| `INK_NODE_DATA_DIR`      | empty                                    | Optional local node storage path for disk usage |
| `INK_L1_FAILOVER_STATUS` | `http://127.0.0.1:18545/readyz`          | Optional local L1 relay health           |

## Data and caching

A static frontend such as Vercel does not run `server/server.mjs`. To connect it to a private Tailscale Serve endpoint, set `VITE_API_ORIGIN` in the frontend build environment to the Serve HTTPS origin and `EXPLORER_BROWSER_ORIGIN` on both server workers to the exact frontend origin. Redeploy the frontend and restart both workers after changing these values. The browser must be connected to the tailnet to reach the API; modern browsers may also ask for local-network access permission. Tailscale Serve does not make the node public. The API permits cross-origin reads and contract simulations only from that configured origin. Do not put RPC credentials or local RPC URLs in `VITE_*` variables. `vercel.json` routes deep links back to the single-page interface.

Ink Blockscout API v2 and Stats Service provide network-wide indexed history. Blockscout Contract Info supplies pool discovery and market estimates. OP-Reth and OP Node provide only the operator's independent live checks.

Public JSON responses are cached in memory and on disk. A verified disk response can be served for up to 24 hours when the public index rate-limits or becomes unavailable. NFT images are downloaded on first display into `data/media-cache` and then served from the same origin. Private-network targets, non-HTTPS sources, unsupported image types and files over 8 MB are rejected. Background pruning removes old files and aims to keep upstream snapshots under 256 MB and media under 512 MB; active writes can briefly exceed those limits. Cache folders are excluded from version control.

Pool prices, liquidity, market capitalisation and volume are third-party estimates. NFT metadata can be mutable. The UI labels both risks and never presents them as investment advice.

## Testing

With the production server running on port 4188:

```bash
npm run check
npm run build
npm run test:ws
npm run test:network-live
npm run test:ui
npm run test:a11y
npm run test:i18n
npm run test:security
npm run test:identicons
npm run test:content
npm run test:performance
npm run test:lighthouse
npm run test:loading
npm run test:contracts
npm run test:networks
npm run test:node-testnet
npm run test:node-readiness
npm run test:layout
npm run test:responsive
npm run test:space
npm run test:style
```

The browser tests cover routes at desktop, tablet and mobile widths, plus menus, tabs, pagination, media, contract source, pools, analytics and localization. `test:layout` checks 19 route states at 12 widths, including long NFT lists. `test:responsive` checks each CSS breakpoint at nearby widths, keyboard and touch interactions, and empty or failed network responses. `test:style` compares rendered surfaces and controls with [the shared design rules](docs/DESIGN_SYSTEM.md). `test:content` checks copy, metadata and labels; `test:a11y` checks serious and critical Axe findings. Browser tests need Chrome and a running production server.

Lighthouse runs mobile and desktop audits on six representative routes and writes reports under `reports/lighthouse/`. Set `BASE_URL`, `LIGHTHOUSE_DIR`, `LIGHTHOUSE_ROUTES` or `LIGHTHOUSE_PROFILES` to change the run. Its scores are lab measurements on your machine. `test:loading` delays API responses to check the loading state.

CI runs the dependency audit, TypeScript check, production build, deterministic node-readiness tests and HTTP security checks. Browser suites need Chrome and live upstream APIs; WebSocket and node-health assertions need synced Ink nodes. Run those suites against the release build before deployment.

## API surface

- `GET /api/health` — service and WebSocket health
- `GET /api/live/status` — current stream state
- `WS /api/live` — `ink-observer.live.v1` welcome, network and block frames
- `GET /api/overview` and `/api/network` — composed overview and local node status
- `GET /api/explorer/*` — allow-listed Blockscout-compatible reads
- `GET /api/stats/*` — read-only statistics reads
- `GET /api/contract-info/pools[/:address[/check]]` — pool list/detail/cross-link data
- `GET /api/media?url=…` — validated same-origin NFT/token image cache
- `POST /api/contract-rpc` — restricted `eth_call`, `eth_estimateGas`, chain/head/code/receipt reads; signing and broadcast remain in the user's wallet

## Testnet and contract interaction

The network selector opens `/testnet/` for Ink Sepolia. The main server proxies this prefix to an isolated worker at `127.0.0.1:4190`; the worker uses Sepolia Blockscout, statistics and contract metadata. Its local node ports are 8645 (execution) and 9645 (rollup). Mainnet remains on 8545/9545. The PM2 ecosystem file starts both explorer workers. Use `pm2 startOrReload ecosystem.config.cjs --update-env`; avoid importing an unrelated shell's `PORT` through a bare `pm2 restart --update-env`.

All testnet API and WebSocket paths carry the `/testnet` prefix. Network changes reload the page to discard state from the previous chain. Indexed history remains usable during node sync; network health and live blocks only represent the local node. Contract reads explicitly identify the public RPC fallback when the local node is not ready. The server never forwards signing, admin or transaction-broadcast methods.

On a contract address, open **Read contract** or **Write contract**. Select its ABI, an indexed proxy implementation, or paste a custom JSON ABI. Proxy calls target the proxy address. Writes require a browser wallet, a successful simulation and confirmation inside that wallet. Large integers in JSON arrays must be quoted; payable amounts use ETH and other integer arguments use raw base units. WalletConnect QR and native source-verification submission are not implemented.

`npm run test:contracts` starts an isolated Anvil chain and explorer on ports 18546, 18547 and 4192, compiles the Solidity fixtures and verifies actual EVM state changes through the browser workflow. It never submits to public mainnet/testnet. It requires the development dependencies and Chrome. `npm run test:networks` audits both real networks with Chromium, Firefox and WebKit; install engines with `npx playwright install firefox webkit` and their OS dependencies. If your host needs a custom library path for those browsers, set `INK_BROWSER_LIBS`.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for source boundaries and security decisions.
See [docs/API.md](docs/API.md) for endpoint shapes, errors and the WebSocket protocol.
Use [docs/FORKING.md](docs/FORKING.md) to deploy the explorer elsewhere or adapt it to another chain.

## Project policy

Want to help? Start with [the contributor guide](CONTRIBUTING.md). Documentation fixes, translations, accessibility improvements and reproducible bug reports are welcome; local Ink nodes are optional. Check issues labelled `good first issue` or `help wanted` when available. Use GitHub Discussions for questions and early ideas, and an issue for a specific change. Contributors follow the [Code of Conduct](CODE_OF_CONDUCT.md). Report vulnerabilities as described in [SECURITY.md](SECURITY.md), without posting exploit details publicly.

Ink Explorer is not affiliated with or endorsed by Ink, Kraken, Blockscout, GeckoTerminal or any listed protocol. “Ink” and third-party marks belong to their respective owners.

See [third-party notices](THIRD_PARTY_NOTICES.md) for the Ink mark, bundled fonts and external data sources.

Licensed under the [MIT License](LICENSE).
