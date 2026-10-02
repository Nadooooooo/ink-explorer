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
