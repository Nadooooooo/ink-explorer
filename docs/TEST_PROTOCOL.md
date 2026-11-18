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
  --exclude=runtime --exclude=.wrangler --exclude='.dev.vars*' \
  --exclude='*.pem' --exclude='*.key' \
  "$SOURCE_WORKDIR/" "$REVIEW_WORKDIR/"
cd "$REVIEW_WORKDIR"
npm ci --include=dev
npm exec -- playwright install --with-deps chromium firefox webkit
npm run build
```

Run these workers from the review directory in two terminals:

```bash
HOST=127.0.0.1 PORT=4298 INK_NETWORK=mainnet INK_TESTNET_PORT=4299 node server/server.mjs
HOST=127.0.0.1 PORT=4299 INK_NETWORK=sepolia node server/server.mjs
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
served entry JavaScript/CSS against the build and verifies that both advertised
live socket URLs use the review origin. A copied environment pointing at an old
port cannot certify the new source. Process groups clean up
browser and EVM children after each suite.

`RELEASE_SUITES` can select named suites during diagnosis. Any selection or
coverage filter makes that report **not certified**, even if all selected suites
pass. Run the complete campaign on the final source after fixing failures.

For an optional Workerd replay of record-arrival responses, install the
diagnostic tools in a temporary directory. This starts a loopback fixture
server and checks the Worker against deterministic responses.

```bash
WORKERD_TOOLS=$(mktemp -d)
npm install --prefix "$WORKERD_TOOLS" --no-save miniflare@5.20261006.1-alpha esbuild@0.25.4
RECORD_WORKERD_TOOLS="$WORKERD_TOOLS" node scripts/record-workerd-test.mjs
```

Set `BLOCK_INDEXING_FAILURE_EVIDENCE` to a local copy of a historical failure
report when its digest needs to be recorded with the block-indexing browser
replay. The test cases run independently of that report.

## Acceptance gates and evidence

After an authorized deployment, run the read-only public checks from the exact
built candidate, not from an older production checkout:

```bash
BASE_URL=https://your-explorer.example npm run test:post-deploy
BASE_URL=https://your-explorer.example npm run test:networks
```

