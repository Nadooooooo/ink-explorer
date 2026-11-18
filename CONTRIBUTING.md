# Contributing to Ink Explorer

Documentation, translations, accessibility improvements, bug reports and code changes are welcome. You can run the explorer against public indexers with a local browser. [Quick start](README.md#quick-start)

## Pick a change

Look for an existing issue, including issues labelled `good first issue` or `help wanted`. Use Discussions for setup questions and early ideas when it is available. For a substantial change, agree on the scope in the issue before implementation. For vulnerabilities, use the private reporting procedure. [Security policy](SECURITY.md)

## Find the source

| Change | Start here |
| --- | --- |
| Routes, navigation and page families | [App](src/App.tsx), [navigation](src/Navigation.tsx), [explorer link](src/ExplorerLink.tsx) |
| Indexed history, fetch and retry | [API requests](src/api-request.ts), [network selection](src/network.ts), [Node server](server/server.mjs) |
| Route metadata and crawlable documents | [Route parser](src/page-seo.ts), [page metadata](src/page-metadata.ts), [document renderer](server/page-document.mjs) |
| Layout and design tokens | [Stylesheet import order](src/main.tsx), [design system](docs/DESIGN_SYSTEM.md) |
| Translations | [Translation catalogue](src/i18n.ts), [catalogue generator](scripts/generate-locales.mjs) |
| Contract writes and RPC boundaries | [Contract interaction](src/ContractInteraction.tsx), [RPC proxy](server/contract-rpc.mjs) |

Read the architecture notes before changing a data source, network boundary or startup behavior. Keep components and tests focused. Use comments to explain why an invariant matters when the code alone cannot express it, such as the chain identity, cache lifetime, timer cleanup or the distinction between locally observed and indexed data. Let names explain routine operations. [Architecture](docs/ARCHITECTURE.md)

Write project guidance in English. Add user-facing copy to the relevant catalogue source and use named placeholders for values that move in translation. Regenerate the browser catalogues with `node scripts/generate-locales.mjs`. Run the layout and localization suites when the copy affects a control. [Translation flow](docs/ARCHITECTURE.md#translations-and-styles)

## Verify a change

Run `npm test` for the default checks. The README lists the browsers required to build and to run browser tests. For a UI change, test a narrow phone and a desktop viewport and exercise the main controls with a keyboard. For contract and data changes, use the relevant deterministic tests before a live verification. [Quick start](README.md#quick-start) · [Release test protocol](docs/TEST_PROTOCOL.md)

Keep reports and screenshots in the ignored directories. Share only the evidence the reviewer needs and remove wallet activity, private URLs and personal information. Browser suites can discover sample records from the live index; the same record may change across runs.

## Open a pull request

Base a short-lived branch on the latest upstream `main`. Use a name such as `fix/nft-preview`, `feat/token-filter` or `docs/local-setup`. Keep one purpose per branch. Fork the repository for outside contributions and open the pull request against upstream `main`.

Describe the user-visible result, link the issue and list the checks you actually ran. For a visual change, include the tested browser and viewport sizes. CI runs the dependency audit after the build and test steps so each result is visible. The job fails on a high or critical advisory. [CI workflow](.github/workflows/ci.yml) · [Release test protocol](docs/TEST_PROTOCOL.md)

Keep changes to the canonical `main` branch in reviewed pull requests. A push to `main` in the canonical repository triggers the deployment mirror workflow. Maintainers coordinate publication and choose which build to release. [Mirror workflow](.github/workflows/private-mirror.yml) · [Release checklist](docs/OPEN_SOURCE_RELEASE.md)

By participating, you agree to the code of conduct. Contributions are licensed under MIT. [Code of conduct](CODE_OF_CONDUCT.md) · [MIT License](LICENSE)
