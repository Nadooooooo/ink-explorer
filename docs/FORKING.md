# Configuration and forking

Start with the project quick start. Its default Mainnet setup uses public indexers and runs the web server on loopback. The Node server reads `.env` with `npm start`, and values exported by the process environment take precedence. Keep real configuration in your local environment files. [Quick start](../README.md#quick-start) · [Mainnet example](../.env.example)

## Run both networks

Keep Mainnet running on port 4188. Use a second worker for Sepolia on loopback port 4190. The main worker forwards `/testnet/` to that port, so both networks share the browser origin.

```bash
cp .env.sepolia.example .env.sepolia
INK_NETWORK=sepolia node --env-file=.env.sepolia server/server.mjs
```

For other ports, match the main worker's `INK_TESTNET_PORT` to the Sepolia worker's `PORT`. Each worker needs its own chain's upstreams and node URLs. [Sepolia example](../.env.sepolia.example)

## Choose deployment settings

| Setting | Purpose |
| --- | --- |
| `HOST`, `PORT` | HTTP bind address and port. Use loopback for local setup or a private service network behind the deployment edge. |
| `INK_NETWORK`, `INK_TESTNET_PORT` | Select `sepolia` for the second worker and link the main proxy to its port. |
| `PUBLIC_URL` | Canonical public HTTPS origin, without a path. Leave empty for the local request origin. |
| `INK_PUBLIC_API_ORIGIN` | Public gateway origin for the Vercel server function. |
| `VITE_PUBLIC_API_ORIGIN` | Optional public browser API origin set before building. The browser normally uses same-origin paths. |
| `EXPLORER_BROWSER_ORIGIN` | Exact public site origin accepted by separated API workers. |
| `INK_GATEWAY_PORT`, `INK_GATEWAY_UPSTREAM` | Loopback port and fixed worker URL for the optional standalone API gateway. |
| `INK_ORIGIN_TOKEN` | Private value checked by the gateway. Configure the site or edge proxy with the same value. |
| `INK_SITE_ORIGIN_TOKEN_FILE` | Private file containing the gateway credential for the Node site server. Defaults to `runtime/origin-token` inside its checkout. |
| `INK_SITE_GATEWAY` | Gateway used by the Node site renderer. The supplied renderer validates its fixed loopback origin, `http://127.0.0.1:4195`. |
| `INK_SITE_PUBLIC_URL`, `INK_SITE_PORT`, `INK_SITE_PREVIEW_HOSTS` | Public HTTPS origin, local site port (default 4197) and optional comma-separated preview hostnames. |
| `INK_SITE_VERSION` | Optional deployment identifier returned in `x-ink-version`. The Node site derives its default from the prepared artifact manifest. |
| `INK_ROLLING_DATA_DIR`, `ROLLING_DATA_DIR` | Set the API reader and the collector, respectively, to the same persistent directory when using rolling metrics. |
| `BLOCKSCOUT_API`, `BLOCKSCOUT_STATS_API`, `CONTRACT_INFO_API` | Network-specific sources for indexed history, statistics and pool metadata. |
| `BLOCKSCOUT_LOGS_API` | Optional network-specific logs endpoint. Defaults to `/api` on the configured Blockscout API origin. |
| `INK_RPC`, `INK_RPC_WS`, `INK_OP_NODE_RPC` | Optional local execution HTTP, execution WebSocket and OP Node endpoints. |
| `INK_PUBLIC_RPC` | Network-specific public fallback for supported reads and simulations. |
| `INK_METRICS_URL`, `INK_NODE_DATA_DIR`, `INK_L1_FAILOVER_STATUS` | Optional local metrics, disk usage path and L1 relay readiness. |
| `WALLETCONNECT_PROJECT_ID`, `VITE_WALLETCONNECT_PROJECT_ID` | Public Reown project ID for optional WalletConnect QR. Apply runtime settings to both workers or supply the build option. |

Terminate TLS at the deployment edge and keep node RPC and metrics on private interfaces. A static site needs a separate public HTTPS API gateway that can serve HTTP and WebSocket paths. The project's standalone gateway routes those paths to a fixed worker origin. Put secrets in server-only configuration. Vite variables are embedded in public browser code. [Standalone gateway](../server/public-gateway.mjs) · [API contract](API.md)

### Hosting with PM2 and Cloudflare Tunnel

The public site runs behind Cloudflare Tunnel. The supplied PM2 configuration reads the Mainnet worker settings from `.env`, the Sepolia worker settings from `.env.sepolia` and the gateway settings from `.env.gateway`. The Node site expects a gateway at `127.0.0.1:4195` and a verified `dist/release-artifacts.json`. When updating an existing release, prepare the new build against the previous build to retain the immutable assets that open tabs still request. [PM2 API and gateway configuration](../ecosystem.production.config.cjs) · [Artifact preparation and verification](../scripts/release-artifacts.mjs)

The systemd templates use `/srv/ink-explorer` for the system service and `~/ink-explorer` for the user service. For split checkouts, supply PM2 config paths through `INK_API_CONFIG`, `INK_GATEWAY_CONFIG`, `INK_ROLLING_CONFIG` and `INK_SITE_CONFIG`. The connector uses `runtime/tunnel-token` under the project by default. Set `INK_TUNNEL_TOKEN_FILE` to select another private file. [System unit](../ops/inkexplorer-public-bootstrap.service) · [User unit](../ops/inkexplorer-public-bootstrap.user.service) · [Deployment history](README.md#historical-records)

The bootstrap passes `HOME`, `PATH` and an optional `PM2_HOME` to PM2 when inspecting the daemon. Each new service also receives its own supported Ink settings. Define extra settings for a fork in the service's ecosystem `env` block or in a private file that block reads. This keeps SSH agent access, development credentials and unrelated deployment settings out of newly started services.

For a code-only restart, use the service account and target the existing process by name, for example `pm2 restart inkexplorer-site`. For a configuration change, run PM2 from the dedicated service environment and apply the intended ecosystem file to that process. PM2's `--update-env` option imports values from the invoking shell. Use an environment containing only the settings intended for the service when applying it.

An alternative Cloudflare Worker deployment uses the `API_ORIGIN` binding for the upstream and an `ORIGIN_TOKEN` secret matching the gateway's `INK_ORIGIN_TOKEN`. The historical migration utility targets `inkexplorer.xyz`. It reads the operator's `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_ZONE_ID` and requires a dedicated staging subdomain in `INK_MIGRATION_PREVIEW_HOST` when preparing a migration. The Worker deployment utility uses `wrangler` from the command path, or a JavaScript CLI file selected with `INK_WRANGLER`. [Worker configuration](../wrangler.jsonc) · [Hosting migration](../scripts/migrate-public-hosting.py) · [Worker deployment](../scripts/deploy-cloudflare.py)

### Wallet integration

An injected wallet can connect directly in its browser. To enable WalletConnect QR, configure its public project ID and authorize your site's domain in Reown. The wallet owns signing and broadcast. [Wallet and RPC flow](ARCHITECTURE.md#security-decisions)

Source verification asks the user to consent to publishing the source. Public-label proposals stay in a private queue until an operator approves their public fields. The maintainer CLI uses the chain ID as its first argument. Keep the review output on the operator's machine. [Verification and label endpoints](API.md) · [Moderation command](../scripts/moderate-tags.mjs)

## Adapt the explorer for another chain

Ink chain IDs, URLs, copy and OP Stack checks are wired into the source. Review these boundaries when changing networks.

1. Confirm that your indexer supports the required endpoint shapes. Substitute adapters for unsupported Blockscout history, statistics or pool routes. [API reference](API.md)
2. Update chain IDs, wallet settings and public RPC URLs in the browser and server network definitions. Maintain the URL prefix and process isolation if you support more than one chain. [Browser network definitions](../src/network.ts) · [Server network selection](../server/server.mjs)
3. Update route metadata, names, descriptions and translations in their shared source modules. Verify canonical and alternate-language links after the change. [Metadata](../src/page-metadata.ts) · [Translations](ARCHITECTURE.md#translations-and-styles)
4. Replace brand assets and update the asset references in HTML, the manifest and structured data. Review third-party notices before distributing a fork. [Third-party notices](../THIRD_PARTY_NOTICES.md)
5. Adapt health probes, finality and bridge views to the execution and rollup protocols in use. Preserve the source labels and show unavailable values where an independent observation cannot be verified. [Node readiness](../server/node-readiness.mjs)
6. Keep chain checks and RPC method boundaries when adapting wallet interactions. Rebuild the test fixtures for the chain IDs, addresses and expected labels you support. [Contract RPC](../server/contract-rpc.mjs) · [Release test protocol](TEST_PROTOCOL.md)
