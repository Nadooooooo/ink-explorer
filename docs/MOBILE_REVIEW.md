# Mobile interface

## Recent-device extension — 9 November 2026

Four newer device profiles extend the original four-device matrix. All160 additional scenarios pass in one complete, unfiltered run with
zero failures:20 scenarios × four profiles × both networks.

| Profile | Engine | Portrait viewport | Mainnet | Sepolia |
| --- | --- | --- | --- | --- |
| iPhone17 | WebKit | 402×681 | 20 | 20 |
| iPhone17 Pro Max | WebKit | 440×763 | 20 | 20 |
| Pixel10 Pro | Chromium | 427×876 | 20 | 20 |
| Galaxy S24 | Chromium | 360×780 | 20 | 20 |

These are profiles available in the installed Playwright device registry, rather
than a claim to cover every newest phone or execute its native OS. The only
harness change is the four profile names; all20 scenario bodies and common
helpers are identical to the corrected original harness. Automatic recovery,
controlled manual retry and settled-drawer contrast checks remain enforced.

The original160 accepted cases are retained. Combined coverage is320 unique
profile/network/scenario cases across eight profiles on the same public version
`e81185ad-06fd-4924-acb0-e591ba38e5cf`. Source checks cover570 frontend and244
API files unchanged before/after testing, plus initial asset byte hashes, API
package metadata and dependency links. No application change or redeployment
was needed. QR remains disabled and public testing is read-only.

Captures from each added profile were visually inspected, including the large
iPhone landscape/RTL layouts, Pixel contract form/result, iPhone manual copy and
Galaxy home. Emulation does not establish native OS, physical safe areas, screen
reader, wallet-extension or system keyboard behavior; prior simulation boundaries
still apply.

Evidence: `reports/delivery-20261109/mobile-simulations-recent/` contains the full
results, harness, toolchain, certificate and160 hashed accepted captures.
`all-device-profiles-acceptance.json` binds the old and new coverage to320 unique
cases. The actual local evidence root remains
`reports/delivery-20261109/`.

## Current simulation acceptance — 9 November 2026

This review covers emulated iPhone and Android profiles. The physical-device checklist below records the outstanding hardware and assistive technology checks.

All160 unique scenarios are accepted on the actual public release
`e81185ad-06fd-4924-acb0-e591ba38e5cf`:20 scenarios × four profiles × two networks.

| Profile | Engine | Networks | Accepted scenarios |
| --- | --- | --- | --- |
| iPhone SE | WebKit | Mainnet and Sepolia | 40 |
| iPhone13 | WebKit | Mainnet and Sepolia | 40 |
| Pixel7 | Chromium | Mainnet and Sepolia | 40 |
| Galaxy S9+ | Chromium | Mainnet and Sepolia | 40 |

Coverage includes real home/block/transaction/address data; touch navigation,
search and history; complete clipboard payload and selected manual fallback;
custom ABI inputs in a reduced-height keyboard proxy and successful read-only
contract calls; landscape focus; zoom; Arabic RTL, reduced motion and themes;
Axe and drawer focus/inert behavior; offline recovery; slow connections; dated
stale-data warnings and reload; missing, selected and rejecting simulated native
wallets; chain switching; and controlled suspension/resume with actual sockets.
QR remained disabled, and no public transaction or signature was requested.

The full matrix is preserved at158/160. Two Android retry clicks raced with
successful automatic online recovery. A complete offline scenario rerun on all
eight profile/network combinations checks automatic recovery without a click,
then separately injects a stable refresh503 and checks manual retry. The qualified
acceptance uses152 unchanged scenario passes plus those eight complete reruns.
It does not relabel the original failed report or claim a clean single160-pass
run. All other19 scenario bodies are byte-for-byte unchanged between reports.

Earlier attempts are also preserved: the initial harness targeted transaction
list labels and block-header copy controls absent from the current UI. Another
full matrix passed157/160 because Axe sampled the160ms drawer entrance animation.
Freezing the real animation at opacity0.5 reproduced exactly the reported contrast
targets; finishing the same animation at opacity1 yielded no violations. The
accessibility scan now waits for finite native animations to finish. No contrast
threshold was lowered and no browser-error filter was added.

Before/after identity checks cover570 frontend files,244 API files and five
initial asset byte hashes. API package metadata and isolated dependency links
were checked as well. Application source, deployment, DNS and process configuration
were unchanged by these simulations. Captures from all four profile families were
visually inspected, including landscape, RTL and contract forms/results.

