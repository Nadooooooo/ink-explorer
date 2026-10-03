# Mobile interface

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
