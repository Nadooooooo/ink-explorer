# Release test protocol

A release requires functional completeness, correct chain data, usable rendering,
and a reproducible test report. A successful production build alone is not a
release acceptance test. Never treat an upstream outage, a timed-out test or an
unavailable browser as a passing check.

## Run the complete campaign

Build and run a separate review instance with its own HTTP ports and cache
folders. Keep the production checkout and service unchanged. Start both Mainnet
and Sepolia workers, with `INK_TESTNET_PORT` pointing to the review Sepolia port.
Install the Playwright Firefox and WebKit engines and their system libraries.

```bash
BASE_URL=http://127.0.0.1:4298 npm run test:release
```

For a fresh local copy, exclude production build/cache folders and environment
files. Install dependencies and build **inside that copy**. For example:

```bash
SOURCE_WORKDIR=$(pwd)
REVIEW_WORKDIR=$(mktemp -d /tmp/ink-explorer-review.XXXXXX)
rsync -a --exclude=.git --exclude=node_modules --exclude=dist --exclude=data \
  --exclude=reports --exclude=screenshots --exclude='.env*' \
  "$SOURCE_WORKDIR/" "$REVIEW_WORKDIR/"
cd "$REVIEW_WORKDIR"
npm ci --include=dev
npx playwright install --with-deps chromium firefox webkit
npm run build
```

Run these workers from the review directory in two terminals:

```bash
PORT=4298 INK_NETWORK=mainnet INK_TESTNET_PORT=4299 node server/server.mjs
PORT=4299 INK_NETWORK=sepolia node server/server.mjs
```

Then execute the campaign from that same directory in a third terminal. The
local Sepolia execution/rollup RPCs must be available for `node-testnet`; override
`INK_RPC`, `INK_OP_NODE_RPC`, `INK_PUBLIC_RPC` and `INK_METRICS_URL` explicitly if
the standard local ports are different. Do not supply public signing keys.
The default cache paths are relative to the review copy, isolated from production.

The runner executes every suite sequentially, records each command's exit code,
timeout and log, and continues after failures. It runs mobile and chart checks
in Chromium, Firefox and WebKit. Reports go to `reports/release-*/results.json`.
`RELEASE_DIR` selects a stable destination. Source hashes identify the tested
version; changed source invalidates certification. The runner also compares the
served entry JavaScript/CSS against the build, so testing a stale server cannot
certify the new source. Process groups clean up
browser and EVM children after each suite.

`RELEASE_SUITES` can select named suites during diagnosis. Any selection or
coverage filter makes that report **not certified**, even if all selected suites
pass. Run the complete campaign on the final source after fixing failures.

## Acceptance gates and evidence

| Requirement | Evidence | Gate |
| --- | --- | --- |
| Type safety and production packaging | `check`, `build` logs | Both exit 0 |
| Dependency integrity | `dependencies` audit | No high or critical advisory |
| Pending, included, successful and reverted transactions | `data`, `integrity`, real EVM `contracts` | Distinct states; no success claim based only on inclusion |
| Finality | `data`, `integrity`, `network-live`, `node-testnet` | Safe/finalized only from a ready node on the expected chain; compare finalized hash with public reference |
| Execution and L1 fees | `data`, `integrity` | Exact wei arithmetic; missing/estimated fees remain unknown |
| Complete block and transaction activity | `integrity`, `ui` | Follow cursor to last page; retain loaded records and allow retry after failure |
| Activity filters and ledger CSV | `activity`, `activity-server`, `activity-live` | All three engines × two networks × four widths including touch landscape; exact decimal bounds, timezone, URL/cursor preservation, safe CSV, outage/retry/race handling and real upstream semantics |
| Contract read/write/proxy/custom ABI | `contracts` | Actual Anvil state changes, simulation, wallet rejection, account/chain invalidation and receipt handling |
| RPC/HTTP boundaries | `security`, `node-readiness`, `contracts` | Disallow signing/broadcast/admin RPC, cross-origin misuse, traversal and private media targets |
| Mainnet/Sepolia separation | `networks`, `network-live` | Correct chain in every frame; no Mainnet request from Sepolia; no stale local data disguised as current |
| Search, lists, entity pages, pools, NFTs, bridge and AA | `ui`, `content`, `assets`, `identicons` | Every route loads real records, links work, values and attribution remain valid |
| All chart interactions and error states | `charts` | Independent ranges, pointer/touch/keyboard inspection, empty/failure/retry/race cases; delayed/failing blocks never block analytics histories or CSV |
| Localization and Arabic direction | `i18n`, `layout`, `networks` | Ten locales, persistence, RTL and no clipped controls |
| Keyboard and assistive technology | `a11y`, `mobile`, `responsive`, `networks` | No serious/critical Axe issue; menu focus, Escape, visible input and reachable sections |
| Layout and style | `layout`, `responsive`, `mobile`, `style`, `space`, `readability` | No page overflow, overlap or clipped text at tested widths/breakpoints; address activity visible by default, readable identity/values and conditional contract details on both networks |
| Loading and performance | `loading`, `performance`, `lighthouse` | Loading regressions absent; LCP <= 2.5 s, CLS <= 0.1, DCL <= 1.5 s under performance suite |
| Address connection failures | `data`, `address-loading` | Stalled headers/body expire; pasted address recovers by retry; invalid HTML/null/different-address responses fail visibly; navigation cannot overwrite a new profile |
| Upstream snapshot lifetime | `upstream-cache`, `activity-server` | Preserve original fetch time across outages; reject expired snapshots and permanent upstream errors; retain query semantics and public JSON shapes under concurrent reads |
| Explorer/node reconciliation | `chain-reconciliation`, `node-testnet` | Same-height block hash, parent, timestamp, gas, complete transaction set, receipt status/fees, exact displayed address balance at the indexed update height and canonical block hash, retained index balance and explicit node provenance, finalized public hash and current L1 derivation |
| SEO and shareability | `security`, `ui`, `content`, Lighthouse reports | Crawlable route metadata, canonicals, multilingual sitemap, proper missing-page status |
| Reproducibility | Release report and logs | All suites pass, no filters/timeouts, source unchanged |

