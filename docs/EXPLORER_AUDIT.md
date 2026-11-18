# Explorer validation

## Current candidate — 10 October 2026

**The requested local simulations are complete.** The final frozen candidate,
`ink-explorer-simulation-performance-20261010`, passes **41/41 suites** from
14:41:27 to 15:29:03 UTC, without filters, timeouts or source changes. All 105
source/configuration files also match the main checkout after the campaign.

| Final evidence | Result |
| --- | --- |
| Compiled deployment preview | 24/24 HTTP checks: exact asset hashes, metadata, locales, robots/sitemaps, true 404s, both live networks and disabled QR. |
| Mobile device profiles | 120/120 scenarios: iPhone SE/iPhone 13 WebKit and Pixel 7/Galaxy S9+ Chromium, each on Mainnet and Sepolia. |
| Broader browser coverage | 432 native page states, 330 mobile page/section checks and 204 network-browser cases pass; ten-locale token descriptions identify the correct chain. |
| Performance and accessibility | Six startup-budget cases and all 24 Lighthouse audits pass. Performance is 91–100; accessibility, best practices and SEO are 100. Mobile Blocks scores 91, versus the retained failing score of 89. |
| Source and dependencies | Type checking, production build, chain reconciliation and dependency audit pass; the audit reports zero vulnerabilities. |

Three findings are corrected: native WebKit light control chrome underneath pale
network text, a Mainnet token-directory label on Sepolia, and avoidable startup
request delays. The network selector now has 12.13:1 computed text contrast;
network interpolation covers all ten locales and token/NFT metadata. The shared
hero image, regular monospace font and network-scoped block list are preloaded.
Live rows, network isolation and original performance thresholds are preserved.

The primary reports are under
`reports/release-acceptance-20261010/simulations/`: `release-performance/`,
`lighthouse-performance/`, `devices-performance/` and `http-performance-ready/`.
The source/artifact identity and cleanup checks are in `certificate.json`.
Detailed suite evidence and screenshots are copied to `suite-reports/` and
`screenshots/`. The final full report SHA-256 is
`0ae5a4243890d7c2964e5927840c4bd966d257f7f407e67e747465b755c19113`.

This is **simulation-only acceptance**, not physical iOS/Android, VoiceOver,
TalkBack, public DNS/TLS/CDN or post-publication certification. Nothing was
published, committed or enabled for QR. All original production process IDs and
the production build hash remain unchanged; both production workers were healthy
at the final read-only check. Temporary simulation processes and the private
local TLS key are removed; copied Vercel production environment files are absent.

## Findings and retained attempts — 10 October 2026

This review used a local simulation for the remaining device and deployment checks.
A WebKit iPhone-profile capture revealed pale network-selector text over native
light control chrome. Explicit dark chrome and a direction-aware arrow correct
the contrast; mobile regression checks now require an explicit background,
disabled native chrome and at least 4.5:1 text contrast. These changes required
a fresh full campaign in `simulations/release-complete/`; the earlier 41/41 result
below certifies the pre-correction candidate only. No production deployment or
physical-device testing is implied, and QR stays disabled.