Reproducible local evidence is under
`reports/delivery-20261109/`:
`mobile-simulations-certified/certificate.json` and `combined-results.json`,
original full results, `mobile-simulations-offline-revalidated/`, animation proof,
toolchain metadata, harness copies and160 hashed accepted screenshots. Node24.15,
Playwright1.63, desktop WebKit26.6 and Chrome150 were used with the named presets.

These profiles emulate geometry, DPR, touch and user agents. Chromium uses CDP
pinch/4G/CPU throttling; WebKit uses CSS zoom and API latency proxies. Keyboard,
clipboard, wallets and lifecycle have explicitly recorded simulation boundaries.
Axe and ARIA/focus checks do not execute VoiceOver/TalkBack. Production HTTPS and
real chain reads were exercised; iOS/Android operating systems were not executed.

The mobile layout uses shared rules in `src/mobile.css` and the
[design system](DESIGN_SYSTEM.md). The 2 October 2026 release campaign exercised
306 mobile checks in Chromium, Firefox and WebKit, plus 20 route states at 12
widths, responsive interactions and ten locales. See [the validation scope](EXPLORER_AUDIT.md).

## Interaction and layout rules

| Area | Behavior |
| --- | --- |
| Typography | Main data uses 14 px, metadata 12 px and phone inputs 16 px. Retry labels remain readable on narrow and touch layouts. Decorative glyphs and branding have separate rules. |
| Touch controls | Primary actions and inputs target at least 44 px height. Compact copy controls use 36 px targets and inline data links use 32 px height. These are project design choices, not a claim of WCAG certification. |
| Navigation | The menu supports keyboard opening, focus transfer, Escape and return to its trigger. Navigation transfers focus to page content. |
| Entity sections | A native selector exposes every section on narrow or touch layouts. Desktop layouts retain section buttons. |
| Pool filters | The token pair gets a dedicated line. Secondary filters can collapse; active URL filters open automatically and can be reset. |
| Charts | Each chart has its own range and tooltip, with pointer, touch and keyboard inspection. |
| Statistics table | Horizontal scrolling stays inside an announced, keyboard-accessible region. The date column remains visible horizontally. |
| Short viewports | Menus fit the available height, contract forms stay scrollable and reduced-motion preferences are respected. |

## 3 October 2026 review

The broader review covers 88 Mainnet route and section states: general lists,
accounts and contracts, transactions and all their sections, ERC-20 and NFT
collections, holders, individual NFTs, pools, domains, batches, user operations,
statistics, applications, verification, public tags and missing pages. Screenshots
are inspected alongside geometry checks at 320, 430, 844 and 1440 px. The native
page suite separately exercises both networks, Arabic/French/English, and
Chromium/Firefox/WebKit with controlled error, consent and scoping cases.

Changes from this review:

- Transaction rows retain their status on phones and label both participants.
  Long contract names wrap instead of losing their identifying suffix.
- Token rows expose type, price, holders and market cap with individual labels.
  Asset holdings and holder balances have a separate, readable amount line.
- Account, history, batch and protocol records group related facts into columns.
  Deposits, withdrawals and user operations retain their amount/fee context.
- Event logs present decoded parameters first. A closed disclosure keeps full
  raw topics, data and decoded JSON available for keyboard and pointer users.
- NFT transfers expose their instance identifier, including ID zero. Shortened
  long IDs retain the full identifier in their title and destination. Missing
  decimals remain explicitly labelled as base units rather than an invented
  human-readable token amount.
- Numeric batch/game count responses are validated separately from object API
  responses. Counts show loading, failure, retry and a valid zero explicitly.
- Obsolete contract/read/write links on simple accounts return to the overview.
- Statistics can be searched by translated titles and descriptions. French
  relative dates use an unambiguous past-tense format. Loaded block-utilization
  percentages have enough space beside their local range control.
- Optional company fields fold away on public-tag forms. Required fields remain
  visible; every verification method remains available. No real verification or
  moderation request is submitted by the review.

Native explorer destinations remain internal. Advanced navigation and footer
links expose the complete directory without repeating it above every page.
Raw amounts, full copy values and chain/source attribution remain available.

This review supplements the full release protocol below. Real-chain observations
and controlled browser fixtures serve different purposes; neither proves that
every possible account, token metadata payload or upstream outage is bug-free.

## Reproduce the checks

Install the Playwright browser engines and run the suites against a built,
isolated server as described in [the test protocol](TEST_PROTOCOL.md):

```bash
npm run test:mobile
npm run test:responsive
npm run test:layout
npm run test:a11y
npm run test:i18n
npm run test:style
```

The checks include touch landscape, keyboard focus, every address/transaction
section, empty/error/retry states, reduced viewport height and RTL. Controlled
failure fixtures are confined to the test browser; live API routes are tested
separately. Generated screenshots and logs stay outside version control.

