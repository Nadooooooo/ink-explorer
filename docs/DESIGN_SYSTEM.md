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
| Tabs and period selectors | `--surface-muted` container, `--radius-control` corners, `--radius-inset` inner elements |
| Source, input data and JSON | `--surface-code`, `--text-on-dark`, `--font-mono` |
| Status badges | `--radius-pill`, semantic success/error colour; light variant on dark backgrounds |
| Inline copy | 24 px button, no native border, `--radius-inset`, green confirmation |
| Error | `--surface-error`, `--border-error`, message and retry action |
| Chart without data | Secondary surface, subtle border, preserved minimum height and state message |

## Sizes and interactions

- Heroes: 24 px radius on desktop, 20 px in compact layouts.
- Panels: 20 px radius on desktop, 18 px in compact layouts.
- Cards: 18 px radius on desktop, 16 px in compact layouts.
- Controls: 10 px radius; shared minimum height of 36 px, then 44 px up to 760 px viewport width. Text links and inline data copy buttons remain compact.
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
