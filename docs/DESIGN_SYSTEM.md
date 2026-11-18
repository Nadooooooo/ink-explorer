# Ink Explorer — shared visual rules

## Direction actuelle — 18 novembre 2026

L'explorateur est un outil de lecture répété : la recherche, l'identité du relevé
et ses valeurs doivent se repérer avant la décoration. La
[charte officielle Ink](https://docs.inkonchain.com/work-with-ink/brand-kit)
définit une base noire et blanche, avec Ink Purple `#7132F5` en accent,
Ink Light `#9E70FF` et Ink Soft `#F2ECFF` en couleurs de soutien.

`src/polish.css`, après `redesign.css`, définit cette palette : page neutre,
cartes blanches ou anthracite, texte neutre et accent réservé aux actions,
liens, graphiques et états sélectionnés. La première métrique de l'accueil reste
un repère violet uni. Les détails, compteurs et panneaux ordinaires utilisent
leur surface neutre ; le fond de page n'a plus de dégradé violet.
Les couleurs fonctionnelles de succès, d'erreur et d'avertissement restent
distinctes de la palette de marque.

En clair, le texte violet utilise Ink Purple sur une surface claire. En sombre,
Ink Light assure la lisibilité des liens, alors que les actions pleines gardent
Ink Purple et du texte blanc. Ink Light n'est pas une couleur de petit texte
sur fond blanc. Les surfaces de soutien sombres sont une adaptation teintée,
pas un aplat Ink Soft clair sous du texte clair. Les contours des champs ont
leur propre token `--field-border`, séparé des bordures discrètes des données.

Les grilles, espacements, densités, rayons, géométrie du logo, routage et commandes
restent les mêmes. Les légendes compactes de blocs passent de 11 à 12 px,
conformément au plancher de lecture déjà retenu pour les métadonnées.

### Typographie et distribution

La charte Ink nomme Satoshi. Ce dépôt distribuable conserve Plus Jakarta Sans
pour l'interface, DM Mono pour les identifiants et les polices locales de
complément pour les écritures non latines. Il ne prétend donc pas reproduire
exactement la typographie officielle.

L'archive Satoshi récupérée depuis Fontshare le 18 novembre 2026 contient la
licence ITF FFL v2.0 du 17 août 2026. Sa section 01 autorise notamment
l'auto-hébergement pour les propres sites et applications du licencié ; sa
section 02 restreint la redistribution des fichiers de police, notamment via un
repository. Pour ce dépôt destiné à être partagé, aucun fichier Satoshi n'est
ajouté et aucun chargement distant Fontshare n'est imposé. Une installation
privée de cette police requiert que son opérateur obtienne sa propre copie et
respecte sa licence. Voir la
[licence officielle ITF FFL](https://www.fontshare.com/licenses/itf-ffl).

### Cascade et portée

Les tokens de base viennent de `src/styles.css`, puis `redesign.css` et
`polish.css` les précisent. `polish.css` est la couche de direction visuelle,
pas la dernière feuille chargée : `main.tsx` importe ensuite les règles de
ledger, détails, mobile, typographie tactile et autres composants.
Conserver cet ordre et vérifier les styles calculés sur le rendu compilé après
un changement de tokens. Ne pas déplacer les règles de géométrie ni multiplier
les nouvelles palettes dans les composants.

La [revue du 17 octobre](POLISH_2026-10-17.md) reste un historique de l'ancienne
présentation ; ses surfaces violettes et valeurs ne définissent plus la palette
courante.

## Référence des composants

The shared tokens originate in `src/styles.css`; `redesign.css` and the visual-direction `polish.css` layer refine them before the later component/responsive layers. Components keep their layout and purpose; the families below define their shared appearance.

| Family | Rules |
| --- | --- |
| Interface text, pool names, contracts and NFTs | `--font-ui`: Plus Jakarta Sans, falling back to Arial/sans-serif |
| Identifiers, addresses, hashes, block numbers and code | `--font-mono`: DM Mono, falling back to monospace |
| Metric, contract, NFT and statistics cards | `--surface-card`, `--line`, `--radius-card`, `--shadow-card` |
| Data panels, details, tables and code areas | `--surface-panel`, `--line`, `--radius-panel`, `--shadow-panel` |
| Page, token and pool heroes | `--radius-hero`, neutral `--surface-panel` and `--line`; a local accent is reserved for a primary action or state |
| Address, transaction and block headers | `--radius-hero`, `--line`, calm `--surface-panel`, compact identity and status |
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
| Cached index data | `--surface-warning`, `--border-warning`, `--text-warning`; dated status notice with a 44 px retry action, independent of local node health |
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

Home, list, token and pool heroes use the official Ink symbol from `public/brand/ink-symbol.svg` as decoration. Its geometry remains intact; scaling, a 12° clockwise rotation and cropping integrate it into the background. The motif fades behind text and has no interaction.

The header uses the official horizontal logo from `public/brand/ink-wordmark.svg` with “Explorer” as a subtitle. The footer shows the same logo in white on a dark background.

## Entity information hierarchy

`src/details.css` follows the mobile rules with entity-specific layouts, including
their touch and narrow-screen variants. Address pages open on transactions.
The header shows the indexed ENS name or contract name, the full copyable address,
meaningful risk/verification status and internal navigation. Recognized
pools use their token pair as the title and retain their pool-detail destination
in Overview. Essential figures use three compact cards: ETH balance, transaction
count and token holdings.
Counts remain exact; balance provenance and disagreement/unavailable notices stay
visible. Missing holdings are not converted to zero.

Overview contains secondary facts. Accounts have no empty contract, proxy or
deployment fields. Contracts show supplied metadata and every valid implementation
with working destinations; unknown deployment fields are omitted without implying
a genesis deployment. Existing source/read/write sections remain available.

Block and transaction definitions use compact label/value rows. Desktop ledgers
have aligned column labels; narrow layouts preserve the existing stacked rows.
Method badges prefer the supplied call name over a generic transaction category.
Primary ledger data uses 14 px text and supporting metadata uses 12 px. Full hashes
wrap on narrow screens while keeping their copy action.

Run `npm run test:readability` for account/empty/proxy fixtures on both networks,
three browser engines, four widths and all ten locales. `test:space` also measures
how quickly real account and contract activity is reached.

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

`npm run test:data-freshness` checks fallback warnings, recovery and navigation
in three engines on both networks at 320 px Arabic, 390 px French and 1440 px
English. It includes contrast/accessibility checks and screenshots. Rounded
nonzero amounts use an explicit bound instead of a zero; monetary rows retain
exact title values. Block fee columns describe L2 fees, not L1-inclusive totals.

## Mobile ergonomics

`src/mobile.css`, imported after the component styles, contains the shared mobile and coarse-pointer refinements. Keep those rules together so orientation and touch behaviour remain consistent across page families.

- Data text: 14 px; supporting labels: 12 px; explanatory prose: 14 px; inputs and native selectors: 16 px with a 44 px minimum height. These are project readability choices, not WCAG font-size requirements.
- Phone pool rows place the pair above the two labelled monetary values. Advanced filters collapse on narrow screens; their active status and reset action stay visible. URL-provided advanced filters open automatically.
- `SectionTabs` shows native section selection on narrow or touch screens and the original button group on desktop. All sections remain available, including contract source, read/write forms, NFT instances and transaction traces.
- A keyboard-opened header menu focuses its first destination. Escape restores the menu button; moving focus out dismisses the menu. Client-side navigation focuses the main region and scrolls immediately to the new page.
- Analytics tables preserve the date column during horizontal scrolling. Row dates are row headers, column names are column headers, and the labelled scroll region is keyboard-focusable. A visible hint explains horizontal scrolling.
- Keep viewport zoom enabled. Respect reduced motion. Focused form controls must remain reachable under the sticky header when the viewport becomes short.
- Keep the decorative atmosphere static on small or touch screens and NFT detail pages. Animated artwork remains intact; repeatedly repainting both it and the blurred decoration creates avoidable long tasks.

Run `BASE_URL=http://127.0.0.1:<preview-port> npm run test:mobile`. Use `MOBILE_BROWSERS=chromium,firefox,webkit` for all engines; `MOBILE_WIDTHS` and `MOBILE_OUTPUT` select the viewport matrix and evidence directory. Browser emulation does not replace testing a physical phone's software keyboard.