`test:post-deploy` verifies the deployed entry asset names and SHA-256 hashes,
raw document metadata on both networks, locales, 404s, robots/sitemaps and live
node readiness. It asserts that QR configuration is absent for the current scope.
Use `EXPECTED_DIST` only to select the actual candidate build, and `PUBLIC_URL`
when its canonical origin differs from the test URL. Results explicitly state
that no physical device was tested. Run outside the operator's VPN as well;
an on-machine public-URL check alone cannot establish external reachability.
The [physical mobile checklist](MOBILE_REVIEW.md#physical-device-acceptance--pending-10-october-2026)
requires separate iOS/Android observations.

Device-profile simulations have their own acceptance criteria. The
[local simulation record](MOBILE_REVIEW.md#additional-local-simulations--10-october-2026)
describes the four device profiles, compiled-function preview, controlled failures
and OS/TLS limitations. A passing simulation is not evidence that a physical
device or a newly deployed public candidate was tested. Leave QR disabled and
do not publish without authorization.

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
| Upstream snapshot lifetime | `upstream-cache`, `data-freshness`, `activity-server` | Preserve original fetch time through caches/proxies; reject future/expired snapshots and permanent upstream errors; display a dated fallback notice without conflating index and node health; recover by retry without navigation leaks |
| Exact displayed amounts | `data`, `assets`, `integrity` | Nonzero fees and token balances never round to apparent zero; huge integers stay exact; unknown decimals retain base units without a fiat valuation |
| Wallet discovery | `wallet-discovery`, `wallet-discovery-browser` | Multiple/late EIP-6963 providers, explicit choice, rejection, switching, keyboard and chain isolation |
| Explorer/node reconciliation | `chain-reconciliation`, `node-testnet` | Same-height block hash, parent, timestamp, gas, complete transaction set, receipt status/fees, exact displayed address balance at the indexed update height and canonical block hash, retained index balance and explicit node provenance, finalized public hash and current L1 derivation |
| SEO and shareability | `security`, `ui`, `content`, Lighthouse reports | Crawlable route metadata, canonicals, multilingual sitemap, proper missing-page status |
| Native approvals | `approvals` | ERC-20/ERC-721/ERC-1155, exact integers, state reads, saturated history, wallet guards, confirmed EVM revocations and readable mobile cards |
| Public data access | `public-proxy` and deployment probes | Same-origin API on both networks, errors/binary media and public Internet routing evidence without tailnet authorization |
| Reproducibility | Release report and logs | All suites pass, no filters/timeouts, source unchanged |

Lighthouse must produce all 24 reports (12 routes, mobile and desktop), with
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

## Native page acceptance

`test:explorer-pages` exercises 24 page states in Chromium, Firefox and WebKit
on both networks at 320 px (Arabic RTL), 390 px (French) and 1440 px (English).
It checks severe accessibility violations, overflow, runtime failures, absence
of official-explorer destinations, correct supply percentages and raw amounts,
cursor ranks/recovery, scoped ERC-4337 logs, raw trace objects, reverted movements,
independent NFT history errors, source consent and build-info extraction,
statistics data/ranges and locally intercepted tag submissions.

`test:explorer-services` uses disposable HTTP services, Phoenix socket fixtures
and temporary label stores. It checks all supported compiler payloads,
asynchronous outcomes, rejection boundaries, contact isolation, moderation and
concurrent approvals. It must never publish real sources or labels. These two
gates originally brought the release campaign to 36 suites. The approvals and
public-proxy gates brought the campaign to 38 suites. The 41-suite campaign added data-freshness and both native wallet-discovery gates.
The current campaign adds platform resilience, native navigation, shared SEO/Worker,
SEO browser, search unit, search browser, pool identity and pool detail gates, for 49 suites. The document-lifecycle gate brought this to 50 suites; block-indexing data, server and browser gates bring the current campaign to 53 suites. Lighthouse audits 12 route
families in mobile and desktop profiles (24 reports), including the new native
accounts, batches, gas, statistics, Dapps and verification pages.

Actual official pages, tabs, menus and public API responses are compared
separately. Browser fixtures demonstrate behavior; they are not evidence that
chain data matches the node. Preserve the live comparison and its failures.

## Recorded test-harness correction

The 3 October 2026 native-page campaign completed all 36 gates with unchanged
source and matching served assets. Its original report remains NOT CERTIFIED:
35 gates passed, while the loading test failed because it matched full URLs
without allowing the new stats query string. Only that harness was corrected
to match request pathnames and wait for the actual request before asserting.
The corrected loading suite passed against the unchanged application and build.
Separate combined evidence records those 36 validated checks, the sole harness
difference and all 24 passing Lighthouse reports; it does not relabel or replace
the original campaign result. Future complete runs use the corrected harness.

WalletConnect deployment acceptance additionally requires the actual Reown project/domain configuration and a real relay pairing QR/session. An explicit configuration error or mocked pairing is not proof of a working mobile connection. Preserve that limitation until verified.

## 16 October 2026 quality corrections

The 49-suite runner now fingerprints Cloudflare sources and configuration alongside
the frontend, server and tests. Platform tests cover denied browser storage,
language restoration through browser history, and successful/failed clipboard paths
in three engines. Navigation tests require real anchors, network and locale
preservation, ordinary SPA navigation, new tabs and keyboard focus. Search tests
cover block-versus-transaction hash resolution, retained query text, complete cursor
pagination, failures, retry and cancellation on both chains. SEO checks require
HTTP/client route agreement, current robots/structured data during navigation,
canonical origin preservation and non-indexable previews.

The public API remains non-indexable through its HTTP headers, while robots.txt
allows fetching JSON and media needed to render the explorer. These changes do
not establish search-engine indexing, a ranking or physical-device acceptance.

## Browser document restoration

`test:lifecycle` verifies suspension and restoration of the live transports in
Chromium, Firefox and WebKit on both networks. Configuration, established sockets,
retry timers and HTTP snapshots must stop on pagehide; resuming must use one new
connection and reject obsolete replies. An open socket without a valid frame must
not announce live data. A separate navigation with real transports requires
`pageshow.persisted` and the same document identity in Chrome; simulated events
alone cannot certify bfcache restoration. Browser automation must explicitly allow
bfcache for this check.

The restored view retains input and filter state. A localized notice distinguishes
retained page data from a freshly read page and offers an explicit refresh. Prepared
contract transactions and revocations must be re-simulated after restoration; wallet
state, already submitted transaction hashes and receipt tracking are preserved.
The contract and approvals suites cover the pending-RPC and pending-wallet races.
This is browser lifecycle evidence, not physical mobile-device acceptance.

## Live blocks before index catch-up

A public navigation check on 16 October exposed a genuine race: the live node
announced a block before the public index could serve its details and transactions.
The same block returned upstream HTTP 404 initially and HTTP 200 about forty
seconds later, while the original page remained in an error state. The failed
public campaign is preserved under the lifecycle release evidence.

`test:block-indexing-server` requires positive local node evidence before returning
a non-cacheable HTTP 202 indexing response. Wrong-chain, unready, stale, unknown
and old blocks cannot be relabelled as indexing. Actual gateway failures remain
errors. `test:block-indexing-data` checks response identity and status validation.
`test:block-indexing-browser` exercises independent block/transaction recovery,
bounded automatic retries, manual retry, cancellation and rendering on both chains
and three browser engines. Missing transactions cannot be presented as an empty
block; partial data cannot imply successful execution or fees.

Native navigation continues to click the newest visible block. It records the
exact destination and HTTP statuses and allows the documented 90-second indexing
window plus a ten-second assertion margin. Changing the test to select an older
block would conceal the original defect and is not acceptable.

Indexing status is opt-in through
`Accept: application/vnd.ink.indexing+json, application/json`. Older open tabs
and API clients continue to receive the original error contract. Server and
edge-proxy tests require exact negotiation, unchanged legacy responses and no
unnecessary node proof for clients that did not opt in.

The locale gate inspects actual Chromium glyph rendering on translated Hindi
and Bengali homepage text with CDP. Bundled Noto fonts must draw the script
glyphs without a system fallback; CSS declarations alone are insufficient.
Font licenses are static public assets and are covered by Worker tests. The
release fingerprint now includes all public static sources as well as code.


## Historical test-only qualification supplement

For the earlier release, `release-head-final/results.json` remains failed (52/53), because
the style assertion predated the intentional language-picker font scope. The
separate `release-head-qualified/acceptance.json` accepts the 52 unchanged suite
results plus a complete, unfiltered rerun of the corrected style test. It requires
an unchanged product/distribution, exactly one reviewed test-file change, the
original failed evidence, full 155-case coverage, screenshot hashes and three
negative controls. The shared read-only validator rechecks this evidence before
promotion, public verification and archiving. This supplement is not a passing
original full run, and is not applicable to product changes or unrelated failures.
The eight public suites and deployment identity checks are independently required.

## Current server delivery — 9 November 2026

Use [the current delivery review](DELIVERY_2026-11-09.md) for source identity,
current-interface coverage and server activation gates. Older successful reports
below describe their own snapshots and do not certify a new candidate.

`test:data-freshness` now exercises current page-data notices and pool-observation
lifetimes. `test:activity` includes parent-transaction filter journeys, modal focus
and touch interactions. `test:address-loading` also runs canonical live-balance
checks. Preserve index fallback timestamps where fallback is allowed; current
prices and head balances must expire instead of appearing fresh.

WalletConnect QR was disabled for this release campaign. Real-device
observations remain a distinct acceptance step.


## HTTP transfer parity for the November delivery

The public Cloudflare path compresses API JSON. Direct loopback workers do not.
A direct-worker Lighthouse diagnostic therefore measured a different transfer
path: mobile scores81–88 versus94–97 for the same routes on public HTTPS.
Those failed reports are retained; thresholds are unchanged.

For the final local campaign, run `scripts/review-http-proxy.mjs` on loopback4488
with `REVIEW_UPSTREAM=http://127.0.0.1:4480`, behind which Mainnet4480 proxies
Sepolia4481. Both workers use `PUBLIC_URL` and `EXPLORER_BROWSER_ORIGIN` equal
to `http://127.0.0.1:4488`; Mainnet uses `INK_TESTNET_PORT=4481`. Set the release
`BASE_URL` to that same origin. The proxy applies normal negotiated HTTP gzip;
it preserves exact response data, freshness headers, status codes and native
WebSocket traffic. Its regression test is part of `test:public-proxy`. It does
not simulate production TLS, Cloudflare policy or internet reachability; those
are checked against the real public deployment afterward.

The former runner contained54 named suites. Adding the existing independent
startup-failure/reload recovery browser gate makes the final count55. Restricted
startup engines/modes cannot certify a release. The final candidate gives a verified WebSocket welcome a bounded one-second
window before the initial HTTP fallback. A stalled configuration, silent or
invalid socket still reaches HTTP; hidden-page cleanup cancels the pending
timer. Lifecycle checks require no duplicate initial HTTP snapshot on healthy
sockets, and retain stalled-configuration/invalid-frame fallback coverage.
Static entry dependencies are grouped into one request while route and wallet
modules remain deferred; modulepreloads remain disabled for WebKit recovery.

The API worker also serves an independent fallback document rather than the
published build snapshots. Functional fault-injection suites deliberately use
that isolated shell. Lighthouse must use the published renderer: start
`scripts/review-renderer.mjs` on4491 with
`REVIEW_RENDERER_ORIGIN=http://127.0.0.1:4490` and the same loopback API4480,
then another `review-http-proxy.mjs` on4490 with upstream4491. Configure
`LIGHTHOUSE_BASE_URL=http://127.0.0.1:4490` for the full release runner.
The build gate requires the actual prerendered home, matching entry-asset bytes
and both advertised socket origins on this performance target. Every24
Lighthouse route/profile pair runs against that renderer with the original
thresholds. Public HTTPS performance is verified again after activation.


The final review also found two focus races. An address profile response replaced
the loading header and discarded a focused copy control or selected manual-copy
field. The header now keeps the same DOM control through profile success and
failure. Thirty-six controlled transitions cover all three clipboard paths,
both networks and all three engines. The mobile drawer also completes its
section focus transfer before paint, preventing a later animation-frame callback
from overriding a user-selected link. Navigation checks retain link focus across
subsequent frames before keyboard activation.


A real public-path check found that allowed contract RPC POSTs returned502
although both API workers answered200 directly. The published renderer forwards
a Request body stream under Node; it now supplies the required streaming duplex
option. A native HTTP integration test verifies exact request bodies, origin
forwarding and private-header removal. Staging and public delivery checks now
require successful `eth_chainId` and WETH `name()` reads on both networks.
They use the application's actual `{method, params}` adapter contract and check
the result, source and chain metadata. No signature or broadcast is involved.
The API application code is preserved. A disposable actual-renderer preflight
passed692 checks:500 documents,176 active assets, both live streams, hosting
boundaries and all four successful POST reads. This preflight did not activate
a new production version.


## November fixture qualification

The 9 November campaign executes all55 suites on unchanged source. If only a
reviewed fixture needs correction, preserve the failed full report and rerun the
entire affected suite without coverage filters. Record original and new script
hashes, every command exit code, complete case counts and source hashes before
and after each rerun. Product, build inputs and distribution must remain the
same. A separate qualification must identify the original failure; never replace
it with a clean-full-run claim. Any product change or unrelated failure requires
new validation appropriate to that change.

The current page matrix now supplies valid, chain-scoped live configuration and
welcome frames. Transport failures remain covered independently by the lifecycle
gate. Independent mobile cold-page measurements use their own page; stateful
navigation journeys remain in scope. Both changes avoid a reproduced
[WebKit cancellation classification](https://github.com/microsoft/playwright/issues/43120)
during document replacement. A minimal same-origin fixture reproduced the same
browser pageerror despite handled fetch rejection, no window error or unhandled
rejection, and no API request reaching its server. The trace assertion also waits
for its own asynchronous result before checking the unchanged `CALL` content.
No browser-error filter or lower threshold is introduced.

The server-local delivery evidence contains `accept-release.py`, which verifies
all55 original suite outcomes, the two complete corrected reruns (432 native
page states and396 mobile page/section checks), exact product identity, the
browser diagnostic and all24 Lighthouse thresholds. The activation driver pins
that verifier's hash and rechecks the evidence before mutation. Public delivery
and physical-device observations remain separate gates.


## Device-profile simulations — November supplement

Record iPhone and Android simulation results separately from physical-device testing. Preserve the
physical-device flag as false and record which OS behaviors cannot be emulated.
The current [mobile acceptance record](MOBILE_REVIEW.md#current-simulation-acceptance--9-november-2026)
uses four named presets, both networks and20 scenarios per combination. It binds
reports, harnesses and160 accepted captures to the unchanged public version and
source hashes. Public calls remain read-only and QR remains disabled.

Axe scans an opened drawer after finite CSS entrance animations complete. Network
recovery checks distinguish automatic online recovery from a separately controlled
manual retry. Preserve all failed reports and source-bound rerun provenance;
never rewrite an original report as passed or require tapping a button that the
application correctly removed after automatic recovery. Product changes require
appropriate regression validation; a test-only correction must identify exactly
which scenario changed and rerun that scenario across the full device/network
matrix while preserving the other scenario bodies and evidence.