The contrast-only candidate passed **120/120 device-profile simulations** across four
profiles and both networks from 13:34:42 to 13:36:39 UTC, plus **23/23 HTTP checks**
through the actual locally compiled Vercel functions. The network selector's
computed text contrast is 12.13:1 in every tested profile. Before/after captures,
RTL, offline, zoom, landscape and reduced-height input captures are retained in
`reports/release-acceptance-20261010/simulations/devices-final/`; the first harness
and its 16 explained test-assumption failures remain under `simulations/devices/`.
The scope and non-emulated OS/TLS behavior are detailed in
[MOBILE_REVIEW.md](MOBILE_REVIEW.md#additional-local-simulations--10-october-2026).

Inspection of its Sepolia offline capture then revealed a token-directory
description hardcoded to Mainnet. Network interpolation now covers that copy
and token/NFT metadata in all ten locales; the i18n suite checks both networks.
The partial `simulations/release-final/` campaign was explicitly stopped after
this finding, not certified or relabelled as complete. The new frozen source is
`ink-explorer-simulation-final-20261010`; its fresh complete campaign and compiled
artifact simulations use `release-complete/`, `devices-complete/` and `http-complete/`.

That complete run finished at 14:28:02 UTC with **40/41**, not certified: mobile
Blocks scored 89 against the unchanged Lighthouse performance minimum of 90.
Its 120 device scenarios, 23 compiled-function HTTP checks and the other
40 full suites pass. All Lighthouse accessibility, best-practices and SEO scores
are 100. The failure is retained in `simulations/release-complete/`. The audit
shows two live-row insertions (CLS 0.079) and late discovery of the shared hero
symbol. A high-priority image preload targets that avoidable resource delay
without suppressing live data or relaxing thresholds. The performance follow-up
also adds a separate Blocks startup regression case.

Image preload alone did not clear the variability: focused scores were 91, 94
and 89. The regular monospace font was also requested late; preloading it brings
simulated first-contentful paint from about 2.25 s to 1.96 s. A network-scoped
Blocks API preload removes the additional request waterfall without duplicate
requests or delayed live updates. Three combined diagnostics score 94, 93 and 91,
including a run with two live-row shifts. These remain diagnostics, not release
certification. The final unrestricted campaign is recorded in
`simulations/release-performance/`, with audits in `lighthouse-performance/`.

### Earlier deployment-routing candidate

A read-only public-site check found that Vercel returned the static SPA document
for `robots.txt`, `sitemap.xml` and unknown routes. Raw deep-link HTML also lacked
route/network canonicals. The local candidate now shares the Node metadata renderer
with a page function, keeps only static assets in the CDN output, and returns
real XML/text/404 responses. Eleven focused tests pass for routing, metadata,
languages, security boundaries, packaging and GET/HEAD behavior.

The isolated candidate passes all 23 read-only HTTP/build-identity checks and
56 checks against the actual locally compiled standalone Vercel page function
and routing configuration. The production-mode Vercel build succeeds; it has not
been deployed. The new full 41-suite campaign started at 11:22:35 UTC with 105
source/configuration files and no coverage filters. Its report is
`reports/release-acceptance-20261010/release-full/results.json`.

That run finished at 12:11:22 UTC with **40/41**, not certified: mobile Home
Lighthouse performance scored 89 against the unchanged minimum of 90. All other
gates passed, including 330 simulated mobile checks. Three subsequent focused
Home measurements on the identical source scored 94, 94 and 92. Host/measurement
variation is suspected; focused reruns do not replace release acceptance. A new
unfiltered campaign ran on the unchanged candidate in `release-recheck/`, with
separate Lighthouse evidence in `lighthouse-recheck/`. The initial failure remains
preserved rather than overwritten or reclassified as a pass.

The recheck passed **41/41 suites** from 12:14:08 to 13:03:19 UTC, without filters,
timeouts or source changes. All 105 source/configuration hashes matched the main
checkout at that time. The 24 Lighthouse reports score 91–100 for performance and 100 for
accessibility, best practices and SEO; mobile Home scores 94. These remain lab
measurements, with the observed performance variation documented above, not
physical-device or deployed-candidate certification. The final report SHA-256 is
`9a8d3b49a56589a0671d53fac4bf977cfa5dfa93c5d3ba2743be3abe492458b2`.

The previously deployed frontend passes 204 browser checks across both networks
and three engines, but that is baseline availability evidence, not acceptance of
this new candidate. Mainnet and Sepolia were online and synced with ready derivation
at the time of the check; QR configuration remained empty. Deployment authorization
and real-device iOS/Android checks are still pending. Nothing has been published.

The earlier candidate's source identity does not cover the current checkout;
only the source-bound final acceptance above does. Historical reports remain
unchanged and must not be relabelled as evidence for a different source.

## Previous validated candidate — 9 October 2026

The previous audit covers visual consistency, public explorer functionality,
data fidelity, loading and failure states, accessibility and security on Mainnet
and Sepolia. The page families are listed in
[EXPLORER_PARITY.md](EXPLORER_PARITY.md); the acceptance gates are defined in
[TEST_PROTOCOL.md](TEST_PROTOCOL.md). The candidate runs in a separate checkout
with isolated ports, caches and dependencies. Production workers and the public
frontend have not been updated.

The candidate corrects the following findings:

| Finding | Correction and regression evidence |
| --- | --- |
| Small nonzero amounts could appear as zero, and large integers could lose precision. | Integer-based ETH/token formatting, explicit bounds for small values, exact detail values and base units for unknown token decimals; `data`, `assets` and `integrity`. |
| Live block fees used base fee × gas used, not actual execution fees. | Live fees remain unknown until indexing; indexed entries replace provisional rows. Block fees are explicitly L2 execution fees, with L1 fees shown separately on transactions; `network-live`, `data` and `chain-reconciliation`. |
| Home used the rounded legacy gas oracle. | Home requests the detailed oracle and preserves its wei estimate separately from the legacy cache; `upstream-cache` and `integrity`. |
| A cached fallback could look like current indexed data. | Original snapshot time and fallback status propagate through composed responses, caches and proxies. A dated, localized warning offers recovery without conflating index availability and local node health; `upstream-cache`, `public-proxy`, `data` and `data-freshness`. |
| Missing peer status could break the overview. | An unavailable peer response no longer dereferences a missing object; `upstream-cache`. |
| A development dependency had a high-severity advisory. | The lockfile updates `source-map-js` to 1.2.2; clean installation and dependency audit run in the isolated checkout. Production dependencies have not been replaced. |
| Repeated locale formatter construction added rendering work. | Cache exact-amount digits, number and relative-time formatters for the active locale. A 1,540-case comparison preserves output; locale-switch regressions and browser tests cover the change. |
| Animated decoration repeatedly repainted alongside NFT artwork. | Keep the decoration static on small/touch screens and NFT details, without changing or freezing the artwork. Independent page probes remove the sustained long tasks; the final performance suite passes all startup budgets. |
| Failed list requests still labelled the toolbar as loading. | Block, transaction and bridge/AA lists distinguish loading, unavailable and recovered counts. Controlled failures and retry checks cover the toolbar at every style-test width. |
| The precise gas estimate was ellipsized in tablet summary cards. | The tablet gas card uses the remaining two columns; Home metrics wrap rather than hide digits. The density suite also checks both sides of the mobile, former tablet and desktop breakpoints. |

Data checks distinguish blocks keyed by chain and height, transactions keyed by
chain and hash, and ETH balances observed at a specific canonical block. Receipt
arithmetic uses integer wei. Node comparisons do not independently validate token
prices, NFT metadata or all indexed history. Unknown, unindexed and cached values
must not be presented as fresh, complete or zero.

### Final acceptance

The corrected candidate passed **41/41 suites** from 19:56:00 to 20:45:57 UTC.
The run had no coverage filters, no timeouts and no source changes. All 100
source/configuration hashes matched both the tested checkout and the main source
checkout at acceptance, including file additions/deletions. Served entry assets matched the build.

| Evidence | Final result |
| --- | --- |
| Data and dependencies | Exact amounts, receipt arithmetic, fallback age and recovery pass; dependency audit reports zero vulnerabilities. |
| Live chain comparison | Mainnet and Sepolia sampled block/transaction sets, receipts, canonical ETH balances and finalized hashes match; no failed HTTP attempt during the final comparison. |
| Browser behavior | 432 native page states, 330 mobile page/section checks, 120 address-readability cases and 18 freshness-warning states pass across Chromium, Firefox and WebKit. |
| Layout | 20 routes at 12 widths, responsive breakpoint checks, five style widths and 41 density cases pass, including the corrected tablet gas card and list error/retry labels. |
| Startup performance | All five cases pass LCP, CLS, DOMContentLoaded, long-task and transfer budgets. Recorded LCP is 124–636 ms and there are 0–1 long tasks on this machine; these are local lab measurements, not production guarantees. |
| Lighthouse | All 24 route/profile audits pass: performance 92–100; accessibility, best practices and SEO 100. Mobile Blocks improves from the failing baseline score of 87 to 94. |
| Visual review | 31 real-route captures supplement full-page style, density, chart and controlled-error captures. Manual inspection covers mobile/desktop/tablet layouts, Arabic RTL, exact fees, NFT media and chart data. Third-party media can remain loading or unavailable independently of chain data. |

The main checkout retains the final report and individual suite logs in
`reports/audit-20261009/release-final/`, all Lighthouse audits in
`reports/audit-20261009/lighthouse/`, the live comparison in
`reports/audit-20261009/chain-reconciliation/` and final route captures in
`reports/audit-20261009/visual-final/`. Generated evidence is ignored by Git.
`reports/audit-20261009/progress.json` records the isolated review locations and
unchanged production process/build identity. No production build, service or
public frontend was updated, and no code was committed or published.

### Preserved failure history

Two console-interrupted attempts remain incomplete evidence, not certifications.
The frozen baseline finished with **38/41** passing suites: startup long tasks,
a clipped tablet gas metric and mobile Blocks Lighthouse performance failed.
Its unchanged-source report remains
`reports/release-20261009-persistent/results.json` in the initial review checkout.
Filtered diagnostic runs, including failed performance probes, are also retained
without changing their verdicts. Only the subsequent unrestricted run on the
corrected, unchanged candidate establishes the final acceptance above.

## Historical snapshot — 3 October 2026

The source snapshot reviewed on 3 October 2026 passed all **34 release suites**
on isolated Mainnet and Sepolia explorer workers. The campaign ran from
06:17:09 to 06:56:37 UTC without coverage restrictions or test timeouts. All 70
source/configuration file hashes matched the tested snapshot, and the served
entry assets matched the build. This validates that snapshot; a later release
must run its own campaign using [the test protocol](TEST_PROTOCOL.md).

### Account and detail readability

Address pages open on transactions and show indexed names, a full copyable
address and three compact summary cards. Exact transaction counts replace
abbreviations, while ETH node provenance and mismatch/unavailable notices remain
visible. Accounts no longer display an empty contract profile, proxy or deployment
fields. Secondary facts, all valid contract implementations and pool destinations
remain available in Overview; recognized pools show their pair in the title.

Block and transaction detail headers and definitions use less space. Desktop
ledgers have column labels and readable data text, and method badges prefer
supplied function names. Loaded entity pages take their natural height rather
than adding a minimum-height gap before the footer. Mobile identity values wrap
without truncation and retain their copy actions.

The readability suite covers 120 account, empty-account and proxy cases across
both networks, three browser engines and all ten locales. Address recovery tests
also verify that retrying a profile reloads its default transaction section.
Real account and contract pages supplement these fixtures in the density suite.

### Address loading and data corrections

An unreachable private API could leave an address displaying “Reading the
chain” indefinitely. Ordinary reads now have a 20-second deadline covering
both response headers and the JSON body. Advanced filters have a 75-second
deadline. Address pages show an actionable error and retry the same address
without a reload. Private-network failures explain the required Tailscale
connection and browser local-network permission.

Navigation cancels obsolete requests. Late, invalid or wrong-address responses
cannot replace the current profile. Unavailable holdings stay unavailable
rather than becoming zero, and section retries retain the selected tab.

Address ETH balances are checked against a ready local execution node at the
indexed update height using the canonical block hash. The response retains the
original indexed amount and identifies whether the local check matched,
corrected or could not verify it. This check does not claim that token balances,
NFTs or address counters are independently verified. See [the API](API.md) for
the response fields.

Serving an upstream fallback preserves the snapshot's original fetch time.
Repeated outages cannot renew the 24-hour fallback lifetime, and permanent
upstream errors are not hidden by stale snapshots.

Execution freshness and L1 derivation readiness are displayed separately. A
fresh unsafe execution head is insufficient evidence of healthy derivation.
The readiness check accepts a derivation cursor one block ahead of the perceived
L1 head only with the immediate parent link, coherent timestamps and valid
distinct hashes.

### Verified coverage

| Area | Result |
| --- | --- |
| Address recovery | Pasted addresses, stalled headers/body, invalid responses, stale navigation, unavailable balances and retry checked on both networks at 320, 390 and 1440 px. |
| Live chain comparison | Same-height block hash, parent, timestamp, gas and complete transaction sets matched local and public RPCs on Mainnet and Sepolia. Receipt status and execution/L1 fees matched. ETH balance checks used the indexed update height and canonical hash; finalized hashes matched public RPCs. |
| Network status | Expected chain IDs, fresh execution and synchronized L1 derivation verified on both networks. |
| Explorer routes | Search, blocks, transactions, addresses, contracts, tokens, NFTs, pools, bridge activity, account abstraction, pagination and error recovery exercised. |
| Contracts and filters | ABI/proxy/custom-ABI interaction, wallet rejection and receipt behavior exercised on isolated Anvil. Advanced filters, exact decimal bounds, URL state, cursors and safe CSV exercised against fixtures and public indexes. |
| Mobile and localization | 306 mobile checks in Chromium, Firefox and WebKit; 20 route states at 12 widths; ten languages including Arabic RTL. See [mobile behavior](MOBILE_REVIEW.md). |
| Cache and security | Snapshot age/expiry, permanent errors, concurrent readers and HTTP/RPC boundaries passed. |
| Lighthouse | All 12 reports passed: performance at least 94; accessibility, best practices and SEO 100. CSS/JavaScript and browser-cache optimization opportunities remain. |

The real private-API connection was also checked in an isolated browser: denied
access produced guidance; granting access and retrying recovered the same
address. A stalled request expired and recovered by retry. These checks served
the reviewed frontend in that browser and are not evidence of a public deployment.

The release runner writes reports and logs under `reports/`; browser suites
also write local captures under `screenshots/`. These generated artifacts and
operator-specific configuration are excluded from Git. Reproduce the checks
with `npm run test:release` against an isolated instance.

## Current scope and remaining limits

Indexed history and node verification have separate availability and freshness.
Native source-verification submission, contract interactions and standard token
approval inspection/revocation are implemented and exercised against disposable
services and an isolated EVM; tests do not publish real contract sources, labels
or public-network transactions. Browser wallets use native EIP-6963 discovery.
Optional WalletConnect QR needs the operator's public project ID and authorized
domains; the button is absent when unconfigured. Actual relay pairing is not
validated by mocked providers or an unconfigured deployment. Private watchlists,
account notifications, Merits and separate multichain services are not part of
this explorer. Non-standard or unindexed permissions and Permit2 remain outside
the approvals tool's scope.

Automated WebKit is not a physical iPhone. Real mobile keyboards, VoiceOver,
TalkBack and wallet extensions on physical devices remain complementary checks.
Lab performance scores depend on the test machine and network. The test campaign
does not prove an absolute absence of bugs, and deployment needs its own smoke
checks against the actual frontend and API.
