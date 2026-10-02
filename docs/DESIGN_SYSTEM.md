# Ink Explorer — shared visual rules

The `:root` block in `src/styles.css` is the source of visual tokens. Components keep their layout and purpose; the families below define their shared appearance.

| Family | Rules |
| --- | --- |
| Interface text, pool names, contracts and NFTs | `--font-ui`: Plus Jakarta Sans, falling back to Arial/sans-serif |
| Identifiers, addresses, hashes, block numbers and code | `--font-mono`: DM Mono, falling back to monospace |
| Metric, contract, NFT and statistics cards | `--surface-card`, `--line`, `--radius-card`, `--shadow-card` |
| Data panels, details, tables and code areas | `--surface-panel`, `--line`, `--radius-panel`, `--shadow-panel` |
| Page and detail heroes | `--radius-hero` and the existing purple gradient |
| Table headers and collapsible code sections | `--surface-header` |
| Search fields | `--surface-field`, `--field-border`, `--shadow-field`, `--radius-control` |
| Primary action | `--action-fill`, white text, `--radius-control`, `--shadow-action` |
| Secondary action | `--paper` background, `--line` border, `--surface-hover` on hover |
| Contextual link in a detail panel | Purple text, transparent background, light hover state |
| Tabs | `--surface-muted` container, `--radius-control` corners, `--radius-inset` inner elements |
| Source, input data and JSON | `--surface-code`, `--text-on-dark`, `--font-mono` |
| Status badges | `--radius-pill`, semantic success/error colour; light variant on dark backgrounds |
| Inline copy | 24 px desktop / 36 px phone button, no native border, `--radius-inset`, green confirmation |
| Error | `--surface-error`, `--border-error`, message and retry action |
| Chart period | Native select inside its chart header; muted surface, purple text, 36 px desktop / 44 px touch target; independent state |
| Chart inspector | One local, bounded tooltip; date and value only, with ≈ for a partial last observation; dismiss on outside interaction, Escape, blur or scrolling |
| Chart without data | Secondary surface, subtle border, preserved minimum height and state message |

## Sizes and interactions

- Heroes: 24 px radius on desktop, 20 px in compact layouts.
- Panels: 20 px radius on desktop, 18 px in compact layouts.
- Cards: 18 px radius on desktop, 16 px in compact layouts.
- Controls: 10 px radius; shared minimum height of 36 px, then 44 px up to 760 px viewport width. Inline data links use at least 32 px height on phones; copy controls use 36 × 36 px. These comfort targets are distinct from the WCAG 2.2 AA 24 px minimum and its exceptions.
- Inner elements: 8 px radius; statuses use pill shapes.
- Keyboard focus uses `--focus-color` with a 3 px outline. Compound fields also show a `focus-within` indicator.
- Disabled controls keep their background on hover, with 0.45 opacity and an explicit cursor.
- Copy actions show a checkmark and the accessible label “Copied” after completion.

Dark status cards, code areas, network illustrations and accent surfaces are functional variants. Keep their distinct appearance.

Home, list and detail heroes use the official Ink symbol from `public/brand/ink-symbol.svg` as decoration. Its geometry remains intact; scaling, a 12° clockwise rotation and cropping integrate it into the background. The motif fades behind text and has no interaction.

The header uses the official horizontal logo from `public/brand/ink-wordmark.svg` with “Explorer” as a subtitle. The footer shows the same logo in white on a dark background.

## Preventing regressions

```bash
npm run test:style
```

The test compares computed styles in Chrome against the shared tokens on real routes, including detail pages, source code and NFTs. It covers hover, keyboard focus, selection, disabled controls, copy feedback and simulated network states. It rejects controls that have regained a native `inset` or `outset` border.

For a focused check: `STYLE_WIDTHS=390,1440 npm run test:style`.

Add each new visual family to this document and to `scripts/style-consistency-test.mjs`. Reuse an existing family token before adding a page-specific colour, radius or shadow.

## Chart interactions

The home trend offers 7 and 30 days from the available overview history. Analytics charts each offer 7D, 30D, 90D, 6M and 1Y; 1Y uses weekly observations. Recent block utilization offers the latest 10, 25 or 50 indexed blocks rather than implying a historical time range that is unavailable.

Each chart owns its inspection state. A tap or hover never opens tooltips on other cards. Arrow keys, Home and End inspect points; Escape and blur clear the selection. Tooltips stay within the plot, and vertical touch scrolling remains available. Headline values remain stable while inspecting points.

Card requests are cancellable and have local loading, empty, failure and retry states. Transactions retain the `range` URL parameter. The data table and CSV use that chart’s period; independent card selections do not change the export. The daily account summary remains daily when a chart changes period.

Run `npm run test:charts` for deterministic range, isolation, touch, keyboard, request race, retry, empty and RTL checks. `CHART_BROWSERS=chromium,firefox,webkit` covers all three browser engines. These fixtures only run in the test browser; application data remains source-backed.

## Mobile ergonomics

`src/mobile.css`, imported after the component styles, contains the shared mobile and coarse-pointer refinements. Keep those rules together so orientation and touch behaviour remain consistent across page families.

- Data text: 14 px; supporting labels: 12 px; explanatory prose: 14 px; inputs and native selectors: 16 px with a 44 px minimum height. These are project readability choices, not WCAG font-size requirements.
- Phone pool rows place the pair above the two labelled monetary values. Advanced filters collapse on narrow screens; their active status and reset action stay visible. URL-provided advanced filters open automatically.
- `SectionTabs` shows native section selection on narrow or touch screens and the original button group on desktop. All sections remain available, including contract source, read/write forms, NFT instances and transaction traces.
- A keyboard-opened header menu focuses its first destination. Escape restores the menu button; moving focus out dismisses the menu. Client-side navigation focuses the main region and scrolls immediately to the new page.
- Analytics tables preserve the date column during horizontal scrolling. Row dates are row headers, column names are column headers, and the labelled scroll region is keyboard-focusable. A visible hint explains horizontal scrolling.
- Keep viewport zoom enabled. Respect reduced motion. Focused form controls must remain reachable under the sticky header when the viewport becomes short.

Run `BASE_URL=http://127.0.0.1:<preview-port> npm run test:mobile`. Use `MOBILE_BROWSERS=chromium,firefox,webkit` for all engines; `MOBILE_WIDTHS` and `MOBILE_OUTPUT` select the viewport matrix and evidence directory. Browser emulation does not replace testing a physical phone's software keyboard.