Lighthouse must produce all 12 reports (six routes, mobile and desktop), with
performance >= 90 and accessibility, best practices and SEO >= 95. The runner
enforces these thresholds. Lab scores still need review of individual findings.
Manual
visual inspection supplements geometry and Axe checks, especially for long
addresses, decoded logs, right-to-left text, tooltips and reduced-height forms.
No test proves an absolute absence of bugs.

## Controlled failures

`test:integrity` runs deterministic API fixtures in the real production interface
at 320, 390 and 1440 px. It checks pending transactions with null timestamps, blocks
without node evidence, decoded/raw event data, cursor pages, upstream page
failure and retry, initial section errors with local retry, visible before/after balances and structured NFT changes, late responses after changing tabs and malformed URL escapes.
`test:data` covers exact fee arithmetic and ready/unready/wrong-chain finality.
`test:activity-server` uses a disposable server and upstream to verify that an
old disk cache cannot hide a filtered-query outage. `test:activity-live` verifies
normalized decimal amount bounds and cursor pages against both public indexes.
These tests complement public API tests; they must not replace live-network
coverage.

Contract integration uses an isolated Anvil chain and disposable accounts. It
must never submit a transaction to public Ink networks. Review and browsing use
read-only public APIs. No publication or deployment is part of this protocol.

## Functional comparison

Use the chain explorer reference, not protocol-specific dashboards, for core
parity. Nado and Tydro are useful references for navigation, charts and operating
quality; their exchange/lending features do not map directly to a chain explorer.

Official feature references checked during the review:

- [Blockscout explorer coverage](https://github.com/blockscout/blockscout)
- [Blockscout advanced filters and CSV](https://www.blog.blockscout.com/how-to-use-advanced-filters-on-blockscout/)
- [Blockscout watch list](https://blockscout.mintlify.app/using-blockscout/my-account/watchlist)
- [Etherscan explorer overview](https://info.etherscan.com/what-is-a-block-explorer/)
- [Etherscan read/write contract](https://info.etherscan.com/how-to-use-read-or-write-contract-features-on-etherscan/)
- [Etherscan source verification](https://info.etherscan.com/how-to-verify-contracts/)
- [Etherscan token approvals](https://info.etherscan.com/tokenapprovals)
- [Blockscout API transaction mapping](https://github.com/blockscout/blockscout/blob/master/apps/block_scout_web/lib/block_scout_web/views/api/v2/transaction_view.ex)

The final comparison must explicitly identify missing features. WalletConnect,
native source-verification submission, watchlists/notifications and a dedicated approvals tool are not established merely by having
contract reads, source display or analytics CSV. Keep the release objective open
until the relevant parity gaps and every failed acceptance gate are resolved.

The live explorer/node comparison retries an identical read at most twice after
a gateway error explicitly identified as transient (429, 502, 503, 504, network
fetch failure or deadline). Every unsuccessful HTTP attempt is retained in
`reports/chain-reconciliation/request-failures.json` and the successful comparison
report. Permanent index errors, malformed successful JSON, exhausted retries,
missing records and equality failures still fail the suite. Acceptance requires
all actual blocks, balances, receipts and finalized hashes to match; an outage
without recovery never passes. The overall 180-second suite deadline remains.
