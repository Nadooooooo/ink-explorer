# Architecture

Ink Explorer serves a React interface with a Node HTTP and WebSocket API. The same release can run as a single Node application or use a separate document renderer and API gateway. Mainnet and Sepolia use separate chain workers.

## Find your way through the source

| Area | Source |
| --- | --- |
| Browser entry and route dispatch | [main.tsx](../src/main.tsx), [App.tsx](../src/App.tsx), [page-seo.ts](../src/page-seo.ts) |
| Menus, anchors and internal navigation | [Navigation.tsx](../src/Navigation.tsx), [ExplorerLink.tsx](../src/ExplorerLink.tsx), [network.ts](../src/network.ts) |
| Ledger pages and less common routes | [LedgerPages.tsx](../src/LedgerPages.tsx), [ExplorerPages.tsx](../src/ExplorerPages.tsx) |
| Application catalogue and charts | [InkEcosystem.tsx](../src/InkEcosystem.tsx), [Apps.tsx](../src/Apps.tsx), [Statistics.tsx](../src/Statistics.tsx) |
| Filters, precise amounts and CSV | [FilteredActivity.tsx](../src/FilteredActivity.tsx), [activity-data.ts](../src/activity-data.ts) |
| HTTP requests, cancellation and cache notices | [api-request.ts](../src/api-request.ts), [server.mjs](../server/server.mjs) |
| Node readiness and canonically observed blocks | [node-readiness.mjs](../server/node-readiness.mjs), [canonical-feed.mjs](../server/canonical-feed.mjs) |
| Wallet operations and approved RPC methods | [ContractInteraction.tsx](../src/ContractInteraction.tsx), [contract-abi.ts](../src/contract-abi.ts), [contract-rpc.mjs](../server/contract-rpc.mjs) |

Start a small change in the module that owns the behavior. Put a substantial new page family in a focused module and wire it into route dispatch. For tests, find the nearest suite by its command in [package.json](../package.json).

## Data and network flow

The browser derives its chain from the path. Mainnet uses unprefixed URLs and Sepolia uses `/testnet/`. Internal links, HTTP requests and WebSockets carry the same network prefix. A network change reloads the page so in-memory state from the previous chain cannot carry across. In a local installation the main server forwards the Sepolia prefix to a loopback worker. [Browser network selection](../src/network.ts) · [Sepolia proxy](../server/testnet-proxy.mjs)

1. The browser fetches indexed data from `/api/` on the page's origin. For separated hosting, the frontend can use the public build option `VITE_PUBLIC_API_ORIGIN`.
2. The chain worker reads the configured upstream, validates responses and returns data plus freshness headers. Eligible outages can reuse a verified disk response for up to 24 hours, with its original timestamp. Advanced filtered queries preserve their own bounded retry and cache rules.
3. The browser discovers the live WebSocket from `/api/live/config`. It uses HTTP snapshots when the socket is unavailable. Pending indexing and degraded local node observations remain explicit. [Endpoint and transport contracts](API.md)

| Source | Responsibility |
| --- | --- |
| Blockscout v2 | Indexed blocks, transactions, addresses, tokens and activity |
| Blockscout Stats Service | Counters and time series |
| Blockscout Contract Info | DEX pools and market figures |
| OP-Reth and OP Node | Independent local head, safe/finalized progress and local health |
| Ink public RPC | Supported read and simulation fallback, identified as public in responses |

Each worker has independent memory and live state. Upstream disk cache keys hash the complete upstream URL, including the network-specific origin or chain ID. Media blobs are keyed by the exact media URL. The cache budget is enforced by background pruning. Cached data and generated media are disposable. [Worker implementation](../server/server.mjs) · [Media cache](../server/media-cache.mjs)

## Application catalogue

`/apps` lists the applications in the [official Ink directory](https://inkonchain.com/apps) and `/testnet/apps` shows the entries available on Ink Sepolia. [Catalogue data](../src/ink-ecosystem.json) contains original summaries and the published categories, tags and links from the [official source snapshot](https://github.com/inkfoundation/ink-web-app/blob/fe4972f1c71176df76b44a480e46724df64790a5/src/app/%5Blocale%5D/apps/_components/apps-data.json). [French summaries](../src/ink-ecosystem-fr.json) are keyed by application ID. Logos load from their published URLs with an initial as fallback. The catalogue is available even when Blockscout is offline. Existing marketplace detail URLs and `/api/dapps` continue to use Blockscout.

After reviewing and updating the catalogue, run `node scripts/generate-ecosystem-index.mjs` to refresh the compact route index and `npm run build` to update the directory and application pages. The build captures each detail from the open React directory and stores its navigation once per language and network. Node, Vercel and Cloudflare compose each document from that navigation and the requested application. The name, summary, website and catalogue link work before JavaScript loads. [Browser journeys](../scripts/apps-direct-browser-test.mjs) · [Document tests](../scripts/page-prerender-test.mjs)

## Documents and SEO

The build captures localized page shells and record templates in `dist/snapshots/`. These templates have no captured chain observations. The browser renders indexed and live state after startup. Document adapters can fill record shells using bounded observations for the requested network. [Snapshot selection](../server/page-snapshots.mjs) · [Record arrival](../server/record-arrival.mjs)

The route parser and metadata definitions are shared between the browser and document renderers. The server returns the title, canonical, language alternatives, social metadata and structured data before JavaScript runs. It handles unknown routes with HTTP 404 and emits network-specific sitemaps. Update the shared definition and verify both a direct request and browser navigation when changing a route. [Route parser](../src/page-seo.ts) · [Metadata](../src/page-metadata.ts) · [Document renderer](../server/page-document.mjs)

The local Node server serves pages and the API in one process per chain. A split installation can render public pages through the Node site server, a Vercel function or the Cloudflare Worker. The hosting adapter forwards public API and WebSocket traffic to the chain servers. [Node site](../server/public-site.mjs) · [Vercel page function](../api/page.mjs) · [Cloudflare Worker](../cloudflare/worker.mjs)

## Translations and styles

The entry catalogue combines English source labels, locale dictionaries and feature copy. The locale generator resolves them into JSON under `src/locales/`. The browser starts with English and loads the selected locale on demand. Edit the source dictionaries and run the generator when changing translations. [Catalogue](../src/i18n.ts) · [Generator](../scripts/generate-locales.mjs) · [Browser loader](../src/i18n-browser.ts)

The entry file imports shared tokens, component styles and later responsive corrections in cascade order. Keep rules near the relevant component, and check the current imports before reorganizing CSS. [Stylesheet imports](../src/main.tsx) · [Design system](DESIGN_SYSTEM.md)

## Security decisions

Remote data, RPC responses and media metadata cross trust boundaries. Path allowlists, request limits and chain checks stay with the API handlers. A local node remains distinct from a public indexer. Transaction review, signing and broadcast stay in the browser wallet. Index reads, publishing verified source and submitting a public-label proposal use separate endpoints and flows. [API reference](API.md) · [Security policy](../SECURITY.md)