The review uses simulated browser viewports. Physical iOS/Android keyboards,
screen readers and system text-size settings need additional device testing.
Automated accessibility checks do not establish full accessibility conformity.

## Additional local simulations — 10 October 2026

This review used a local deployment with QR disabled. Four Playwright device presets cover iPhone
SE and iPhone 13 in WebKit, and Pixel 7 and Galaxy S9+ in Chromium, on both
Mainnet and Sepolia. These are emulated geometries, touch inputs, pixel ratios
and user agents, not those operating systems or browser binaries.

The local preview executes the production-mode, standalone Vercel page and
gateway functions with their compiled routing configuration and asset files.
A loopback HTTPS bridge forwards read-only requests to isolated live-chain
workers. It rejects submissions. Its self-signed certificate and emulated CDN
behavior do not certify public DNS, production TLS, edge behavior or internet
reachability. The final candidate passes 24 HTTP/build-identity checks here.

Fifteen scenarios per device/network exercise touch navigation, exact clipboard
payloads, back/forward, custom contract ABI inputs, reduced-height keyboard proxy,
landscape focus, 200% zoom, Arabic RTL, reduced motion, offline recovery, slow
connections, dated stale-data warnings, accessibility semantics, missing/rejecting
wallets, network switching and disabled QR. Chromium uses CDP pinch, network and
CPU emulation; WebKit uses CSS zoom and delayed API responses. Clipboard data is
captured in a browser fixture; Axe and focus checks do not run a native screen
reader. No real wallet connection, signature or transaction is requested.

All 120 scenarios pass on the final compiled candidate; its complete source-bound
release campaign also passes all 41 suites. The physical-device checklist below records tests that require hardware.

Visual inspection found a real WebKit network-selector contrast defect. Explicit
dark control styling removes native light chrome; mobile regressions now require
at least 4.5:1 text contrast. The initial capture and harness are retained alongside
the corrected run in `reports/release-acceptance-20261010/simulations/`.
A Sepolia token-directory capture also exposed a hardcoded Mainnet label;
network interpolation and both-network checks now cover all ten locales.
The initial harness's 16 failures came from testing a hidden mobile chain-ID label,
checking focus before its scheduled restoration, and assuming Sepolia WETH had
an indexed ABI. The corrected harness checks the selected network and document
ID, waits for focus restoration, and explicitly uses the custom-ABI workflow on
both chains. It does not change or weaken the application to mask those findings.
Current run verdicts and exact source identity are recorded in
[EXPLORER_AUDIT.md](EXPLORER_AUDIT.md); historical reports remain unchanged.

## Physical-device acceptance — pending, 10 October 2026

No iOS or Android device is attached to the review machine. The 10 October
public-site run passed 204 checks in Chromium, Firefox and WebKit at 390 and
1440 px on both networks, using simulated viewports on a computer; that historical
run did not test the then-unpublished candidate. The corrected 16 October build
is now deployed and its exact assets and real public explorer workflows have
been verified. This historical record describes browser simulations. The
device checklist below is still pending. See the
[release test protocol](TEST_PROTOCOL.md#acceptance-gates-and-evidence) for
the evidence required for a new release.

For each real device, record its model, OS version, browser version, deployment
URL, entry asset identifier, time and Wi-Fi/cellular connection. Use Safari on
iPhone and Chrome on Android; use an actual wallet browser only for direct-wallet
discovery. Leave QR unconfigured and do not sign or broadcast transactions.

| Check | Required observation | Status |
| --- | --- | --- |
| Home, search and entities on Mainnet and Sepolia | Correct chain, populated data, legible exact values, links and back navigation | Pending |
| System keyboard | Search and form fields remain visible; dismissal does not trap scrolling or hide navigation | Pending |
| Portrait and landscape | Menus, charts, tables and contract sections fit the usable viewport and safe areas | Pending |
| Browser zoom and larger system text | 200% text/zoom stays readable without clipped controls or lost content | Pending |
| VoiceOver or TalkBack | Meaningful control names, predictable reading/focus order, announced loading/errors and usable menu | Pending |
| Copy and sharing | Clipboard contains the complete selected address/hash; browser sharing opens the same chain/page | Pending |
| Connection loss and recovery | Offline/stale data is explicit; reconnect/retry recovers without inventing a zero or current timestamp | Pending |
| Direct wallet, if installed | Provider choice and chain are correct; rejection/cancellation recovers; no unsolicited account or signature request | Pending |

Record pass/fail and a screenshot or reproducible description for each row.
Do not mark an untested OS/device as passed based on desktop WebKit or touch emulation.
