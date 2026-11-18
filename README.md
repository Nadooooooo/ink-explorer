# Ink Explorer

Ink Explorer is an independent, open source explorer for Ink Mainnet and Ink Sepolia. Look up blocks, transactions, addresses, contracts, tokens and NFTs. The explorer combines indexed history with independent live checks from local Ink nodes when available.

Choose a network to start exploring, or use the guide on the home page to learn how to read a block, transaction or address. [Ink Mainnet](https://inkexplorer.xyz/) · [Ink Sepolia](https://inkexplorer.xyz/testnet/) · [Explorer guide](https://inkexplorer.xyz/#home-guide-title)

## Quick start

Use Node.js 24 for the validated setup. Node.js 22 is supported from 22.19 onward. Install the development dependencies and the Chromium version managed by Playwright before building.

```bash
npm ci --include=dev
npm exec -- playwright install chromium
npm run build
HOST=127.0.0.1 npm start
```

Open `http://127.0.0.1:4188`. On Linux, use `npm exec -- playwright install --with-deps chromium` at the browser installation step if Chromium needs system libraries. Some browser tests and Lighthouse use Google Chrome at `/usr/bin/google-chrome`. [Test requirements](docs/TEST_PROTOCOL.md)

The build generates the browser language catalogues and prerenders localized page shells. The server reads `.env` if the file exists. Use the checked-in examples to configure a second worker for Sepolia, a public HTTPS origin or optional OP-Reth and OP Node endpoints. Public indexers provide historical data by default. [Configuration and Sepolia setup](docs/FORKING.md)

## What you can explore

- Browse blocks, transactions, transfers, logs, traces and address activity with cursor pagination.
- Inspect token holders, NFTs, DEX pools, proxy implementations, verified source and contract ABIs.
- Follow OP Stack bridge activity, ERC-4337 user operations and statistics. Export the displayed data as CSV.
- Search the Ink Ecosystem catalogue by name or category and open an application's website for the selected network. [Mainnet apps](https://inkexplorer.xyz/apps) · [Sepolia apps](https://inkexplorer.xyz/testnet/apps)
- Read and simulate contract calls. Transaction signing and broadcast happen in the user's wallet.
- Use ten interface languages, including an Arabic right-to-left layout. Share pages with route-specific metadata and canonical links.

Market figures are third-party estimates. The network panel identifies local node observations, and the UI shows the age of fallback index data.

## Develop and validate

Run `npm test` for TypeScript checks, deterministic data tests and the production build. Run the suites relevant to your change against a local instance. The full release campaign also uses browser engines, real network data and local nodes. [Contributor guide](CONTRIBUTING.md) · [Release test protocol](docs/TEST_PROTOCOL.md)

See the source map for routing, layouts, translations, API and WebSocket behavior. [Documentation index](docs/README.md) · [Architecture](docs/ARCHITECTURE.md) · [API reference](docs/API.md)

Use the security policy for vulnerability reports and read the code of conduct before contributing. [Security policy](SECURITY.md) · [Code of conduct](CODE_OF_CONDUCT.md)

The code is available under the MIT License. The Ink mark and bundled fonts have their own notices. [MIT License](LICENSE) · [Third-party notices](THIRD_PARTY_NOTICES.md)
