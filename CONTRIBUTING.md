# Contributing to Ink Explorer

Thanks for helping make Ink chain data easier to inspect. Documentation, bug reports, translations, accessibility fixes and code changes are all welcome. You do not need to run an Ink node to make a useful contribution.

## Find a place to start

- Check existing issues before opening a new one. Issues labelled `good first issue` or `help wanted` are intended as starting points when available.
- Small documentation corrections, reproducible UI bugs and test improvements are good first changes. If you have an idea without an issue, open a feature request before investing in a large implementation.
- Use GitHub Discussions for setup questions and ideas that are not yet actionable issues.
- For security problems, follow [the security policy](SECURITY.md). Do not include exploit details, private keys or personal data in a public issue.
- Comment on an issue before starting substantial work so maintainers and other contributors can coordinate.

## Run the project locally

Use Node.js 22.12 or newer and npm. Chrome is needed only for browser suites.

```bash
git clone https://github.com/Nadooooooo/ink-explorer.git
cd ink-explorer
npm ci --include=dev
cp .env.example .env
npm run build
npm start
```

Open `http://127.0.0.1:4188`. The default public Blockscout services provide indexed history. Local OP-Reth and OP Node endpoints are optional; the network-health panel shows them as unavailable when they are absent. Set local paths and RPC URLs only in `.env`, never in committed examples. For Sepolia, see [the running and fork guide](docs/FORKING.md).

## Choose the right file

| Change | Start here |
| --- | --- |
| Routes, page state and tables | `src/App.tsx` |
| Labels and translations | `src/i18n.ts` |
| Layout and responsive styles | `src/styles.css`, `src/contracts.css` |
| API proxy, cache and node checks | `server/server.mjs` |
| Contract calls and wallet interaction | `src/ContractInteraction.tsx`, `server/contract-rpc.mjs` |
| HTTP and WebSocket behavior | `docs/API.md` |

Read [the architecture notes](docs/ARCHITECTURE.md) before changing a data source or security boundary. Keep a change focused; when adding a substantial UI feature, prefer a small component over another large section in `src/App.tsx`.

## Check your change

For code changes, run `npm run check` and `npm run build`. Run `npm run test:node-readiness` when changing node status. Start the built server before `npm run test:security` or browser suites. Run the checks relevant to the area you changed: `test:ui`, `test:a11y`, `test:i18n`, `test:responsive` and `test:contracts` are available. Browser suites need Chrome; some use live upstream data or local nodes. Explain in the pull request which checks you ran and which you could not run.

For a new route or control, cover its main interaction and keyboard behavior. Check a narrow phone viewport and a desktop viewport for overflow. New navigation or entity labels should start in English and be reflected in `src/i18n.ts`. Label external data and preserve the distinction between indexed history and local node health.

Browser scripts use a public Ink NFT contract and select a holder from live indexed data at runtime. The selected address can change; keep captured pages under the ignored `screenshots/` folder and do not commit account-specific fixtures.

## Open a pull request

Fork the repository, make a branch for one change, and open a pull request against `main`. Describe the user-visible result, link the related issue, and include screenshots only when they help explain a visual change. Remove account names, wallet activity, hostnames, local paths and other private details from screenshots and logs. Update documentation when changing behavior, API routes or environment variables.

Maintainers may ask for a smaller scope or additional checks. By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md). Contributions to the repository are licensed under [MIT](LICENSE).
