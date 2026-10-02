# Explorer validation

The source snapshot reviewed on 2 October 2026 passed all **33 release suites**
on isolated Mainnet and Sepolia explorer workers. The campaign ran from
10:19:31 to 10:56:22 UTC without coverage restrictions or test timeouts. All 68
source/configuration file hashes matched the tested snapshot, and the served
entry assets matched the build. This validates that snapshot; a later release
must run its own campaign using [the test protocol](TEST_PROTOCOL.md).

## Address loading and data corrections

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

## Verified coverage

| Area | Result |
| --- | --- |
| Address recovery | Pasted addresses, stalled headers/body, invalid responses, stale navigation, unavailable balances and retry checked on both networks at 320, 390 and 1440 px. |
| Live chain comparison | Same-height block hash, parent, timestamp, gas and complete transaction sets matched local and public RPCs on Mainnet and Sepolia. Receipt status and execution/L1 fees matched. ETH balance checks used the indexed update height and canonical hash; finalized hashes matched public RPCs. |
| Network status | Expected chain IDs, fresh execution and synchronized L1 derivation verified on both networks. |
| Explorer routes | Search, blocks, transactions, addresses, contracts, tokens, NFTs, pools, bridge activity, account abstraction, pagination and error recovery exercised. |
| Contracts and filters | ABI/proxy/custom-ABI interaction, wallet rejection and receipt behavior exercised on isolated Anvil. Advanced filters, exact decimal bounds, URL state, cursors and safe CSV exercised against fixtures and public indexes. |
| Mobile and localization | 306 mobile checks in Chromium, Firefox and WebKit; 20 route states at 12 widths; ten languages including Arabic RTL. See [mobile behavior](MOBILE_REVIEW.md). |
| Cache and security | Snapshot age/expiry, permanent errors, concurrent readers and HTTP/RPC boundaries passed. |
| Lighthouse | All 12 reports passed: performance 93–100; accessibility, best practices and SEO 100. Mobile lab LCP reached about 2.9 seconds on the blocks list; loading, CSS/JavaScript and browser-cache optimization opportunities remain. |

The real private-API connection was also checked in an isolated browser: denied
access produced guidance; granting access and retrying recovered the same
address. A stalled request expired and recovered by retry. These checks served
the reviewed frontend in that browser and are not evidence of a public deployment.

The release runner writes reports and logs under `reports/`; browser suites
also write local captures under `screenshots/`. These generated artifacts and
operator-specific configuration are excluded from Git. Reproduce the checks
with `npm run test:release` against an isolated instance.

## Scope and remaining limits

Indexed history and node verification have separate availability and freshness.
This explorer does not implement every account service offered by other
explorers: WalletConnect QR, native Solidity source-verification submission,
a dedicated token-approval revocation tool, private watchlists and account
notifications are not implemented.

Automated WebKit is not a physical iPhone. Real mobile keyboards, VoiceOver,
TalkBack and wallet extensions on physical devices remain complementary checks.
Lab performance scores depend on the test machine and network. The test campaign
does not prove an absolute absence of bugs, and deployment needs its own smoke
checks against the actual frontend and API.
